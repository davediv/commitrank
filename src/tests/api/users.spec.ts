/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../routes/api/users/+server';

// Mock dependencies
vi.mock('$lib/server/db', () => ({
	createDb: vi.fn()
}));

vi.mock('$lib/server/cache', () => ({
	invalidateLeaderboardCache: vi.fn(),
	deleteCached: vi.fn(),
	statsKey: vi.fn(() => 'stats')
}));

vi.mock('$lib/server/ratelimit', () => ({
	checkRateLimit: vi.fn(),
	rateLimitKey: vi.fn((id, action) => `ratelimit:${action}:${id}`),
	RATE_LIMITS: { REGISTER: { limit: 5, windowSeconds: 3600 } }
}));

vi.mock('$lib/server/github', () => ({
	fetchContributions: vi.fn(),
	parseGitHubNodeId: vi.fn(() => 12345),
	GitHubApiError: class GitHubApiError extends Error {
		type: string;
		statusCode?: number;
		constructor(type: string, message: string, statusCode?: number) {
			super(message);
			this.type = type;
			this.statusCode = statusCode;
			this.name = 'GitHubApiError';
		}
	}
}));

import { createDb } from '$lib/server/db';
import { checkRateLimit } from '$lib/server/ratelimit';
import { fetchContributions, GitHubApiError } from '$lib/server/github';

// Helper to create mock request event - cast as any to avoid strict RequestEvent typing
function createMockRequestEvent(body: object): Parameters<typeof POST>[0] {
	const url = new URL('http://localhost/api/users');

	return {
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		params: {},
		route: { id: '/api/users' },
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
	} as unknown as Parameters<typeof POST>[0];
}

// Create mock request with invalid JSON
function createMockRequestEventInvalidJson(): Parameters<typeof POST>[0] {
	const url = new URL('http://localhost/api/users');

	return {
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not valid json'
		}),
		params: {},
		route: { id: '/api/users' },
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
	} as unknown as Parameters<typeof POST>[0];
}

// Mock database
function createMockDb(existingUsers: { id: string }[] = []) {
	const insertedUser = {
		id: 'new-user-id',
		github_username: 'testuser',
		display_name: 'Test User',
		avatar_url: 'https://avatars.githubusercontent.com/u/12345',
		twitter_handle: null
	};

	return {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue(existingUsers),
		leftJoin: vi.fn().mockReturnThis(),
		groupBy: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockResolvedValue([]),
		insert: vi.fn().mockReturnThis(),
		values: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([insertedUser])
	};
}

// Mock GitHub data - matches GitHubContributionData interface
const mockGitHubData = {
	user: {
		id: 'MDQ6VXNlcjEyMzQ1',
		login: 'testuser',
		name: 'Test User',
		avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
		bio: 'Test bio',
		location: 'Test Location',
		company: 'Test Company',
		websiteUrl: 'https://test.com',
		twitterUsername: 'testuser',
		repositories: 10,
		followers: 100,
		following: 50,
		createdAt: '2020-01-01T00:00:00Z'
	},
	contributions: {
		totalContributions: 500,
		totalCommitContributions: 400,
		totalPullRequestContributions: 50,
		totalIssueContributions: 30,
		totalPullRequestReviewContributions: 20,
		restrictedContributionsCount: 0,
		days: [
			{ date: '2024-01-15', contributionCount: 10 },
			{ date: '2024-01-14', contributionCount: 5 }
		]
	}
};

describe('POST /api/users', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: rate limit allows
		vi.mocked(checkRateLimit).mockResolvedValue({
			allowed: true,
			remaining: 4,
			resetIn: 3600
		});
		// Default: GitHub fetch succeeds
		vi.mocked(fetchContributions).mockResolvedValue(mockGitHubData);
	});

	describe('Rate Limiting', () => {
		it('should return 429 when rate limited', async () => {
			vi.mocked(checkRateLimit).mockResolvedValue({
				allowed: false,
				remaining: 0,
				resetIn: 3600
			});

			const event = createMockRequestEvent({ github_username: 'testuser' });
			const response = await POST(event);
			const body = (await response.json()) as {
				success: boolean;
				error: { code: string };
			};

			expect(response.status).toBe(429);
			expect(body.success).toBe(false);
			expect(body.error.code).toBe('RATE_LIMITED');
		});
	});

	describe('Input Validation', () => {
		it('should reject invalid JSON body', async () => {
			const event = createMockRequestEventInvalidJson();
			const response = await POST(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_USERNAME');
		});

		it('should reject missing github_username', async () => {
			const event = createMockRequestEvent({});
			const response = await POST(event);
			const body = (await response.json()) as {
				error: { code: string; message: string };
			};

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_USERNAME');
			expect(body.error.message).toContain('required');
		});

		it('should reject invalid github_username format', async () => {
			const event = createMockRequestEvent({ github_username: '-invalid' });
			const response = await POST(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_USERNAME');
		});

		it('should reject github_username that is too long', async () => {
			const event = createMockRequestEvent({ github_username: 'a'.repeat(40) });
			const response = await POST(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_USERNAME');
		});

		it('should reject invalid twitter_handle format', async () => {
			const event = createMockRequestEvent({
				github_username: 'validuser',
				twitter_handle: 'invalid-handle'
			});
			const response = await POST(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(400);
			expect(body.error.code).toBe('INVALID_TWITTER');
		});

		it('should accept valid github_username without twitter_handle', async () => {
			const mockDb = createMockDb([]);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockRequestEvent({ github_username: 'validuser' });
			const response = await POST(event);

			expect(response.status).toBe(201);
		});

		it('should accept valid github_username with valid twitter_handle', async () => {
			const mockDb = createMockDb([]);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockRequestEvent({
				github_username: 'validuser',
				twitter_handle: 'valid_handle'
			});
			const response = await POST(event);

			expect(response.status).toBe(201);
		});
	});

	describe('User Already Exists', () => {
		it('should return 409 when user already exists', async () => {
			const mockDb = createMockDb([{ id: 'existing-id' }]);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockRequestEvent({ github_username: 'existinguser' });
			const response = await POST(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(409);
			expect(body.error.code).toBe('USER_ALREADY_EXISTS');
		});
	});

	describe('GitHub API Errors', () => {
		it('should return 404 when GitHub user not found', async () => {
			const mockDb = createMockDb([]);
			vi.mocked(createDb).mockReturnValue(mockDb as any);
			vi.mocked(fetchContributions).mockRejectedValue(
				new GitHubApiError('NOT_FOUND', 'User not found', 404)
			);

			const event = createMockRequestEvent({ github_username: 'nonexistent' });
			const response = await POST(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(404);
			expect(body.error.code).toBe('GITHUB_USER_NOT_FOUND');
		});

		it('should return 429 when GitHub rate limited', async () => {
			const mockDb = createMockDb([]);
			vi.mocked(createDb).mockReturnValue(mockDb as any);
			vi.mocked(fetchContributions).mockRejectedValue(
				new GitHubApiError('RATE_LIMITED', 'Rate limited', 429)
			);

			const event = createMockRequestEvent({ github_username: 'testuser' });
			const response = await POST(event);
			const body = (await response.json()) as { error: { code: string } };

			expect(response.status).toBe(429);
			expect(body.error.code).toBe('RATE_LIMITED');
		});
	});

	describe('Successful Registration', () => {
		it('should return 201 with user data on success', async () => {
			const mockDb = createMockDb([]);
			vi.mocked(createDb).mockReturnValue(mockDb as any);

			const event = createMockRequestEvent({ github_username: 'newuser' });
			const response = await POST(event);
			const body = (await response.json()) as {
				success: boolean;
				data: {
					id: string;
					github_username: string;
					rank: number;
					contributions: unknown;
				};
			};

			expect(response.status).toBe(201);
			expect(body.success).toBe(true);
			expect(body.data).toHaveProperty('id');
			expect(body.data).toHaveProperty('github_username');
			expect(body.data).toHaveProperty('rank');
			expect(body.data).toHaveProperty('contributions');
		});
	});
});
