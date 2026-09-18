import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { users, contributions } from '$lib/server/db/schema';
import { eq, sql, desc, and, gte } from 'drizzle-orm';
import { getCached, setCached, leaderboardKey, statsKey, CACHE_TTL } from '$lib/server/cache';
import { queryStats as queryCompleteStats } from '$lib/server/stats';
import { calculateNextHourlySync } from '$lib/server/sync-config';
import type { ContributionPeriod, LeaderboardResponse, StatsResponse } from '$lib/types';

const VALID_PERIODS: ContributionPeriod[] = ['today', '7days', '30days', 'year'];
const DEFAULT_LIMIT = 20;

type Database = ReturnType<typeof createDb>;

interface LoadResult<T> {
	data: T;
	cacheable: boolean;
}

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

async function queryLeaderboard(
	db: Database,
	period: ContributionPeriod,
	page: number,
	limit: number
): Promise<LoadResult<LeaderboardResponse>> {
	const { startDate, endDate } = getDateRange(period);
	const offset = (page - 1) * limit;

	try {
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

		const [leaderboardRows, countResult] = await Promise.all([leaderboardQuery, countQuery]);
		const total = Number(countResult[0]?.count || 0);

		return {
			data: {
				leaderboard: leaderboardRows.map((row, index) => ({
					rank: offset + index + 1,
					github_username: row.github_username,
					display_name: row.display_name,
					avatar_url: row.avatar_url,
					twitter_handle: row.twitter_handle,
					contributions: Number(row.contributions)
				})),
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit)
				}
			},
			cacheable: true
		};
	} catch (error) {
		console.error('Leaderboard load error:', error);
		return {
			data: {
				leaderboard: [],
				pagination: { page: 1, limit, total: 0, totalPages: 0 }
			},
			cacheable: false
		};
	}
}

async function queryStats(db: Database): Promise<LoadResult<StatsResponse | null>> {
	try {
		return { data: await queryCompleteStats(db), cacheable: true };
	} catch (error) {
		console.error('Stats load error:', error);
		return { data: null, cacheable: false };
	}
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

	const appPlatform = platform!;
	const kv = appPlatform.env.KV;
	const cacheKey = leaderboardKey(period, page, limit);
	const statsCacheKey = statsKey();

	// Both cache reads are independent. Starting them together removes a full KV
	// round-trip from the critical rendering path on the common cache-hit case.
	const [cachedLeaderboard, cachedStats] = await Promise.all([
		getCached<LeaderboardResponse>(kv, cacheKey),
		getCached<StatsResponse>(kv, statsCacheKey)
	]);
	const cached = cachedLeaderboard !== null;

	let db: Database | undefined;
	const getDb = () => (db ??= createDb(appPlatform.env.DB));

	// Cache misses also run concurrently instead of serializing leaderboard and
	// stats queries. Stats are cached for the same invalidation cycle as the API.
	const [leaderboardResult, statsResult] = await Promise.all([
		cachedLeaderboard
			? Promise.resolve({ data: cachedLeaderboard, cacheable: false })
			: queryLeaderboard(getDb(), period, page, limit),
		cachedStats
			? Promise.resolve({
					data: { ...cachedStats, next_sync: calculateNextHourlySync() },
					cacheable: false
				})
			: queryStats(getDb())
	]);

	const cacheWrites: Promise<void>[] = [];
	if (!cachedLeaderboard && leaderboardResult.cacheable) {
		cacheWrites.push(setCached(kv, cacheKey, leaderboardResult.data, CACHE_TTL.LEADERBOARD));
	}
	if (!cachedStats && statsResult.cacheable && statsResult.data) {
		cacheWrites.push(setCached(kv, statsCacheKey, statsResult.data, CACHE_TTL.STATS));
	}

	if (cacheWrites.length > 0) {
		const cacheWrite = Promise.all(cacheWrites).then(() => undefined);
		if (appPlatform.ctx) {
			appPlatform.ctx.waitUntil(cacheWrite);
		} else {
			// Unit tests and non-Workers adapters may not provide an execution context.
			await cacheWrite;
		}
	}

	// Set cache headers
	setHeaders({
		'Cache-Control': cached ? 'public, max-age=60' : 'public, max-age=30'
	});

	return {
		leaderboard: leaderboardResult.data,
		period,
		stats: statsResult.data,
		cached
	};
};
