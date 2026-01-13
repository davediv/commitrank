import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { users, contributions } from '$lib/server/db/schema';
import { eq, sql, and, gte, desc } from 'drizzle-orm';
import {
	createSuccessResponse,
	createErrorResponse,
	API_ERROR_CODES,
	type UserProfile,
	type PeriodContribution,
	type ContributionPeriod,
	type UpdateUserRequest
} from '$lib/types';
import { isValidGitHubUsername, TWITTER_HANDLE_REGEX } from '$lib/validation';
import { getCached, setCached, deleteCached, userKey, CACHE_TTL } from '$lib/server/cache';
import { checkRateLimit, rateLimitKey, RATE_LIMITS } from '$lib/server/ratelimit';

const PERIODS: ContributionPeriod[] = ['today', '7days', '30days', 'year'];

/**
 * Get date range for contribution period
 */
function getDateRange(period: ContributionPeriod): { startDate: string; endDate: string } {
	const now = new Date();
	const endDate = now.toISOString().split('T')[0];

	let startDate: string;
	if (period === 'today') {
		startDate = endDate;
	} else if (period === '7days') {
		const weekAgo = new Date(now);
		weekAgo.setDate(weekAgo.getDate() - 6);
		startDate = weekAgo.toISOString().split('T')[0];
	} else if (period === '30days') {
		const monthAgo = new Date(now);
		monthAgo.setDate(monthAgo.getDate() - 29);
		startDate = monthAgo.toISOString().split('T')[0];
	} else {
		const yearAgo = new Date(now);
		yearAgo.setFullYear(yearAgo.getFullYear() - 1);
		yearAgo.setDate(yearAgo.getDate() + 1);
		startDate = yearAgo.toISOString().split('T')[0];
	}

	return { startDate, endDate };
}

export const GET: RequestHandler = async ({ params, platform }) => {
	const { username } = params;

	// Validate username format
	if (!username || !isValidGitHubUsername(username)) {
		return json(
			createErrorResponse(API_ERROR_CODES.INVALID_USERNAME, 'Invalid GitHub username format'),
			{ status: 400 }
		);
	}

	try {
		const kv = platform!.env.KV;
		const cacheKey = userKey(username);

		// Check cache first
		const cachedProfile = await getCached<UserProfile>(kv, cacheKey);
		if (cachedProfile) {
			return json(createSuccessResponse(cachedProfile, { cached: true }));
		}

		// Cache miss - query database
		const db = createDb(platform!.env.DB);

		// Fetch user by username
		const userResult = await db
			.select()
			.from(users)
			.where(eq(users.github_username, username))
			.limit(1);

		if (userResult.length === 0) {
			return json(
				createErrorResponse(API_ERROR_CODES.USER_NOT_FOUND, `User '${username}' not found`),
				{ status: 404 }
			);
		}

		const user = userResult[0];

		// Fetch contributions and ranks for all periods
		const periodContributions: PeriodContribution[] = await Promise.all(
			PERIODS.map(async (period) => {
				const { startDate, endDate } = getDateRange(period);

				// Get user's total contributions for this period
				const contribResult = await db
					.select({
						total: sql<number>`COALESCE(SUM(${contributions.total_contributions}), 0)`
					})
					.from(contributions)
					.where(
						and(
							eq(contributions.user_id, user.id),
							gte(contributions.date, startDate),
							sql`${contributions.date} <= ${endDate}`
						)
					);

				const userContributions = Number(contribResult[0]?.total || 0);

				// Get user's rank for this period
				const rankResult = await db
					.select({
						user_id: users.id,
						total: sql<number>`COALESCE(SUM(${contributions.total_contributions}), 0)`.as('total')
					})
					.from(users)
					.leftJoin(
						contributions,
						and(
							eq(contributions.user_id, users.id),
							gte(contributions.date, startDate),
							sql`${contributions.date} <= ${endDate}`
						)
					)
					.groupBy(users.id)
					.orderBy(desc(sql`total`));

				// Find user's position in the rankings
				const rank = rankResult.findIndex((r) => r.user_id === user.id) + 1;

				return {
					period,
					contributions: userContributions,
					rank: rank || 0
				};
			})
		);

		const userProfile: UserProfile = {
			id: parseInt(user.id, 10) || 0,
			github_username: user.github_username,
			github_id: user.github_id,
			display_name: user.display_name,
			avatar_url: user.avatar_url,
			bio: user.bio,
			twitter_handle: user.twitter_handle,
			location: user.location,
			company: user.company,
			blog: user.blog,
			public_repos: user.public_repos ?? 0,
			followers: user.followers ?? 0,
			following: user.following ?? 0,
			github_created_at: user.github_created_at ?? '',
			created_at: user.created_at,
			updated_at: user.updated_at,
			contributions: periodContributions
		};

		// Cache the response
		await setCached(kv, cacheKey, userProfile, CACHE_TTL.USER);

		return json(createSuccessResponse(userProfile, { cached: false }));
	} catch (error) {
		console.error('User API error:', error);
		return json(createErrorResponse(API_ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred'), {
			status: 500
		});
	}
};

export const PATCH: RequestHandler = async ({ params, request, platform, getClientAddress }) => {
	const { username } = params;

	// Validate username format
	if (!username || !isValidGitHubUsername(username)) {
		return json(
			createErrorResponse(API_ERROR_CODES.INVALID_USERNAME, 'Invalid GitHub username format'),
			{ status: 400 }
		);
	}

	// Rate limit check
	const kv = platform!.env.KV;
	const clientIp = getClientAddress();
	const rateLimitResult = await checkRateLimit(
		kv,
		rateLimitKey(clientIp, 'update_user'),
		RATE_LIMITS.UPDATE_USER.limit,
		RATE_LIMITS.UPDATE_USER.windowSeconds
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
					'X-RateLimit-Limit': RATE_LIMITS.UPDATE_USER.limit.toString(),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': Math.ceil(Date.now() / 1000 + rateLimitResult.resetIn).toString()
				}
			}
		);
	}

	// Parse request body
	let body: UpdateUserRequest;
	try {
		body = await request.json();
	} catch {
		return json(createErrorResponse(API_ERROR_CODES.INVALID_TWITTER, 'Invalid JSON body'), {
			status: 400
		});
	}

	const { twitter_handle } = body;

	// Validate twitter_handle format if provided and not null
	if (twitter_handle !== undefined && twitter_handle !== null && twitter_handle !== '') {
		if (typeof twitter_handle !== 'string' || !TWITTER_HANDLE_REGEX.test(twitter_handle)) {
			return json(
				createErrorResponse(
					API_ERROR_CODES.INVALID_TWITTER,
					'Invalid Twitter handle format. Must be 1-15 characters, alphanumeric or underscore'
				),
				{ status: 400 }
			);
		}
	}

	try {
		const db = createDb(platform!.env.DB);

		// Check if user exists
		const userResult = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.github_username, username))
			.limit(1);

		if (userResult.length === 0) {
			return json(
				createErrorResponse(API_ERROR_CODES.USER_NOT_FOUND, `User '${username}' not found`),
				{ status: 404 }
			);
		}

		// Update user
		const updatedUsers = await db
			.update(users)
			.set({
				twitter_handle: twitter_handle === '' ? null : twitter_handle,
				updated_at: new Date().toISOString()
			})
			.where(eq(users.github_username, username))
			.returning();

		const updatedUser = updatedUsers[0];

		// Invalidate user cache
		await deleteCached(kv, userKey(username));

		return json(
			createSuccessResponse({
				id: updatedUser.id,
				github_username: updatedUser.github_username,
				display_name: updatedUser.display_name,
				avatar_url: updatedUser.avatar_url,
				twitter_handle: updatedUser.twitter_handle,
				updated_at: updatedUser.updated_at
			})
		);
	} catch (error) {
		console.error('User update error:', error);
		return json(createErrorResponse(API_ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred'), {
			status: 500
		});
	}
};
