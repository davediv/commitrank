/**
 * Avatar caching utilities for CommitRank
 *
 * Caches responsive GitHub avatar variants in Cloudflare KV for faster loading.
 */

import { avatarKey, CACHE_TTL, getBinaryWithMetadata, setBinary } from './cache';

/** Size to fetch avatars at (128px for retina quality) */
const AVATAR_SIZE = 128;

/** Bounded variants prevent arbitrary query strings from fragmenting KV. */
const AVATAR_SIZES = [32, 64, 80, 96, 128, 160, 192, 240, 256] as const;

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

interface FetchedAvatar {
	data: ArrayBuffer;
	contentType: string;
}

export function normalizeAvatarSize(value: string | number | null): number {
	const requested = typeof value === 'number' ? value : Number.parseInt(value || '', 10);
	if (!Number.isFinite(requested)) return AVATAR_SIZE;

	return AVATAR_SIZES.find((size) => size >= requested) ?? AVATAR_SIZES[AVATAR_SIZES.length - 1];
}

function getAvatarCacheKey(username: string, size: number): string {
	// Preserve the existing 128px cache keys while adding responsive variants.
	return avatarKey(username, size === AVATAR_SIZE ? undefined : size);
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
	avatarUrl: string,
	size: number = AVATAR_SIZE
): Promise<FetchedAvatar | null> {
	try {
		const normalizedSize = normalizeAvatarSize(size);
		const url = buildAvatarUrl(avatarUrl, normalizedSize);
		const response = await fetch(url, {
			headers: {
				Accept: 'image/avif,image/webp,image/*'
			}
		});

		if (!response.ok) {
			console.error(`[Avatar] Failed to fetch avatar for ${username}: ${response.status}`);
			return null;
		}

		const data = await response.arrayBuffer();
		const contentType = response.headers.get('content-type') || AVATAR_CONTENT_TYPE;

		// Store in KV with content-type metadata
		const key = getAvatarCacheKey(username, normalizedSize);
		await setBinary(kv, key, data, CACHE_TTL.AVATAR, {
			contentType,
			username: username.toLowerCase(),
			size: String(normalizedSize)
		});

		console.log(`[Avatar] Cached avatar for ${username} (${data.byteLength} bytes)`);
		return { data, contentType };
	} catch (error) {
		console.error(
			`[Avatar] Error fetching avatar for ${username}:`,
			error instanceof Error ? error.message : error
		);
		return null;
	}
}

export async function getCachedAvatar(
	kv: KVNamespace,
	username: string,
	size: number = AVATAR_SIZE
): Promise<AvatarResult | null> {
	const normalizedSize = normalizeAvatarSize(size);
	const cached = await getBinaryWithMetadata(kv, getAvatarCacheKey(username, normalizedSize));
	if (!cached) return null;

	return {
		data: cached.value,
		contentType: cached.metadata?.contentType || AVATAR_CONTENT_TYPE,
		cached: true
	};
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
	avatarUrl: string,
	size: number = AVATAR_SIZE
): Promise<AvatarResult | null> {
	const normalizedSize = normalizeAvatarSize(size);
	const cached = await getCachedAvatar(kv, username, normalizedSize);
	if (cached) {
		return cached;
	}

	// Cache miss - fetch from GitHub
	const fetched = await fetchAndCacheAvatar(kv, username, avatarUrl, normalizedSize);
	if (!fetched) {
		return null;
	}

	return {
		data: fetched.data,
		contentType: fetched.contentType,
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
