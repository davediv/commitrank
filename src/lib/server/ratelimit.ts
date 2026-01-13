/**
 * Rate Limiting Utilities for CommitRank
 *
 * Provides rate limiting using Cloudflare KV with sliding window approach.
 */

/**
 * Rate limit key prefix
 */
const RATE_LIMIT_PREFIX = 'ratelimit';

/**
 * Rate limit check result
 */
export interface RateLimitResult {
	/** Whether the request is allowed */
	allowed: boolean;
	/** Number of requests remaining in the window */
	remaining: number;
	/** Seconds until the rate limit resets */
	resetIn: number;
}

/**
 * Generate a rate limit key
 *
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param action - Action being rate limited (e.g., 'register', 'leaderboard')
 * @returns Rate limit key
 */
export function rateLimitKey(identifier: string, action: string): string {
	return `${RATE_LIMIT_PREFIX}:${action}:${identifier}`;
}

/**
 * Check and update rate limit for an identifier
 *
 * Uses a simple counter with TTL approach. Each request increments the counter.
 * When the counter exceeds the limit, requests are denied until TTL expires.
 *
 * @param kv - KVNamespace instance
 * @param key - Rate limit key
 * @param limit - Maximum number of requests allowed in the window
 * @param windowSeconds - Time window in seconds
 * @returns Rate limit result with allowed status and remaining count
 */
export async function checkRateLimit(
	kv: KVNamespace,
	key: string,
	limit: number,
	windowSeconds: number
): Promise<RateLimitResult> {
	// Get current count
	const currentValue = await kv.get(key);
	const currentCount = currentValue ? parseInt(currentValue, 10) : 0;

	if (currentCount >= limit) {
		// Rate limit exceeded
		return {
			allowed: false,
			remaining: 0,
			resetIn: windowSeconds // Approximate - actual TTL may be less
		};
	}

	// Increment counter
	const newCount = currentCount + 1;
	await kv.put(key, newCount.toString(), { expirationTtl: windowSeconds });

	return {
		allowed: true,
		remaining: limit - newCount,
		resetIn: windowSeconds
	};
}

/**
 * Rate limit configuration presets
 */
export const RATE_LIMITS = {
	/** POST /api/users - 5 requests per hour */
	REGISTER: {
		limit: 5,
		windowSeconds: 3600
	},
	/** GET /api/leaderboard - 100 requests per minute */
	LEADERBOARD: {
		limit: 100,
		windowSeconds: 60
	},
	/** PATCH /api/users/[username] - 10 requests per hour */
	UPDATE_USER: {
		limit: 10,
		windowSeconds: 3600
	}
} as const;
