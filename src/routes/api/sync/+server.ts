/**
 * Internal API endpoint for scheduled sync
 *
 * This endpoint triggers the sync of all user contributions.
 * It's designed to be called by Cloudflare Cron Triggers or an external cron service.
 *
 * Security: Protected by CRON_SECRET environment variable.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runScheduledSync } from '$lib/server/sync';

/**
 * GET /api/sync
 *
 * Triggers the scheduled sync for all users.
 * Requires Authorization header with Bearer token matching CRON_SECRET.
 *
 * Can also be triggered by Cloudflare Workers scheduled event via /__scheduled route.
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

	console.log('[Sync API] Starting scheduled sync...');

	try {
		const summary = await runScheduledSync(db, kv, githubToken);

		console.log(
			`[Sync API] Sync completed: ${summary.successCount}/${summary.totalUsers} succeeded in ${Math.round(summary.durationMs / 1000)}s`
		);

		return json({
			success: true,
			summary: {
				totalUsers: summary.totalUsers,
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
