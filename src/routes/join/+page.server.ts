import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { createDb } from '$lib/server/db';
import { users, contributions } from '$lib/server/db/schema';
import { eq, sql, desc, and } from 'drizzle-orm';
import { API_ERROR_CODES } from '$lib/types';
import { fetchContributions, parseGitHubNodeId, GitHubApiError } from '$lib/server/github';
import { invalidateLeaderboardCache, deleteCached, statsKey } from '$lib/server/cache';
import { checkRateLimit, rateLimitKey, RATE_LIMITS } from '$lib/server/ratelimit';

// Validation patterns
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const TWITTER_HANDLE_REGEX = /^[a-zA-Z0-9_]{1,15}$/;

function isValidGitHubUsername(username: string): boolean {
	return GITHUB_USERNAME_REGEX.test(username);
}

function isValidTwitterHandle(handle: string): boolean {
	return TWITTER_HANDLE_REGEX.test(handle);
}

async function calculateUserRank(db: ReturnType<typeof createDb>, userId: string): Promise<number> {
	const now = new Date();
	const todayStr = now.toISOString().split('T')[0];

	const rankings = await db
		.select({
			user_id: users.id,
			total: sql<number>`COALESCE(SUM(${contributions.total_contributions}), 0)`.as('total')
		})
		.from(users)
		.leftJoin(
			contributions,
			and(eq(contributions.user_id, users.id), eq(contributions.date, todayStr))
		)
		.groupBy(users.id)
		.orderBy(desc(sql`total`));

	const rank = rankings.findIndex((r) => r.user_id === userId) + 1;
	return rank || 0;
}

export const actions: Actions = {
	default: async ({ request, platform, getClientAddress, cookies }) => {
		// Rate limit check
		const kv = platform!.env.KV;
		const clientIp = getClientAddress();
		const rateLimitResult = await checkRateLimit(
			kv,
			rateLimitKey(clientIp, 'register'),
			RATE_LIMITS.REGISTER.limit,
			RATE_LIMITS.REGISTER.windowSeconds
		);

		if (!rateLimitResult.allowed) {
			return fail(429, {
				error: API_ERROR_CODES.RATE_LIMITED,
				message: `Rate limit exceeded. Try again in ${Math.ceil(rateLimitResult.resetIn / 60)} minutes.`
			});
		}

		// Parse form data
		const formData = await request.formData();
		const github_username = formData.get('github_username')?.toString().trim() || '';
		const twitter_handle = formData.get('twitter_handle')?.toString().trim() || '';

		// Validate github_username is present
		if (!github_username) {
			return fail(400, {
				error: API_ERROR_CODES.INVALID_USERNAME,
				message: 'GitHub username is required',
				github_username,
				twitter_handle
			});
		}

		// Validate github_username format
		if (!isValidGitHubUsername(github_username)) {
			return fail(400, {
				error: API_ERROR_CODES.INVALID_USERNAME,
				message:
					'Invalid GitHub username format. Must be 1-39 characters, alphanumeric or hyphen, cannot start/end with hyphen',
				github_username,
				twitter_handle
			});
		}

		// Validate twitter_handle format if provided
		if (twitter_handle && !isValidTwitterHandle(twitter_handle)) {
			return fail(400, {
				error: API_ERROR_CODES.INVALID_TWITTER,
				message:
					'Invalid Twitter handle format. Must be 1-15 characters, alphanumeric or underscore',
				github_username,
				twitter_handle
			});
		}

		const db = createDb(platform!.env.DB);
		const githubToken = platform!.env.GITHUB_TOKEN;

		// Check if user already exists
		const existingUser = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.github_username, github_username.toLowerCase()))
			.limit(1);

		if (existingUser.length > 0) {
			return fail(409, {
				error: API_ERROR_CODES.USER_ALREADY_EXISTS,
				message: `User '${github_username}' is already registered`,
				github_username,
				twitter_handle
			});
		}

		// Fetch user data and contributions from GitHub
		try {
			const githubData = await fetchContributions(github_username, githubToken);
			const githubId = parseGitHubNodeId(githubData.user.id);

			// Insert new user
			const newUser = await db
				.insert(users)
				.values({
					github_username: githubData.user.login,
					github_id: githubId,
					display_name: githubData.user.name,
					avatar_url: githubData.user.avatarUrl,
					bio: githubData.user.bio,
					location: githubData.user.location,
					company: githubData.user.company,
					blog: githubData.user.websiteUrl,
					twitter_handle: twitter_handle || githubData.user.twitterUsername || null,
					public_repos: githubData.user.repositories,
					followers: githubData.user.followers,
					following: githubData.user.following,
					github_created_at: githubData.user.createdAt
				})
				.returning();

			const insertedUser = newUser[0];

			// Insert contribution data for each day
			if (githubData.contributions.days.length > 0) {
				const contributionValues = githubData.contributions.days
					.filter((day) => day.contributionCount > 0)
					.map((day) => ({
						user_id: insertedUser.id,
						date: day.date,
						commit_count: day.contributionCount,
						pr_count: 0,
						issue_count: 0,
						review_count: 0,
						total_contributions: day.contributionCount
					}));

				if (contributionValues.length > 0) {
					await db.insert(contributions).values(contributionValues);
				}
			}

			// Calculate initial rank
			const rank = await calculateUserRank(db, insertedUser.id);

			// Invalidate cache
			await Promise.all([invalidateLeaderboardCache(kv), deleteCached(kv, statsKey())]);

			// Store success info in a cookie for display after redirect
			cookies.set(
				'join_success',
				JSON.stringify({
					username: insertedUser.github_username,
					rank,
					contributions: githubData.contributions.totalContributions
				}),
				{
					path: '/',
					maxAge: 60, // 1 minute
					httpOnly: false
				}
			);

			// Redirect to homepage with success
			redirect(303, '/');
		} catch (error) {
			if (error instanceof GitHubApiError) {
				if (error.type === 'NOT_FOUND') {
					return fail(404, {
						error: API_ERROR_CODES.GITHUB_USER_NOT_FOUND,
						message: `GitHub user '${github_username}' not found`,
						github_username,
						twitter_handle
					});
				}
				if (error.type === 'RATE_LIMITED') {
					return fail(429, {
						error: API_ERROR_CODES.RATE_LIMITED,
						message: 'GitHub API rate limit exceeded. Please try again later.',
						github_username,
						twitter_handle
					});
				}
				if (error.type === 'UNAUTHORIZED') {
					return fail(500, {
						error: API_ERROR_CODES.GITHUB_API_ERROR,
						message: 'GitHub API authentication error',
						github_username,
						twitter_handle
					});
				}
			}

			console.error('User registration error:', error);
			return fail(500, {
				error: API_ERROR_CODES.INTERNAL_ERROR,
				message: 'An internal error occurred. Please try again later.',
				github_username,
				twitter_handle
			});
		}
	}
};
