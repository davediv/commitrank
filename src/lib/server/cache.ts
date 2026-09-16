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
	/** Individual user/profile cache - 6 hours (invalidated when that user syncs) */
	USER: 21600,
	/** GitHub API response cache - 1 hour */
	GITHUB: 3600,
	/** Stats cache - 6 hours (invalidated on sync/join) */
	STATS: 21600,
	/**
	 * Rendered share card - 24 hours (invalidated when that user syncs).
	 *
	 * Deliberately longer than USER. The profile payload behind it is one D1
	 * round trip to rebuild; the PNG is a resvg rasterization, by far the most
	 * expensive thing this Worker does. A card only goes wrong when its owner's
	 * numbers change, which invalidates it directly — what a longer life risks
	 * is a stale *rank*, and the edge already serves this PNG up to its
	 * Cache-Control stale regardless.
	 */
	CARD: 86400,
	/** Avatar cache - 7 days (refreshed on sync) */
	AVATAR: 604800
} as const;

/**
 * Cache key prefixes for different data types
 */
export const CACHE_KEYS = {
	LEADERBOARD: 'leaderboard',
	USER: 'user',
	PROFILE: 'profile',
	GITHUB: 'github',
	STATS: 'stats',
	LAST_SYNC: 'last_sync',
	AVATAR: 'avatar',
	CARD: 'card'
} as const;

/**
 * Generate a cache key for leaderboard data
 */
export function leaderboardKey(period: string, page: number, limit: number): string {
	return `${CACHE_KEYS.LEADERBOARD}:${period}:${page}:${limit}`;
}

/**
 * Generate a cache key for user data (API endpoint)
 */
export function userKey(username: string): string {
	return `${CACHE_KEYS.USER}:${username.toLowerCase()}`;
}

/**
 * Generate a cache key for profile page data (SSR)
 */
export function profilePageKey(username: string): string {
	return `${CACHE_KEYS.PROFILE}:${username.toLowerCase()}`;
}

/**
 * Generate a cache key for a rendered share card PNG
 */
export function cardKey(username: string): string {
	return `${CACHE_KEYS.CARD}:${username.toLowerCase()}`;
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
export function avatarKey(username: string, size?: number): string {
	const baseKey = `${CACHE_KEYS.AVATAR}:${username.toLowerCase()}`;
	return size ? `${baseKey}:${size}` : baseKey;
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
	let cursor: string | undefined;

	// kv.list() pages at 1000 keys. Ignoring the cursor silently under-deleted
	// everything past the first page.
	do {
		const list = await kv.list({ prefix, cursor });
		await Promise.all(list.keys.map((key) => kv.delete(key.name)));
		cursor = list.list_complete ? undefined : list.cursor;
	} while (cursor);
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
	await Promise.all([
		deleteCached(kv, userKey(username)),
		deleteCached(kv, profilePageKey(username)),
		deleteCached(kv, cardKey(username))
	]);
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
