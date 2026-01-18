/**
 * Avatar caching utilities for CommitRank
 *
 * Caches GitHub avatar images in Cloudflare KV for faster loading.
 * Avatars are fetched at 128x128 (good for retina displays) and cached for 7 days.
 */

import { avatarKey, CACHE_TTL, getBinaryWithMetadata, setBinary } from './cache';

/** Size to fetch avatars at (128px for retina quality) */
const AVATAR_SIZE = 128;

/** Content type for cached avatars */
const AVATAR_CONTENT_TYPE = 'image/png';

/**
 * Result of fetching an avatar
 */
export interface AvatarResult {
	data: ArrayBuffer;
	contentType: string;
	cached: boolean;
}

/**
 * Build GitHub avatar URL with size parameter
 */
export function buildAvatarUrl(baseUrl: string, size: number = AVATAR_SIZE): string {
	// GitHub avatar URLs can be modified with size parameter
	// e.g., https://avatars.githubusercontent.com/u/12345?v=4 -> ...?v=4&s=128
	if (baseUrl.includes('?')) {
		return `${baseUrl}&s=${size}`;
	}
	return `${baseUrl}?s=${size}`;
}

/**
 * Fetch avatar from GitHub and cache in KV
 *
 * @param kv - KVNamespace instance
 * @param username - GitHub username
 * @param avatarUrl - GitHub avatar URL from user data
 * @returns Avatar data or null if fetch failed
 */
export async function fetchAndCacheAvatar(
	kv: KVNamespace,
	username: string,
	avatarUrl: string
): Promise<ArrayBuffer | null> {
	try {
		const url = buildAvatarUrl(avatarUrl, AVATAR_SIZE);
		const response = await fetch(url, {
			headers: {
				Accept: 'image/*'
			}
		});

		if (!response.ok) {
			console.error(`[Avatar] Failed to fetch avatar for ${username}: ${response.status}`);
			return null;
		}

		const data = await response.arrayBuffer();

		// Store in KV with content-type metadata
		const key = avatarKey(username);
		await setBinary(kv, key, data, CACHE_TTL.AVATAR, {
			contentType: response.headers.get('content-type') || AVATAR_CONTENT_TYPE,
			username: username.toLowerCase()
		});

		console.log(`[Avatar] Cached avatar for ${username} (${data.byteLength} bytes)`);
		return data;
	} catch (error) {
		console.error(
			`[Avatar] Error fetching avatar for ${username}:`,
			error instanceof Error ? error.message : error
		);
		return null;
	}
}

/**
 * Get avatar from cache, fetching from GitHub if not cached
 *
 * @param kv - KVNamespace instance
 * @param username - GitHub username
 * @param avatarUrl - GitHub avatar URL (used on cache miss)
 * @returns Avatar result with data and cache status
 */
export async function getOrFetchAvatar(
	kv: KVNamespace,
	username: string,
	avatarUrl: string
): Promise<AvatarResult | null> {
	const key = avatarKey(username);

	// Check cache first
	const cached = await getBinaryWithMetadata(kv, key);
	if (cached) {
		return {
			data: cached.value,
			contentType: cached.metadata?.contentType || AVATAR_CONTENT_TYPE,
			cached: true
		};
	}

	// Cache miss - fetch from GitHub
	const data = await fetchAndCacheAvatar(kv, username, avatarUrl);
	if (!data) {
		return null;
	}

	return {
		data,
		contentType: AVATAR_CONTENT_TYPE,
		cached: false
	};
}

/**
 * Cache avatar in the background (fire-and-forget)
 *
 * Use this during sync or join to pre-warm the cache without blocking.
 * Uses waitUntil to ensure the operation completes even if the request ends.
 *
 * @param ctx - Execution context with waitUntil
 * @param kv - KVNamespace instance
 * @param username - GitHub username
 * @param avatarUrl - GitHub avatar URL
 */
export function cacheAvatarInBackground(
	ctx: ExecutionContext,
	kv: KVNamespace,
	username: string,
	avatarUrl: string
): void {
	ctx.waitUntil(
		fetchAndCacheAvatar(kv, username, avatarUrl).catch((error) => {
			console.error(
				`[Avatar] Background cache failed for ${username}:`,
				error instanceof Error ? error.message : error
			);
		})
	);
}
