/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	CACHE_TTL,
	CACHE_KEYS,
	leaderboardKey,
	userKey,
	githubKey,
	statsKey,
	getCached,
	setCached,
	deleteCached,
	invalidateByPrefix,
	invalidateLeaderboardCache,
	invalidateUserCache,
	getOrSet
} from './cache';

// Mock KVNamespace
function createMockKV() {
	const store = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		list: vi.fn(async ({ prefix }: { prefix?: string } = {}) => {
			const keys: { name: string }[] = [];
			for (const key of store.keys()) {
				if (!prefix || key.startsWith(prefix)) {
					keys.push({ name: key });
				}
			}
			return { keys };
		}),
		_store: store
	} as unknown as KVNamespace & { _store: Map<string, string> };
}

describe('Cache Utilities', () => {
	describe('CACHE_TTL constants', () => {
		it('should have correct LEADERBOARD TTL', () => {
			expect(CACHE_TTL.LEADERBOARD).toBe(300);
		});

		it('should have correct USER TTL', () => {
			expect(CACHE_TTL.USER).toBe(600);
		});

		it('should have correct GITHUB TTL', () => {
			expect(CACHE_TTL.GITHUB).toBe(3600);
		});

		it('should have correct STATS TTL', () => {
			expect(CACHE_TTL.STATS).toBe(300);
		});
	});

	describe('CACHE_KEYS constants', () => {
		it('should have correct key prefixes', () => {
			expect(CACHE_KEYS.LEADERBOARD).toBe('leaderboard');
			expect(CACHE_KEYS.USER).toBe('user');
			expect(CACHE_KEYS.GITHUB).toBe('github');
			expect(CACHE_KEYS.STATS).toBe('stats');
		});
	});

	describe('leaderboardKey', () => {
		it('should generate correct key format', () => {
			expect(leaderboardKey('today', 1, 10)).toBe('leaderboard:today:1:10');
			expect(leaderboardKey('7days', 2, 25)).toBe('leaderboard:7days:2:25');
		});
	});

	describe('userKey', () => {
		it('should generate correct key format', () => {
			expect(userKey('octocat')).toBe('user:octocat');
		});

		it('should lowercase the username', () => {
			expect(userKey('OctoCat')).toBe('user:octocat');
			expect(userKey('GITHUB')).toBe('user:github');
		});
	});

	describe('githubKey', () => {
		it('should generate correct key format', () => {
			expect(githubKey('octocat')).toBe('github:octocat');
		});

		it('should lowercase the username', () => {
			expect(githubKey('OctoCat')).toBe('github:octocat');
		});
	});

	describe('statsKey', () => {
		it('should return the stats key', () => {
			expect(statsKey()).toBe('stats');
		});
	});

	describe('getCached', () => {
		let mockKV: ReturnType<typeof createMockKV>;

		beforeEach(() => {
			mockKV = createMockKV();
		});

		it('should return null for missing key', async () => {
			const result = await getCached(mockKV, 'nonexistent');
			expect(result).toBeNull();
		});

		it('should return parsed JSON for existing key', async () => {
			const data = { id: 1, name: 'test' };
			mockKV._store.set('test:key', JSON.stringify(data));

			const result = await getCached<typeof data>(mockKV, 'test:key');
			expect(result).toEqual(data);
		});

		it('should return null for invalid JSON', async () => {
			mockKV._store.set('test:key', 'not valid json');

			const result = await getCached(mockKV, 'test:key');
			expect(result).toBeNull();
		});
	});

	describe('setCached', () => {
		let mockKV: ReturnType<typeof createMockKV>;

		beforeEach(() => {
			mockKV = createMockKV();
		});

		it('should store JSON value with TTL', async () => {
			const data = { id: 1, name: 'test' };
			await setCached(mockKV, 'test:key', data, 300);

			expect(mockKV.put).toHaveBeenCalledWith('test:key', JSON.stringify(data), {
				expirationTtl: 300
			});
		});
	});

	describe('deleteCached', () => {
		let mockKV: ReturnType<typeof createMockKV>;

		beforeEach(() => {
			mockKV = createMockKV();
		});

		it('should delete the key', async () => {
			await deleteCached(mockKV, 'test:key');
			expect(mockKV.delete).toHaveBeenCalledWith('test:key');
		});
	});

	describe('invalidateByPrefix', () => {
		let mockKV: ReturnType<typeof createMockKV>;

		beforeEach(() => {
			mockKV = createMockKV();
		});

		it('should delete all keys with prefix', async () => {
			mockKV._store.set('prefix:key1', 'value1');
			mockKV._store.set('prefix:key2', 'value2');
			mockKV._store.set('other:key', 'value3');

			await invalidateByPrefix(mockKV, 'prefix');

			expect(mockKV.delete).toHaveBeenCalledWith('prefix:key1');
			expect(mockKV.delete).toHaveBeenCalledWith('prefix:key2');
			expect(mockKV.delete).toHaveBeenCalledTimes(2);
		});

		it('should handle empty results', async () => {
			await invalidateByPrefix(mockKV, 'nonexistent');
			expect(mockKV.delete).not.toHaveBeenCalled();
		});
	});

	describe('invalidateLeaderboardCache', () => {
		let mockKV: ReturnType<typeof createMockKV>;

		beforeEach(() => {
			mockKV = createMockKV();
		});

		it('should invalidate all leaderboard keys', async () => {
			mockKV._store.set('leaderboard:today:1:10', 'data1');
			mockKV._store.set('leaderboard:7days:1:10', 'data2');

			await invalidateLeaderboardCache(mockKV);

			expect(mockKV.list).toHaveBeenCalledWith({ prefix: 'leaderboard' });
		});
	});

	describe('invalidateUserCache', () => {
		let mockKV: ReturnType<typeof createMockKV>;

		beforeEach(() => {
			mockKV = createMockKV();
		});

		it('should delete user cache', async () => {
			await invalidateUserCache(mockKV, 'octocat');
			expect(mockKV.delete).toHaveBeenCalledWith('user:octocat');
		});

		it('should lowercase the username', async () => {
			await invalidateUserCache(mockKV, 'OctoCat');
			expect(mockKV.delete).toHaveBeenCalledWith('user:octocat');
		});
	});

	describe('getOrSet', () => {
		let mockKV: ReturnType<typeof createMockKV>;

		beforeEach(() => {
			mockKV = createMockKV();
		});

		it('should return cached value on hit', async () => {
			const data = { id: 1 };
			mockKV._store.set('test:key', JSON.stringify(data));

			const fetcher = vi.fn();
			const result = await getOrSet(mockKV, 'test:key', 300, fetcher);

			expect(result.value).toEqual(data);
			expect(result.cached).toBe(true);
			expect(fetcher).not.toHaveBeenCalled();
		});

		it('should fetch and cache on miss', async () => {
			const data = { id: 1 };
			const fetcher = vi.fn().mockResolvedValue(data);

			const result = await getOrSet(mockKV, 'test:key', 300, fetcher);

			expect(result.value).toEqual(data);
			expect(result.cached).toBe(false);
			expect(fetcher).toHaveBeenCalled();
			expect(mockKV.put).toHaveBeenCalledWith('test:key', JSON.stringify(data), {
				expirationTtl: 300
			});
		});
	});
});
