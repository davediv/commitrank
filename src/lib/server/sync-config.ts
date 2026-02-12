/**
 * Runtime configuration for scheduled sync jobs.
 *
 * Values are read from environment variables so they can be tuned without redeploying code.
 */

export interface SyncRuntimeConfig {
	batchSize: number;
	requestDelayMs: number;
}

export interface SyncConfigEnv {
	SYNC_BATCH_SIZE?: string | number | null;
	SYNC_REQUEST_DELAY_MS?: string | number | null;
}

export const DEFAULT_SYNC_BATCH_SIZE = 75;
export const DEFAULT_SYNC_REQUEST_DELAY_MS = 100;

const MIN_SYNC_BATCH_SIZE = 1;
const MAX_SYNC_BATCH_SIZE = 500;
const MIN_SYNC_REQUEST_DELAY_MS = 0;
const MAX_SYNC_REQUEST_DELAY_MS = 5000;

function toNumber(value: string | number | null | undefined): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			return null;
		}

		const parsed = Number.parseInt(trimmed, 10);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

function parseBoundedInt(
	value: string | number | null | undefined,
	fallback: number,
	min: number,
	max: number
): number {
	const parsed = toNumber(value);
	if (parsed === null) {
		return fallback;
	}

	if (parsed < min || parsed > max) {
		return fallback;
	}

	return Math.floor(parsed);
}

export function getSyncRuntimeConfig(env?: SyncConfigEnv): SyncRuntimeConfig {
	return {
		batchSize: parseBoundedInt(
			env?.SYNC_BATCH_SIZE,
			DEFAULT_SYNC_BATCH_SIZE,
			MIN_SYNC_BATCH_SIZE,
			MAX_SYNC_BATCH_SIZE
		),
		requestDelayMs: parseBoundedInt(
			env?.SYNC_REQUEST_DELAY_MS,
			DEFAULT_SYNC_REQUEST_DELAY_MS,
			MIN_SYNC_REQUEST_DELAY_MS,
			MAX_SYNC_REQUEST_DELAY_MS
		)
	};
}

/**
 * Returns the next top-of-hour UTC time, matching cron expression `0 * * * *`.
 */
export function calculateNextHourlySync(now: Date = new Date()): string {
	const next = new Date(now);
	next.setUTCMinutes(0, 0, 0);
	next.setUTCHours(next.getUTCHours() + 1);
	return next.toISOString();
}
