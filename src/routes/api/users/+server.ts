import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { users, contributions } from '$lib/server/db/schema';
import { eq, sql, desc, and } from 'drizzle-orm';
import {
	createSuccessResponse,
	createErrorResponse,
	API_ERROR_CODES,
	type CreateUserRequest
} from '$lib/types';
import { fetchContributions, parseGitHubNodeId, GitHubApiError } from '$lib/server/github';
import { invalidateLeaderboardCache, deleteCached, statsKey } from '$lib/server/cache';
import { checkRateLimit, rateLimitKey, RATE_LIMITS } from '$lib/server/ratelimit';

// Validation patterns
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const TWITTER_HANDLE_REGEX = /^[a-zA-Z0-9_]{1,15}$/;

/**
 * Validate GitHub username format
 */
function isValidGitHubUsername(username: string): boolean {
	return GITHUB_USERNAME_REGEX.test(username);
}

/**
 * Validate Twitter handle format
 */
function isValidTwitterHandle(handle: string): boolean {
	return TWITTER_HANDLE_REGEX.test(handle);
}

/**
 * Calculate user's rank based on total contributions
 */
async function calculateUserRank(db: ReturnType<typeof createDb>, userId: string): Promise<number> {
	const now = new Date();
	const todayStr = now.toISOString().split('T')[0];

	// Get all users with their today's contributions, ordered by total
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

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	// Rate limit check - before any processing
	const kv = platform!.env.KV;
	const clientIp = getClientAddress();
	const rateLimitResult = await checkRateLimit(
		kv,
		rateLimitKey(clientIp, 'register'),
		RATE_LIMITS.REGISTER.limit,
		RATE_LIMITS.REGISTER.windowSeconds
	);

	if (!rateLimitResult.allowed) {
		return json(
			createErrorResponse(
				API_ERROR_CODES.RATE_LIMITED,
				`Rate limit exceeded. Try again in ${Math.ceil(rateLimitResult.resetIn / 60)} minutes.`
			),
			{
				status: 429,
				headers: {
					'Retry-After': rateLimitResult.resetIn.toString(),
					'X-RateLimit-Limit': RATE_LIMITS.REGISTER.limit.toString(),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': Math.ceil(Date.now() / 1000 + rateLimitResult.resetIn).toString()
				}
			}
		);
	}

	// Parse request body
	let body: CreateUserRequest;
	try {
		body = await request.json();
	} catch {
		return json(createErrorResponse(API_ERROR_CODES.INVALID_USERNAME, 'Invalid JSON body'), {
			status: 400
		});
	}

	const { github_username, twitter_handle } = body;

	// Validate github_username is present
	if (!github_username || typeof github_username !== 'string') {
		return json(
			createErrorResponse(API_ERROR_CODES.INVALID_USERNAME, 'GitHub username is required'),
			{ status: 400 }
		);
	}

	// Validate github_username format
	if (!isValidGitHubUsername(github_username)) {
		return json(
			createErrorResponse(
				API_ERROR_CODES.INVALID_USERNAME,
				'Invalid GitHub username format. Must be 1-39 characters, alphanumeric or hyphen, cannot start/end with hyphen'
			),
			{ status: 400 }
		);
	}

	// Validate twitter_handle format if provided
	if (twitter_handle !== undefined && twitter_handle !== null && twitter_handle !== '') {
		if (typeof twitter_handle !== 'string' || !isValidTwitterHandle(twitter_handle)) {
			return json(
				createErrorResponse(
					API_ERROR_CODES.INVALID_TWITTER,
					'Invalid Twitter handle format. Must be 1-15 characters, alphanumeric or underscore'
				),
				{ status: 400 }
			);
		}
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
		return json(
			createErrorResponse(
				API_ERROR_CODES.USER_ALREADY_EXISTS,
				`User '${github_username}' is already registered`
			),
			{ status: 409 }
		);
	}

	// Fetch user data and contributions from GitHub
	try {
		const githubData = await fetchContributions(github_username, githubToken);

		// Parse GitHub numeric ID from node ID
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
					commit_count: day.contributionCount, // Simplified - treating all as commits
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

		// Invalidate cache after successful registration
		await Promise.all([invalidateLeaderboardCache(kv), deleteCached(kv, statsKey())]);

		return json(
			createSuccessResponse({
				id: insertedUser.id,
				github_username: insertedUser.github_username,
				display_name: insertedUser.display_name,
				avatar_url: insertedUser.avatar_url,
				twitter_handle: insertedUser.twitter_handle,
				rank,
				contributions: githubData.contributions.totalContributions
			}),
			{ status: 201 }
		);
	} catch (error) {
		if (error instanceof GitHubApiError) {
			if (error.type === 'NOT_FOUND') {
				return json(
					createErrorResponse(
						API_ERROR_CODES.GITHUB_USER_NOT_FOUND,
						`GitHub user '${github_username}' not found`
					),
					{ status: 404 }
				);
			}
			if (error.type === 'RATE_LIMITED') {
				return json(
					createErrorResponse(API_ERROR_CODES.RATE_LIMITED, 'GitHub API rate limit exceeded'),
					{ status: 429 }
				);
			}
			if (error.type === 'UNAUTHORIZED') {
				return json(
					createErrorResponse(API_ERROR_CODES.GITHUB_API_ERROR, 'GitHub API authentication error'),
					{ status: 500 }
				);
			}
		}

		console.error('User registration error:', error);
		return json(createErrorResponse(API_ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred'), {
			status: 500
		});
	}
};
