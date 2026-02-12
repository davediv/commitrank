import { describe, it, expect } from 'vitest';
import {
	DEFAULT_SYNC_BATCH_SIZE,
	DEFAULT_SYNC_REQUEST_DELAY_MS,
	getSyncRuntimeConfig,
	calculateNextHourlySync
} from './sync-config';

describe('sync-config', () => {
	describe('getSyncRuntimeConfig', () => {
		it('returns defaults when env is missing', () => {
			expect(getSyncRuntimeConfig()).toEqual({
				batchSize: DEFAULT_SYNC_BATCH_SIZE,
				requestDelayMs: DEFAULT_SYNC_REQUEST_DELAY_MS
			});
		});

		it('uses valid numeric env values', () => {
			expect(
				getSyncRuntimeConfig({
					SYNC_BATCH_SIZE: '120',
					SYNC_REQUEST_DELAY_MS: '250'
				})
			).toEqual({
				batchSize: 120,
				requestDelayMs: 250
			});
		});

		it('falls back to defaults when values are invalid', () => {
			expect(
				getSyncRuntimeConfig({
					SYNC_BATCH_SIZE: 'not-a-number',
					SYNC_REQUEST_DELAY_MS: -1
				})
			).toEqual({
				batchSize: DEFAULT_SYNC_BATCH_SIZE,
				requestDelayMs: DEFAULT_SYNC_REQUEST_DELAY_MS
			});
		});
	});

	describe('calculateNextHourlySync', () => {
		it('returns the next top-of-hour timestamp in UTC', () => {
			const now = new Date('2026-02-12T13:24:56.000Z');
			expect(calculateNextHourlySync(now)).toBe('2026-02-12T14:00:00.000Z');
		});
	});
});
