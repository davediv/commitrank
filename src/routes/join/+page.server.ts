import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { createDb } from '$lib/server/db';
import { users, contributions } from '$lib/server/db/schema';
import { eq, sql, desc, and } from 'drizzle-orm';
import { API_ERROR_CODES } from '$lib/types';
import { isValidGitHubUsername, isValidTwitterHandle } from '$lib/validation';
import { fetchContributions, parseGitHubNodeId, GitHubApiError } from '$lib/server/github';
import { invalidateLeaderboardCache, deleteCached, statsKey } from '$lib/server/cache';
import { checkRateLimit, rateLimitKey, RATE_LIMITS } from '$lib/server/ratelimit';

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

			// Insert contribution data for each day using multi-row inserts
			// D1/SQLite has a 999 parameter limit per query and per batch
			// With 7 columns, we can safely insert ~100 rows per statement
			// Execute each insert separately to avoid batch variable limits
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
					// Production D1 supports up to 999 variables per statement
					// Local D1 dev (miniflare) has stricter limits (~80 vars max)
					// With 8 columns per row: production=100 rows (800 vars), dev=10 rows (80 vars)
					const isProduction = platform?.env?.ENVIRONMENT === 'production';
					const CHUNK_SIZE = isProduction ? 100 : 10;

					for (let i = 0; i < contributionValues.length; i += CHUNK_SIZE) {
						const chunk = contributionValues.slice(i, i + CHUNK_SIZE);
						await db.insert(contributions).values(chunk);
					}
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
			// Re-throw redirects - they're not errors, they're control flow
			if (isRedirect(error)) {
				throw error;
			}

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
