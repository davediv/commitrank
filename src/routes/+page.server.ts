import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { users, contributions } from '$lib/server/db/schema';
import { eq, sql, desc, and, gte } from 'drizzle-orm';
import { getCached, setCached, leaderboardKey, CACHE_TTL } from '$lib/server/cache';
import type {
	ContributionPeriod,
	LeaderboardEntry,
	LeaderboardResponse,
	StatsResponse
} from '$lib/types';

const VALID_PERIODS: ContributionPeriod[] = ['today', '7days', '30days', 'year'];
const DEFAULT_LIMIT = 20;

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

/**
 * Calculate next sync time (every 6 hours at 0, 6, 12, 18 UTC)
 */
function calculateNextSync(): string {
	const now = new Date();
	const currentHour = now.getUTCHours();

	const syncHours = [0, 6, 12, 18];
	const nextSyncHour = syncHours.find((h) => h > currentHour) ?? 24 + syncHours[0];

	const nextSync = new Date(now);
	nextSync.setUTCHours(nextSyncHour % 24, 0, 0, 0);

	if (nextSyncHour >= 24) {
		nextSync.setUTCDate(nextSync.getUTCDate() + 1);
	}

	return nextSync.toISOString();
}

export const load: PageServerLoad = async ({ url, platform, setHeaders }) => {
	// Parse query parameters
	const periodParam = url.searchParams.get('period') || 'today';
	const pageParam = url.searchParams.get('page');

	// Validate period
	const period: ContributionPeriod = VALID_PERIODS.includes(periodParam as ContributionPeriod)
		? (periodParam as ContributionPeriod)
		: 'today';

	// Parse page
	const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
	const limit = DEFAULT_LIMIT;

	const kv = platform!.env.KV;
	const cacheKey = leaderboardKey(period, page, limit);

	// Try cache first
	let leaderboardData = await getCached<LeaderboardResponse>(kv, cacheKey);
	const cached = !!leaderboardData;

	if (!leaderboardData) {
		// Cache miss - query database
		const db = createDb(platform!.env.DB);
		const { startDate, endDate } = getDateRange(period);
		const offset = (page - 1) * limit;

		try {
			// Query for leaderboard with aggregated contributions
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
				.leftJoin(
					contributions,
					and(
						eq(contributions.user_id, users.id),
						gte(contributions.date, startDate),
						sql`${contributions.date} <= ${endDate}`
					)
				)
				.groupBy(users.id)
				.orderBy(desc(sql`total`))
				.limit(limit)
				.offset(offset);

			// Query for total count
			const countQuery = db.select({ count: sql<number>`COUNT(*)` }).from(users);

			// Execute both queries
			const [leaderboardRows, countResult] = await Promise.all([leaderboardQuery, countQuery]);

			const total = Number(countResult[0]?.count || 0);
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

			leaderboardData = {
				leaderboard,
				pagination: {
					page,
					limit,
					total,
					totalPages
				}
			};

			// Cache the response
			await setCached(kv, cacheKey, leaderboardData, CACHE_TTL.LEADERBOARD);
		} catch (error) {
			console.error('Leaderboard load error:', error);
			// Return empty data on error
			leaderboardData = {
				leaderboard: [],
				pagination: { page: 1, limit, total: 0, totalPages: 0 }
			};
		}
	}

	// Fetch stats for display
	let stats: StatsResponse | null = null;
	try {
		const db = createDb(platform!.env.DB);
		const now = new Date();
		const todayStr = now.toISOString().split('T')[0];

		const [totalUsersResult, todayContribResult] = await Promise.all([
			db.select({ count: sql<number>`COUNT(*)` }).from(users),
			db
				.select({
					total: sql<number>`COALESCE(SUM(${contributions.total_contributions}), 0)`
				})
				.from(contributions)
				.where(sql`${contributions.date} = ${todayStr}`)
		]);

		stats = {
			total_users: Number(totalUsersResult[0]?.count || 0),
			total_contributions_today: Number(todayContribResult[0]?.total || 0),
			total_contributions_year: 0, // Not needed for display
			last_sync: null,
			next_sync: calculateNextSync()
		};
	} catch {
		// Stats are optional, continue without them
	}

	// Set cache headers
	setHeaders({
		'Cache-Control': cached ? 'public, max-age=60' : 'public, max-age=30'
	});

	return {
		leaderboard: leaderboardData,
		period,
		stats,
		cached
	};
};
