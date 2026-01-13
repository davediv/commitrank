/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from '../../routes/api/users/[username]/+server';

// Mock dependencies
vi.mock('$lib/server/db', () => ({
	createDb: vi.fn()
}));

vi.mock('$lib/server/cache', () => ({
	getCached: vi.fn(),
	setCached: vi.fn(),
	deleteCached: vi.fn(),
	userKey: vi.fn((username) => `user:${username.toLowerCase()}`),
	CACHE_TTL: { USER: 600 }
}));

vi.mock('$lib/server/ratelimit', () => ({
	checkRateLimit: vi.fn(),
	rateLimitKey: vi.fn((id, action) => `ratelimit:${action}:${id}`),
	RATE_LIMITS: { UPDATE_USER: { limit: 10, windowSeconds: 3600 } }
}));

import { createDb } from '$lib/server/db';
import { getCached, setCached, deleteCached } from '$lib/server/cache';
import { checkRateLimit } from '$lib/server/ratelimit';

// Helper to create mock GET request event - cast as any to avoid strict RequestEvent typing
function createMockGetEvent(username: string): Parameters<typeof GET>[0] {
	const url = new URL(`http://localhost/api/users/${username}`);

	return {
		url,
		request: new Request(url),
		params: { username },
		route: { id: '/api/users/[username]' },
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

// Helper to create mock PATCH request event - cast as any to avoid strict RequestEvent typing
function createMockPatchEvent(username: string, body: object): Parameters<typeof PATCH>[0] {
	const url = new URL(`http://localhost/api/users/${username}`);

	return {
		url,
		request: new Request(url, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		params: { username },
		route: { id: '/api/users/[username]' },
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
	} as unknown as Parameters<typeof PATCH>[0];
}

// Mock user data
const mockUser = {
	id: 'user-123',
	github_username: 'testuser',
	github_id: 12345,
	display_name: 'Test User',
	avatar_url: 'https://avatars.githubusercontent.com/u/12345',
	bio: 'Test bio',
	twitter_handle: 'testuser',
	location: 'Test Location',
	company: 'Test Company',
	blog: 'https://test.com',
	public_repos: 10,
	followers: 100,
	following: 50,
	github_created_at: '2020-01-01T00:00:00Z',
	created_at: '2024-01-01T00:00:00Z',
	updated_at: '2024-01-15T00:00:00Z'
};

// Mock database for GET
function createMockDbForGet(userExists: boolean) {
	// Track call count to differentiate between user query and rank queries
	let selectCallCount = 0;

	const mockSelectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		leftJoin: vi.fn().mockReturnThis(),
		groupBy: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockImplementation(() => {
			// This is for rank calculation - return array with user
			return Promise.resolve([{ user_id: mockUser.id, total: 100 }]);
		}),
		limit: vi.fn().mockImplementation(() => {
			selectCallCount++;
			if (selectCallCount === 1) {
				// First call: user lookup
				return Promise.resolve(userExists ? [mockUser] : []);
			}
			// Subsequent calls: contribution queries
			return Promise.resolve([{ total: 100 }]);
		})
	};

	return {
		select: vi.fn().mockReturnValue(mockSelectChain)
	};
}

// Mock database for PATCH
function createMockDbForPatch(userExists: boolean) {
	return {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue(userExists ? [{ id: mockUser.id }] : []),
		update: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([
			{
				...mockUser,
				twitter_handle: 'updated_handle',
				updated_at: new Date().toISOString()
			}
		])
	};
}

describe('GET /api/users/[username]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getCached).mockResolvedValue(null);
		vi.mocked(setCached).mockResolvedValue();
	});

	describe('Username Validation', () => {
		it('should reject invalid username format', async () => {
			const event = createMockGetEvent('-invalid');
			const response = await GET(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_USERNAME');
		});

		it('should reject empty username', async () => {
			const event = createMockGetEvent('');
			const response = await GET(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_USERNAME');
		});

		it('should accept valid username', async () => {
			const mockDb = createMockDbForGet(true);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockGetEvent('validuser');
			const response = await GET(event);

			expect(response.status).toBe(200);
		});
	});

	describe('User Not Found', () => {
		it('should return 404 when user does not exist', async () => {
			const mockDb = createMockDbForGet(false);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockGetEvent('nonexistent');
			const response = await GET(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(404);
			expect(body.error.code).toBe('USER_NOT_FOUND');
		});
	});

	describe('Cache Behavior', () => {
		it('should return cached response when available', async () => {
			const cachedProfile = {
				id: 1,
				github_username: 'cacheduser',
				display_name: 'Cached User',
				contributions: []
			};
			vi.mocked(getCached).mockResolvedValue(cachedProfile);

			const event = createMockGetEvent('cacheduser');
			const response = await GET(event);
			const body = (await response.json()) as {
				cached: boolean;
				data: { github_username: string };
			};

			expect(response.status).toBe(200);
			expect(body.cached).toBe(true);
			expect(body.data.github_username).toBe('cacheduser');
		});
	});

	describe('Successful Response', () => {
		it('should return user profile with contributions', async () => {
			const mockDb = createMockDbForGet(true);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockGetEvent('testuser');
			const response = await GET(event);
			const body = (await response.json()) as {
				success: boolean;
				data: { github_username: string; contributions: unknown };
			};

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.data).toHaveProperty('github_username');
			expect(body.data).toHaveProperty('contributions');
		});
	});
});

describe('PATCH /api/users/[username]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkRateLimit).mockResolvedValue({
			allowed: true,
			remaining: 9,
			resetIn: 3600
		});
		vi.mocked(deleteCached).mockResolvedValue();
	});

	describe('Rate Limiting', () => {
		it('should return 429 when rate limited', async () => {
			vi.mocked(checkRateLimit).mockResolvedValue({
				allowed: false,
				remaining: 0,
				resetIn: 3600
			});

			const event = createMockPatchEvent('testuser', { twitter_handle: 'newhandle' });
			const response = await PATCH(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(429);
			expect(body.error.code).toBe('RATE_LIMITED');
		});
	});

	describe('Username Validation', () => {
		it('should reject invalid username format', async () => {
			const event = createMockPatchEvent('-invalid', { twitter_handle: 'handle' });
			const response = await PATCH(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_USERNAME');
		});
	});

	describe('Twitter Handle Validation', () => {
		it('should reject invalid twitter_handle format', async () => {
			const mockDb = createMockDbForPatch(true);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockPatchEvent('testuser', { twitter_handle: 'invalid-handle' });
			const response = await PATCH(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_TWITTER');
		});

		it('should accept valid twitter_handle', async () => {
			const mockDb = createMockDbForPatch(true);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockPatchEvent('testuser', { twitter_handle: 'valid_handle' });
			const response = await PATCH(event);

			expect(response.status).toBe(200);
		});

		it('should accept empty string to clear twitter_handle', async () => {
			const mockDb = createMockDbForPatch(true);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockPatchEvent('testuser', { twitter_handle: '' });
			const response = await PATCH(event);

			expect(response.status).toBe(200);
		});

		it('should accept null to clear twitter_handle', async () => {
			const mockDb = createMockDbForPatch(true);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockPatchEvent('testuser', { twitter_handle: null });
			const response = await PATCH(event);

			expect(response.status).toBe(200);
		});
	});

	describe('User Not Found', () => {
		it('should return 404 when user does not exist', async () => {
			const mockDb = createMockDbForPatch(false);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockPatchEvent('nonexistent', { twitter_handle: 'handle' });
			const response = await PATCH(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(404);
			expect(body.error.code).toBe('USER_NOT_FOUND');
		});
	});

	describe('Successful Update', () => {
		it('should return updated user data', async () => {
			const mockDb = createMockDbForPatch(true);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockPatchEvent('testuser', { twitter_handle: 'newhandle' });
			const response = await PATCH(event);
			const body = (await response.json()) as {
				success: boolean;
				data: { github_username: string; twitter_handle: string };
			};

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.data).toHaveProperty('github_username');
			expect(body.data).toHaveProperty('twitter_handle');
		});

		it('should invalidate cache after update', async () => {
			const mockDb = createMockDbForPatch(true);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockPatchEvent('testuser', { twitter_handle: 'newhandle' });
			await PATCH(event);

			expect(deleteCached).toHaveBeenCalled();
		});
	});
});
