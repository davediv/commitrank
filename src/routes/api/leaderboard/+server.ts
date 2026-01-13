import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { users, contributions } from '$lib/server/db/schema';
import { eq, sql, desc, and, gte } from 'drizzle-orm';
import {
	createSuccessResponse,
	createErrorResponse,
	API_ERROR_CODES,
	type ContributionPeriod,
	type LeaderboardEntry,
	type LeaderboardResponse
} from '$lib/types';
import { getCached, setCached, leaderboardKey, CACHE_TTL } from '$lib/server/cache';
import { checkRateLimit, rateLimitKey, RATE_LIMITS } from '$lib/server/ratelimit';

const VALID_PERIODS: ContributionPeriod[] = ['today', '7days', '30days', 'year'];
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const DEFAULT_PAGE = 1;

/**
 * Get date range for contribution period
 */
function getDateRange(period: ContributionPeriod): { startDate: string; endDate: string } {
	const now = new Date();
	const endDate = now.toISOString().split('T')[0]; // Today in YYYY-MM-DD

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
		// year
		const yearAgo = new Date(now);
		yearAgo.setFullYear(yearAgo.getFullYear() - 1);
		yearAgo.setDate(yearAgo.getDate() + 1);
		startDate = yearAgo.toISOString().split('T')[0];
	}

	return { startDate, endDate };
}

export const GET: RequestHandler = async ({ url, platform, getClientAddress }) => {
	// Rate limit check
	const kv = platform!.env.KV;
	const clientIp = getClientAddress();
	const rateLimitResult = await checkRateLimit(
		kv,
		rateLimitKey(clientIp, 'leaderboard'),
		RATE_LIMITS.LEADERBOARD.limit,
		RATE_LIMITS.LEADERBOARD.windowSeconds
	);

	if (!rateLimitResult.allowed) {
		return json(
			createErrorResponse(
				API_ERROR_CODES.RATE_LIMITED,
				`Rate limit exceeded. Try again in ${rateLimitResult.resetIn} seconds.`
			),
			{
				status: 429,
				headers: {
					'Retry-After': rateLimitResult.resetIn.toString(),
					'X-RateLimit-Limit': RATE_LIMITS.LEADERBOARD.limit.toString(),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': Math.ceil(Date.now() / 1000 + rateLimitResult.resetIn).toString()
				}
			}
		);
	}

	// Parse query parameters
	const periodParam = url.searchParams.get('period') || 'today';
	const pageParam = url.searchParams.get('page');
	const limitParam = url.searchParams.get('limit');

	// Validate period
	if (!VALID_PERIODS.includes(periodParam as ContributionPeriod)) {
		return json(
			createErrorResponse(
				API_ERROR_CODES.INVALID_PERIOD,
				`Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`
			),
			{ status: 400 }
		);
	}
	const period = periodParam as ContributionPeriod;

	// Parse and validate page
	const page = pageParam ? parseInt(pageParam, 10) : DEFAULT_PAGE;
	if (isNaN(page) || page < 1) {
		return json(
			createErrorResponse(API_ERROR_CODES.INVALID_PAGINATION, 'Page must be a positive integer'),
			{ status: 400 }
		);
	}

	// Parse and validate limit
	let limit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
	if (isNaN(limit) || limit < 1) {
		return json(
			createErrorResponse(API_ERROR_CODES.INVALID_PAGINATION, 'Limit must be a positive integer'),
			{ status: 400 }
		);
	}
	// Enforce maximum limit
	limit = Math.min(limit, MAX_LIMIT);

	try {
		const cacheKey = leaderboardKey(period, page, limit);

		// Check cache first
		const cachedResponse = await getCached<LeaderboardResponse>(kv, cacheKey);
		if (cachedResponse) {
			return json(createSuccessResponse(cachedResponse, { cached: true }));
		}

		// Cache miss - query database
		const db = createDb(platform!.env.DB);
		const { startDate, endDate } = getDateRange(period);
		const offset = (page - 1) * limit;

		// Query for leaderboard with aggregated contributions
		// Only show users who have contributions in the selected period
		const leaderboardQuery = db
			.select({
				github_username: users.github_username,
				display_name: users.display_name,
				avatar_url: users.avatar_url,
				twitter_handle: users.twitter_handle,
				contributions: sql<number>`COALESCE(SUM(${contributions.total_contributions}), 0)`.as(
					'total'
				)
			})
			.from(users)
			.innerJoin(
				contributions,
				and(
					eq(contributions.user_id, users.id),
					gte(contributions.date, startDate),
					sql`${contributions.date} <= ${endDate}`
				)
			)
			.groupBy(users.id)
			.having(sql`total > 0`)
			.orderBy(desc(sql`total`))
			.limit(limit)
			.offset(offset);

		// Query for total count of users with contributions in period
		const countQuery = db
			.select({ count: sql<number>`COUNT(DISTINCT ${users.id})` })
			.from(users)
			.innerJoin(
				contributions,
				and(
					eq(contributions.user_id, users.id),
					gte(contributions.date, startDate),
					sql`${contributions.date} <= ${endDate}`
				)
			);

		// Execute both queries
		const [leaderboardRows, countResult] = await Promise.all([leaderboardQuery, countQuery]);

		const total = countResult[0]?.count || 0;
		const totalPages = Math.ceil(total / limit);

		// Map to LeaderboardEntry with rank
		const leaderboard: LeaderboardEntry[] = leaderboardRows.map((row, index) => ({
			rank: offset + index + 1,
			github_username: row.github_username,
			display_name: row.display_name,
			avatar_url: row.avatar_url,
			twitter_handle: row.twitter_handle,
			contributions: Number(row.contributions)
		}));

		const response: LeaderboardResponse = {
			leaderboard,
			pagination: {
				page,
				limit,
				total,
				totalPages
			}
		};

		// Cache the response
		await setCached(kv, cacheKey, response, CACHE_TTL.LEADERBOARD);

		return json(createSuccessResponse(response, { cached: false }));
	} catch (error) {
		console.error('Leaderboard API error:', error);
		return json(createErrorResponse(API_ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred'), {
			status: 500
		});
	}
};
