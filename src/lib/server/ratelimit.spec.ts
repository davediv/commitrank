import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimitKey, checkRateLimit, RATE_LIMITS } from './ratelimit';

// Mock KVNamespace
function createMockKV() {
	const store = new Map<string, { value: string; expirationTtl?: number }>();
	return {
		get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
		put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
			store.set(key, { value, expirationTtl: options?.expirationTtl });
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		list: vi.fn(async () => ({ keys: [] })),
		_store: store
	} as unknown as KVNamespace & { _store: Map<string, { value: string; expirationTtl?: number }> };
}

describe('Rate Limit Utilities', () => {
	describe('rateLimitKey', () => {
		it('should generate correct key format', () => {
			const key = rateLimitKey('192.168.1.1', 'register');
			expect(key).toBe('ratelimit:register:192.168.1.1');
		});

		it('should handle different identifiers', () => {
			expect(rateLimitKey('user123', 'leaderboard')).toBe('ratelimit:leaderboard:user123');
			expect(rateLimitKey('test@example.com', 'api')).toBe('ratelimit:api:test@example.com');
		});

		it('should handle empty strings', () => {
			expect(rateLimitKey('', 'action')).toBe('ratelimit:action:');
			expect(rateLimitKey('id', '')).toBe('ratelimit::id');
		});
	});

	describe('checkRateLimit', () => {
		let mockKV: ReturnType<typeof createMockKV>;

		beforeEach(() => {
			mockKV = createMockKV();
		});

		it('should allow first request', async () => {
			const result = await checkRateLimit(mockKV, 'test:key', 5, 60);

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(4);
			expect(result.resetIn).toBe(60);
		});

		it('should allow requests within limit', async () => {
			// Simulate 3 previous requests
			mockKV._store.set('test:key', { value: '3' });

			const result = await checkRateLimit(mockKV, 'test:key', 5, 60);

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(1);
		});

		it('should deny requests at limit', async () => {
			// Simulate 5 previous requests (at limit)
			mockKV._store.set('test:key', { value: '5' });

			const result = await checkRateLimit(mockKV, 'test:key', 5, 60);

			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
		});

		it('should deny requests over limit', async () => {
			// Simulate 10 previous requests (over limit)
			mockKV._store.set('test:key', { value: '10' });

			const result = await checkRateLimit(mockKV, 'test:key', 5, 60);

			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
		});

		it('should increment counter on allowed requests', async () => {
			await checkRateLimit(mockKV, 'test:key', 5, 60);

			expect(mockKV.put).toHaveBeenCalledWith('test:key', '1', { expirationTtl: 60 });
		});

		it('should not increment counter when rate limited', async () => {
			mockKV._store.set('test:key', { value: '5' });

			await checkRateLimit(mockKV, 'test:key', 5, 60);

			// put should not be called when rate limited
			expect(mockKV.put).not.toHaveBeenCalled();
		});

		it('should handle different window sizes', async () => {
			const result = await checkRateLimit(mockKV, 'test:key', 100, 3600);

			expect(result.resetIn).toBe(3600);
			expect(mockKV.put).toHaveBeenCalledWith('test:key', '1', { expirationTtl: 3600 });
		});

		it('should handle limit of 1', async () => {
			const result1 = await checkRateLimit(mockKV, 'test:key', 1, 60);
			expect(result1.allowed).toBe(true);
			expect(result1.remaining).toBe(0);

			const result2 = await checkRateLimit(mockKV, 'test:key', 1, 60);
			expect(result2.allowed).toBe(false);
		});
	});

	describe('RATE_LIMITS', () => {
		it('should have REGISTER config', () => {
			expect(RATE_LIMITS.REGISTER).toBeDefined();
			expect(RATE_LIMITS.REGISTER.limit).toBe(5);
			expect(RATE_LIMITS.REGISTER.windowSeconds).toBe(3600);
		});

		it('should have LEADERBOARD config', () => {
			expect(RATE_LIMITS.LEADERBOARD).toBeDefined();
			expect(RATE_LIMITS.LEADERBOARD.limit).toBe(100);
			expect(RATE_LIMITS.LEADERBOARD.windowSeconds).toBe(60);
		});

		it('should have UPDATE_USER config', () => {
			expect(RATE_LIMITS.UPDATE_USER).toBeDefined();
			expect(RATE_LIMITS.UPDATE_USER.limit).toBe(10);
			expect(RATE_LIMITS.UPDATE_USER.windowSeconds).toBe(3600);
		});
	});
});
