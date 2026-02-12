import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./lib/server/sync', () => ({
	runScheduledSync: vi.fn()
}));

import worker from './sync-worker';
import { runScheduledSync } from './lib/server/sync';

describe('sync-worker scheduled handler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('invokes runScheduledSync with parsed config and scheduled metadata', async () => {
		vi.mocked(runScheduledSync).mockResolvedValue({
			totalUsersInDb: 10,
			batchSize: 75,
			syncedCount: 10,
			successCount: 9,
			failureCount: 1,
			results: [],
			durationMs: 1234
		});

		await worker.scheduled?.(
			{
				cron: '0 * * * *',
				scheduledTime: Date.parse('2026-02-12T12:00:00.000Z')
			} as ScheduledController,
			{
				DB: {} as D1Database,
				KV: {} as KVNamespace<string>,
				GITHUB_TOKEN: 'token',
				SYNC_BATCH_SIZE: '75',
				SYNC_REQUEST_DELAY_MS: '100'
			},
			{} as ExecutionContext
		);

		expect(runScheduledSync).toHaveBeenCalledTimes(1);
		expect(runScheduledSync).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'token',
			expect.objectContaining({
				trigger: 'scheduled',
				cron: '0 * * * *',
				scheduledTime: '2026-02-12T12:00:00.000Z',
				batchSize: 75,
				requestDelayMs: 100
			})
		);
	});

	it('skips sync when GITHUB_TOKEN is not configured', async () => {
		await worker.scheduled?.(
			{ cron: '0 * * * *', scheduledTime: Date.now() } as ScheduledController,
			{
				DB: {} as D1Database,
				KV: {} as KVNamespace<string>
			},
			{} as ExecutionContext
		);

		expect(runScheduledSync).not.toHaveBeenCalled();
	});
});
