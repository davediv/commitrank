/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../routes/api/stats/+server';

// Mock dependencies
vi.mock('$lib/server/db', () => ({
	createDb: vi.fn()
}));

vi.mock('$lib/server/cache', () => ({
	getCached: vi.fn(),
	setCached: vi.fn(),
	statsKey: vi.fn(() => 'stats'),
	CACHE_TTL: { STATS: 300 }
}));

import { createDb } from '$lib/server/db';
import { getCached, setCached } from '$lib/server/cache';

// Helper to create mock request event - cast as any to avoid strict RequestEvent typing
function createMockRequestEvent(): Parameters<typeof GET>[0] {
	const url = new URL('http://localhost/api/stats');

	return {
		url,
		request: new Request(url),
		params: {},
		route: { id: '/api/stats' },
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

// Mock database
function createMockDb() {
	return {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		then: vi.fn()
	};
}

describe('GET /api/stats', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getCached).mockResolvedValue(null);
		vi.mocked(setCached).mockResolvedValue();
	});

	describe('Cache Behavior', () => {
		it('should return cached response when available', async () => {
			const cachedStats = {
				total_users: 100,
				total_contributions_today: 500,
				total_contributions_year: 50000,
				last_sync: '2024-01-15T00:00:00Z',
				next_sync: '2024-01-15T06:00:00Z'
			};
			vi.mocked(getCached).mockResolvedValue(cachedStats);

			const event = createMockRequestEvent();
			const response = await GET(event);
			const body = (await response.json()) as {
				cached: boolean;
				data: { total_users: number };
			};

			expect(response.status).toBe(200);
			expect(body.cached).toBe(true);
			expect(body.data.total_users).toBe(100);
		});

		it('should query database on cache miss', async () => {
			const mockDb = createMockDb();
			// Mock all four parallel queries
			vi.mocked(createDb).mockReturnValue({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ total: 100 }]),
						then: vi.fn((resolve) => resolve([{ count: 50 }]))
					})
				})
			} as any);

			const event = createMockRequestEvent();
			const response = await GET(event);

			expect(createDb).toHaveBeenCalled();
		});
	});

	describe('Response Format', () => {
		it('should return success response with correct structure', async () => {
			const cachedStats = {
				total_users: 100,
				total_contributions_today: 500,
				total_contributions_year: 50000,
				last_sync: '2024-01-15T00:00:00Z',
				next_sync: '2024-01-15T06:00:00Z'
			};
			vi.mocked(getCached).mockResolvedValue(cachedStats);

			const event = createMockRequestEvent();
			const response = await GET(event);
			const body = (await response.json()) as {
				success: boolean;
				data: {
					total_users: number;
					total_contributions_today: number;
					total_contributions_year: number;
					last_sync: string;
					next_sync: string;
				};
				timestamp: string;
			};

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.data).toHaveProperty('total_users');
			expect(body.data).toHaveProperty('total_contributions_today');
			expect(body.data).toHaveProperty('total_contributions_year');
			expect(body.data).toHaveProperty('last_sync');
			expect(body.data).toHaveProperty('next_sync');
			expect(body.timestamp).toBeDefined();
		});

		it('should include numeric values for contribution counts', async () => {
			const cachedStats = {
				total_users: 100,
				total_contributions_today: 500,
				total_contributions_year: 50000,
				last_sync: '2024-01-15T00:00:00Z',
				next_sync: '2024-01-15T06:00:00Z'
			};
			vi.mocked(getCached).mockResolvedValue(cachedStats);

			const event = createMockRequestEvent();
			const response = await GET(event);
			const body = (await response.json()) as {
				data: {
					total_users: number;
					total_contributions_today: number;
					total_contributions_year: number;
				};
			};

			expect(typeof body.data.total_users).toBe('number');
			expect(typeof body.data.total_contributions_today).toBe('number');
			expect(typeof body.data.total_contributions_year).toBe('number');
		});
	});

	describe('Error Handling', () => {
		it('should return 500 on database error', async () => {
			vi.mocked(getCached).mockResolvedValue(null);
			vi.mocked(createDb).mockImplementation(() => {
				throw new Error('Database connection failed');
			});

			const event = createMockRequestEvent();
			const response = await GET(event);
			const body = (await response.json()) as {
				success: boolean;
				error: { code: string };
			};

			expect(response.status).toBe(500);
			expect(body.success).toBe(false);
			expect(body.error.code).toBe('INTERNAL_ERROR');
		});
	});
});
