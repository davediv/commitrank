import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import {
	createSuccessResponse,
	createErrorResponse,
	API_ERROR_CODES,
	type StatsResponse
} from '$lib/types';
import { getCached, setCached, statsKey, CACHE_TTL } from '$lib/server/cache';
import { queryStats } from '$lib/server/stats';
import { calculateNextHourlySync } from '$lib/server/sync-config';

export const GET: RequestHandler = async ({ platform }) => {
	try {
		const kv = platform!.env.KV;
		const cacheKey = statsKey();

		// Check cache first
		const cachedStats = await getCached<StatsResponse>(kv, cacheKey);
		if (cachedStats) {
			return json(
				createSuccessResponse(
					{ ...cachedStats, next_sync: calculateNextHourlySync() },
					{ cached: true }
				)
			);
		}

		// Cache miss - query database
		const db = createDb(platform!.env.DB);

		const stats = await queryStats(db);

		const cacheWrite = setCached(kv, cacheKey, stats, CACHE_TTL.STATS);
		if (platform?.ctx) {
			platform.ctx.waitUntil(cacheWrite);
		} else {
			await cacheWrite;
		}

		return json(createSuccessResponse(stats, { cached: false }));
	} catch (error) {
		console.error('Stats API error:', error);
		return json(createErrorResponse(API_ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred'), {
			status: 500
		});
	}
};
