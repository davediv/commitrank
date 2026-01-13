/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../routes/api/leaderboard/+server';

// Mock dependencies
vi.mock('$lib/server/db', () => ({
	createDb: vi.fn()
}));

vi.mock('$lib/server/cache', () => ({
	getCached: vi.fn(),
	setCached: vi.fn(),
	leaderboardKey: vi.fn((period, page, limit) => `leaderboard:${period}:${page}:${limit}`),
	CACHE_TTL: { LEADERBOARD: 300 }
}));

vi.mock('$lib/server/ratelimit', () => ({
	checkRateLimit: vi.fn(),
	rateLimitKey: vi.fn((id, action) => `ratelimit:${action}:${id}`),
	RATE_LIMITS: { LEADERBOARD: { limit: 100, windowSeconds: 60 } }
}));

import { createDb } from '$lib/server/db';
import { getCached, setCached } from '$lib/server/cache';
import { checkRateLimit } from '$lib/server/ratelimit';

// Helper to create mock request event - cast as any to avoid strict RequestEvent typing
function createMockRequestEvent(overrides: { url?: URL } = {}): Parameters<typeof GET>[0] {
	const url = overrides.url || new URL('http://localhost/api/leaderboard');

	return {
		url,
		request: new Request(url),
		params: {},
		route: { id: '/api/leaderboard' },
		cookies: {
			get: vi.fn(),
			getAll: vi.fn(() => []),
			set: vi.fn(),
			delete: vi.fn(),
			serialize: vi.fn()
		},
		getClientAddress: vi.fn(() => '127.0.0.1'),
		locals: {},
		platform: {
			env: {
				DB: {},
				KV: {},
				GITHUB_TOKEN: 'test-token',
				ENVIRONMENT: 'development'
			}
		},
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false,
		fetch: vi.fn(),
		setHeaders: vi.fn(),
		depends: vi.fn(),
		untrack: vi.fn(),
		parent: vi.fn(async () => ({})),
		tracing: { label: vi.fn(), start: vi.fn() }
	} as unknown as Parameters<typeof GET>[0];
}

// Mock database result
function createMockDb() {
	const mockResult = [
		{
			github_username: 'user1',
			display_name: 'User One',
			avatar_url: 'https://avatars.githubusercontent.com/u/1',
			twitter_handle: 'user1',
			contributions: 100
		},
		{
			github_username: 'user2',
			display_name: 'User Two',
			avatar_url: 'https://avatars.githubusercontent.com/u/2',
			twitter_handle: null,
			contributions: 50
		}
	];

	const mockCountResult = [{ count: 2 }];

	return {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		leftJoin: vi.fn().mockReturnThis(),
		groupBy: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		offset: vi.fn().mockImplementation(function () {
			// Return leaderboard or count based on call context
			return Promise.resolve(mockResult);
		}),
		// For count query (no offset)
		then: vi.fn((resolve) => resolve(mockCountResult)),
		_leaderboardResult: mockResult,
		_countResult: mockCountResult
	};
}

describe('GET /api/leaderboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: rate limit allows
		vi.mocked(checkRateLimit).mockResolvedValue({
			allowed: true,
			remaining: 99,
			resetIn: 60
		});
		// Default: cache miss
		vi.mocked(getCached).mockResolvedValue(null);
		vi.mocked(setCached).mockResolvedValue();
	});

	describe('Rate Limiting', () => {
		it('should return 429 when rate limited', async () => {
			vi.mocked(checkRateLimit).mockResolvedValue({
				allowed: false,
				remaining: 0,
				resetIn: 60
			});

			const event = createMockRequestEvent();
			const response = await GET(event);
			const body = (await response.json()) as { success: boolean; error: { code: string } };

			expect(response.status).toBe(429);
			expect(body.success).toBe(false);
			expect(body.error.code).toBe('RATE_LIMITED');
		});

		it('should include rate limit headers when rate limited', async () => {
			vi.mocked(checkRateLimit).mockResolvedValue({
				allowed: false,
				remaining: 0,
				resetIn: 60
			});

			const event = createMockRequestEvent();
			const response = await GET(event);

			expect(response.headers.get('Retry-After')).toBe('60');
			expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
			expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
		});
	});

	describe('Parameter Validation', () => {
		it('should accept valid period parameter', async () => {
			const mockDb = createMockDb();
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockRequestEvent({
				url: new URL('http://localhost/api/leaderboard?period=7days')
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
		});

		it('should reject invalid period parameter', async () => {
			const event = createMockRequestEvent({
				url: new URL('http://localhost/api/leaderboard?period=invalid')
			});
			const response = await GET(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_PERIOD');
		});

		it('should reject invalid page parameter', async () => {
			const event = createMockRequestEvent({
				url: new URL('http://localhost/api/leaderboard?page=0')
			});
			const response = await GET(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_PAGINATION');
		});

		it('should reject negative page parameter', async () => {
			const event = createMockRequestEvent({
				url: new URL('http://localhost/api/leaderboard?page=-1')
			});
			const response = await GET(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_PAGINATION');
		});

		it('should reject invalid limit parameter', async () => {
			const event = createMockRequestEvent({
				url: new URL('http://localhost/api/leaderboard?limit=0')
			});
			const response = await GET(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_PAGINATION');
		});

		it('should use default values when no parameters provided', async () => {
			const mockDb = createMockDb();
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockRequestEvent();
			const response = await GET(event);

			expect(response.status).toBe(200);
		});
	});

	describe('Cache Behavior', () => {
		it('should return cached response with cached flag', async () => {
			const cachedData = {
				leaderboard: [
					{
						rank: 1,
						github_username: 'cached-user',
						display_name: 'Cached User',
						avatar_url: null,
						twitter_handle: null,
						contributions: 100
					}
				],
				pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
			};
			vi.mocked(getCached).mockResolvedValue(cachedData);

			const event = createMockRequestEvent();
			const response = await GET(event);
			const body = (await response.json()) as {
				cached: boolean;
				data: { leaderboard: { github_username: string }[] };
			};

			expect(response.status).toBe(200);
			expect(body.cached).toBe(true);
			expect(body.data.leaderboard[0].github_username).toBe('cached-user');
		});

		it('should query database on cache miss', async () => {
			const mockDb = createMockDb();
			vi.mocked(createDb).mockReturnValue(mockDb as any);
			vi.mocked(getCached).mockResolvedValue(null);

			const event = createMockRequestEvent();
			const response = await GET(event);
			const body = (await response.json()) as { cached: boolean };

			expect(response.status).toBe(200);
			expect(body.cached).toBe(false);
			expect(createDb).toHaveBeenCalled();
		});
	});

	describe('Response Format', () => {
		it('should return success response with correct structure', async () => {
			const mockDb = createMockDb();
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockRequestEvent();
			const response = await GET(event);
			const body = (await response.json()) as {
				success: boolean;
				data: { leaderboard: unknown; pagination: unknown };
				timestamp: string;
			};

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.data).toHaveProperty('leaderboard');
			expect(body.data).toHaveProperty('pagination');
			expect(body.timestamp).toBeDefined();
		});
	});
});
