/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	createDb: vi.fn()
}));

vi.mock('$lib/server/cache', () => ({
	getCached: vi.fn(),
	setCached: vi.fn(),
	leaderboardKey: vi.fn((period: string, page: number, limit: number) => {
		return `leaderboard:${period}:${page}:${limit}`;
	}),
	lastSyncKey: vi.fn(() => 'sync:last'),
	CACHE_TTL: {
		LEADERBOARD: 21600
	}
}));

import { load } from './+page.server';
import { createDb } from '$lib/server/db';
import { getCached, setCached } from '$lib/server/cache';

function createMockDb() {
	return {
		select: vi.fn((fields: Record<string, unknown>) => ({
			from: vi.fn(() => {
				if ('total' in fields) {
					return {
						where: vi.fn().mockResolvedValue([{ total: 5000 }])
					};
				}

				if ('count' in fields) {
					return Promise.resolve([{ count: 100 }]);
				}

				return Promise.resolve([]);
			})
		}))
	};
}

describe('load /+page.server.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-12T13:24:56.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns top-of-hour next_sync for stats', async () => {
		const cachedLeaderboard = {
			leaderboard: [
				{
					rank: 1,
					github_username: 'topdev',
					display_name: 'Top Dev',
					avatar_url: 'https://avatars.githubusercontent.com/u/1',
					twitter_handle: null,
					contributions: 123
				}
			],
			pagination: {
				page: 1,
				limit: 20,
				total: 1,
				totalPages: 1
			}
		};

		vi.mocked(getCached).mockImplementation(async (_kv, key: string) => {
			if (key === 'leaderboard:today:1:20') {
				return cachedLeaderboard as any;
			}

			if (key === 'sync:last') {
				return '2026-02-12T13:00:00.000Z' as any;
			}

			return null as any;
		});

		vi.mocked(createDb).mockReturnValue(createMockDb() as any);
		vi.mocked(setCached).mockResolvedValue();

		const capturedHeaders: Record<string, string> = {};

		const result = (await load({
			url: new URL('http://localhost/?period=today&page=1'),
			platform: {
				env: {
					DB: {},
					KV: {}
				}
			},
			setHeaders(headers: Record<string, string>) {
				Object.assign(capturedHeaders, headers);
			}
		} as Parameters<typeof load>[0])) as Exclude<Awaited<ReturnType<typeof load>>, void>;

		expect(result.stats).not.toBeNull();
		expect(result.stats?.next_sync).toBe('2026-02-12T14:00:00.000Z');
		expect(result.cached).toBe(true);
		expect(capturedHeaders['Cache-Control']).toBe('public, max-age=60');
	});
});
