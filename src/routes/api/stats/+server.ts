import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { users, contributions } from '$lib/server/db/schema';
import { sql, gte } from 'drizzle-orm';
import {
	createSuccessResponse,
	createErrorResponse,
	API_ERROR_CODES,
	type StatsResponse
} from '$lib/types';
import { getCached, setCached, statsKey, CACHE_TTL } from '$lib/server/cache';
import { calculateNextHourlySync } from '$lib/server/sync-config';

export const GET: RequestHandler = async ({ platform }) => {
	try {
		const kv = platform!.env.KV;
		const cacheKey = statsKey();

		// Check cache first
		const cachedStats = await getCached<StatsResponse>(kv, cacheKey);
		if (cachedStats) {
			return json(createSuccessResponse(cachedStats, { cached: true }));
		}

		// Cache miss - query database
		const db = createDb(platform!.env.DB);

		const now = new Date();
		const todayStr = now.toISOString().split('T')[0];
		const yearAgo = new Date(now);
		yearAgo.setFullYear(yearAgo.getFullYear() - 1);
		yearAgo.setDate(yearAgo.getDate() + 1);
		const yearAgoStr = yearAgo.toISOString().split('T')[0];

		// Run queries in parallel
		const [totalUsersResult, todayContribResult, yearContribResult, lastSyncResult] =
			await Promise.all([
				// Total users count
				db.select({ count: sql<number>`COUNT(*)` }).from(users),

				// Total contributions today
				db
					.select({
						total: sql<number>`COALESCE(SUM(${contributions.total_contributions}), 0)`
					})
					.from(contributions)
					.where(sql`${contributions.date} = ${todayStr}`),

				// Total contributions in the past year
				db
					.select({
						total: sql<number>`COALESCE(SUM(${contributions.total_contributions}), 0)`
					})
					.from(contributions)
					.where(gte(contributions.date, yearAgoStr)),

				// Last sync (most recent updated_at from users)
				db.select({ updated_at: sql<string>`MAX(${users.updated_at})` }).from(users)
			]);

		const stats: StatsResponse = {
			total_users: Number(totalUsersResult[0]?.count || 0),
			total_contributions_today: Number(todayContribResult[0]?.total || 0),
			total_contributions_year: Number(yearContribResult[0]?.total || 0),
			last_sync: lastSyncResult[0]?.updated_at || null,
			next_sync: calculateNextHourlySync()
		};

		// Cache the response
		await setCached(kv, cacheKey, stats, CACHE_TTL.STATS);

		return json(createSuccessResponse(stats, { cached: false }));
	} catch (error) {
		console.error('Stats API error:', error);
		return json(createErrorResponse(API_ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred'), {
			status: 500
		});
	}
};
