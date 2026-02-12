/**
 * Internal API endpoint for scheduled sync
 *
 * This endpoint triggers the batched sync of user contributions.
 * It's kept as a manual/admin fallback trigger.
 * Uses batching to prevent Worker CPU timeout on large user bases.
 *
 * Security: Protected by CRON_SECRET environment variable.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runScheduledSync } from '$lib/server/sync';
import { getSyncRuntimeConfig } from '$lib/server/sync-config';

/**
 * GET /api/sync
 *
 * Triggers the batched sync for users (oldest updated first).
 * Requires Authorization header with Bearer token matching CRON_SECRET.
 * Intended for manual/admin fallback triggering.
 */
export const GET: RequestHandler = async ({ request, platform }) => {
	// Verify authorization
	const authHeader = request.headers.get('Authorization');
	const cronSecret = platform?.env.CRON_SECRET;

	// Allow unauthenticated in development
	const isDev = platform?.env.ENVIRONMENT === 'development';

	if (!isDev) {
		if (!cronSecret) {
			console.error('[Sync API] CRON_SECRET not configured');
			throw error(500, 'Server misconfigured');
		}

		if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
			console.warn('[Sync API] Unauthorized sync attempt');
			throw error(401, 'Unauthorized');
		}
	}

	const db = platform!.env.DB;
	const kv = platform!.env.KV;
	const githubToken = platform!.env.GITHUB_TOKEN;

	if (!githubToken) {
		console.error('[Sync API] GITHUB_TOKEN not configured');
		throw error(500, 'GitHub token not configured');
	}

	console.log('[Sync API] Starting manual sync...');

	try {
		const syncConfig = getSyncRuntimeConfig(platform?.env);
		const summary = await runScheduledSync(db, kv, githubToken, {
			...syncConfig,
			trigger: 'api'
		});

		console.log(
			JSON.stringify({
				event: 'sync_api_complete',
				successCount: summary.successCount,
				syncedCount: summary.syncedCount,
				failureCount: summary.failureCount,
				durationMs: summary.durationMs,
				totalUsersInDb: summary.totalUsersInDb,
				batchSize: summary.batchSize
			})
		);

		return json({
			success: true,
			summary: {
				totalUsersInDb: summary.totalUsersInDb,
				batchSize: summary.batchSize,
				syncedCount: summary.syncedCount,
				successCount: summary.successCount,
				failureCount: summary.failureCount,
				durationMs: summary.durationMs
			}
		});
	} catch (err) {
		console.error('[Sync API] Sync failed:', err);
		throw error(500, err instanceof Error ? err.message : 'Sync failed');
	}
};

/**
 * POST /api/sync
 *
 * Alternative method for triggering sync.
 * Same authentication requirements as GET.
 */
export const POST: RequestHandler = GET;
