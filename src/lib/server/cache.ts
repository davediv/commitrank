/**
 * KV Cache Helper Utilities for CommitRank
 *
 * Provides type-safe caching operations using Cloudflare KV.
 */

/**
 * Cache TTL constants (in seconds)
 */
export const CACHE_TTL = {
	/** Leaderboard cache - 6 hours (invalidated on sync/join) */
	LEADERBOARD: 21600,
	/** Individual user cache - 10 minutes */
	USER: 600,
	/** GitHub API response cache - 1 hour */
	GITHUB: 3600,
	/** Stats cache - 6 hours (invalidated on sync/join) */
	STATS: 21600,
	/** Avatar cache - 7 days (refreshed on sync) */
	AVATAR: 604800
} as const;

/**
 * Cache key prefixes for different data types
 */
export const CACHE_KEYS = {
	LEADERBOARD: 'leaderboard',
	USER: 'user',
	GITHUB: 'github',
	STATS: 'stats',
	LAST_SYNC: 'last_sync',
	AVATAR: 'avatar'
} as const;

/**
 * Generate a cache key for leaderboard data
 */
export function leaderboardKey(period: string, page: number, limit: number): string {
	return `${CACHE_KEYS.LEADERBOARD}:${period}:${page}:${limit}`;
}

/**
 * Generate a cache key for user data
 */
export function userKey(username: string): string {
	return `${CACHE_KEYS.USER}:${username.toLowerCase()}`;
}

/**
 * Generate a cache key for GitHub API data
 */
export function githubKey(username: string): string {
	return `${CACHE_KEYS.GITHUB}:${username.toLowerCase()}`;
}

/**
 * Generate a cache key for stats data
 */
export function statsKey(): string {
	return CACHE_KEYS.STATS;
}

/**
 * Generate a cache key for last sync timestamp
 */
export function lastSyncKey(): string {
	return CACHE_KEYS.LAST_SYNC;
}

/**
 * Generate a cache key for avatar data
 */
export function avatarKey(username: string): string {
	return `${CACHE_KEYS.AVATAR}:${username.toLowerCase()}`;
}

/**
 * Get a value from KV cache
 *
 * @param kv - KVNamespace instance
 * @param key - Cache key
 * @returns Parsed value or null if not found
 */
export async function getCached<T>(kv: KVNamespace, key: string): Promise<T | null> {
	const value = await kv.get(key);
	if (value === null) {
		return null;
	}
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

/**
 * Set a value in KV cache with TTL
 *
 * @param kv - KVNamespace instance
 * @param key - Cache key
 * @param value - Value to cache
 * @param ttl - Time to live in seconds
 */
export async function setCached<T>(
	kv: KVNamespace,
	key: string,
	value: T,
	ttl: number
): Promise<void> {
	await kv.put(key, JSON.stringify(value), { expirationTtl: ttl });
}

/**
 * Delete a specific cache key
 *
 * @param kv - KVNamespace instance
 * @param key - Cache key to delete
 */
export async function deleteCached(kv: KVNamespace, key: string): Promise<void> {
	await kv.delete(key);
}

/**
 * Invalidate multiple cache keys by prefix pattern
 * Note: This lists all keys with the prefix and deletes them
 *
 * @param kv - KVNamespace instance
 * @param prefix - Key prefix to match
 */
export async function invalidateByPrefix(kv: KVNamespace, prefix: string): Promise<void> {
	const list = await kv.list({ prefix });
	await Promise.all(list.keys.map((key) => kv.delete(key.name)));
}

/**
 * Invalidate all leaderboard cache entries
 *
 * @param kv - KVNamespace instance
 */
export async function invalidateLeaderboardCache(kv: KVNamespace): Promise<void> {
	await invalidateByPrefix(kv, CACHE_KEYS.LEADERBOARD);
}

/**
 * Invalidate a specific user's cache
 *
 * @param kv - KVNamespace instance
 * @param username - GitHub username
 */
export async function invalidateUserCache(kv: KVNamespace, username: string): Promise<void> {
	await deleteCached(kv, userKey(username));
}

/**
 * Get or set a cached value with automatic cache miss handling
 *
 * @param kv - KVNamespace instance
 * @param key - Cache key
 * @param ttl - Time to live in seconds
 * @param fetcher - Function to fetch value on cache miss
 * @returns Cached or freshly fetched value with cache hit indicator
 */
export async function getOrSet<T>(
	kv: KVNamespace,
	key: string,
	ttl: number,
	fetcher: () => Promise<T>
): Promise<{ value: T; cached: boolean }> {
	const cached = await getCached<T>(kv, key);
	if (cached !== null) {
		return { value: cached, cached: true };
	}

	const value = await fetcher();
	await setCached(kv, key, value, ttl);
	return { value, cached: false };
}

/**
 * Get binary data from KV cache (for avatars)
 *
 * @param kv - KVNamespace instance
 * @param key - Cache key
 * @returns ArrayBuffer or null if not found
 */
export async function getBinary(kv: KVNamespace, key: string): Promise<ArrayBuffer | null> {
	return await kv.get(key, 'arrayBuffer');
}

/**
 * Set binary data in KV cache with TTL (for avatars)
 *
 * @param kv - KVNamespace instance
 * @param key - Cache key
 * @param value - Binary data to cache
 * @param ttl - Time to live in seconds
 * @param metadata - Optional metadata to store with the value
 */
export async function setBinary(
	kv: KVNamespace,
	key: string,
	value: ArrayBuffer,
	ttl: number,
	metadata?: Record<string, string>
): Promise<void> {
	await kv.put(key, value, { expirationTtl: ttl, metadata });
}

/**
 * Get binary data with metadata from KV cache (for avatars)
 *
 * @param kv - KVNamespace instance
 * @param key - Cache key
 * @returns Object with value and metadata, or null if not found
 */
export async function getBinaryWithMetadata(
	kv: KVNamespace,
	key: string
): Promise<{ value: ArrayBuffer; metadata: Record<string, string> | null } | null> {
	const result = await kv.getWithMetadata<Record<string, string>>(key, 'arrayBuffer');
	if (result.value === null) {
		return null;
	}
	return { value: result.value, metadata: result.metadata };
}
