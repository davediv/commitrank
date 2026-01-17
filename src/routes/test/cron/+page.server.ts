/**
 * Test page for manually triggering cron sync
 *
 * This page allows developers to test the cron job without waiting
 * for the scheduled time. Only accessible in non-production environments.
 */

import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { runScheduledSync } from '$lib/server/sync';

export const load: PageServerLoad = async ({ platform }) => {
	const environment = platform?.env.ENVIRONMENT || 'production';

	// Block access in production
	if (environment === 'production') {
		redirect(302, '/');
	}

	return {
		environment
	};
};

export const actions: Actions = {
	sync: async ({ platform }) => {
		const environment = platform?.env.ENVIRONMENT || 'production';

		// Block in production
		if (environment === 'production') {
			throw error(403, 'Sync test not available in production');
		}

		const db = platform!.env.DB;
		const kv = platform!.env.KV;
		const githubToken = platform!.env.GITHUB_TOKEN;

		if (!githubToken) {
			return {
				success: false,
				error: 'GITHUB_TOKEN not configured'
			};
		}

		try {
			const summary = await runScheduledSync(db, kv, githubToken);

			return {
				success: true,
				summary: {
					totalUsersInDb: summary.totalUsersInDb,
					batchSize: summary.batchSize,
					syncedCount: summary.syncedCount,
					successCount: summary.successCount,
					failureCount: summary.failureCount,
					durationMs: summary.durationMs,
					results: summary.results.map((r) => ({
						username: r.username,
						success: r.success,
						error: r.error,
						contributionsUpdated: r.contributionsUpdated
					}))
				},
				timestamp: new Date().toISOString()
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : 'Unknown error'
			};
		}
	}
};
