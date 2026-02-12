import { getSyncRuntimeConfig, type SyncConfigEnv } from './lib/server/sync-config';
import { runScheduledSync } from './lib/server/sync';

interface SyncWorkerEnv extends SyncConfigEnv {
	DB: D1Database;
	KV: KVNamespace<string>;
	GITHUB_TOKEN?: string;
	ENVIRONMENT?: string;
}

export default {
	async scheduled(
		controller: ScheduledController,
		env: SyncWorkerEnv,
		ctx: ExecutionContext
	): Promise<void> {
		void ctx;
		const runtimeConfig = getSyncRuntimeConfig(env);
		const scheduledTime = new Date(controller.scheduledTime).toISOString();

		console.log(
			JSON.stringify({
				event: 'sync_schedule_triggered',
				cron: controller.cron,
				scheduledTime,
				batchSize: runtimeConfig.batchSize,
				requestDelayMs: runtimeConfig.requestDelayMs
			})
		);

		if (!env.GITHUB_TOKEN) {
			console.error('[Sync Worker] GITHUB_TOKEN not configured');
			return;
		}

		try {
			const summary = await runScheduledSync(env.DB, env.KV, env.GITHUB_TOKEN, {
				...runtimeConfig,
				trigger: 'scheduled',
				cron: controller.cron,
				scheduledTime
			});

			console.log(
				JSON.stringify({
					event: 'sync_schedule_complete',
					cron: controller.cron,
					scheduledTime,
					totalUsersInDb: summary.totalUsersInDb,
					syncedCount: summary.syncedCount,
					successCount: summary.successCount,
					failureCount: summary.failureCount,
					durationMs: summary.durationMs,
					batchSize: summary.batchSize
				})
			);
		} catch (error) {
			console.error(
				JSON.stringify({
					event: 'sync_schedule_failed',
					cron: controller.cron,
					scheduledTime,
					error: error instanceof Error ? error.message : 'Unknown sync error'
				})
			);
			throw error;
		}
	}
} satisfies ExportedHandler<SyncWorkerEnv>;
