/**
 * Avatar endpoint - serves cached GitHub avatars from Cloudflare KV
 *
 * On cache hit: serves binary image directly from KV (10-50ms)
 * On cache miss: fetches from GitHub, caches, and serves (50-200ms)
 * On failure: redirects to GitHub avatar URL
 */

import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { sql } from 'drizzle-orm';
import { isValidGitHubUsername } from '$lib/validation';
import {
	buildAvatarUrl,
	fetchAndCacheAvatar,
	getCachedAvatar,
	normalizeAvatarSize,
	type AvatarResult
} from '$lib/server/avatar';

/** Browser and edge cache duration (matches the KV object lifetime). */
const BROWSER_CACHE_SECONDS = 604800;

function avatarResponse(result: AvatarResult): Response {
	return new Response(result.data, {
		headers: {
			'Content-Type': result.contentType,
			'Content-Length': String(result.data.byteLength),
			'Cache-Control': `public, max-age=${BROWSER_CACHE_SECONDS}`,
			'X-Content-Type-Options': 'nosniff',
			'X-Cache': result.cached ? 'HIT' : 'MISS'
		}
	});
}

function avatarRedirect(usernameOrUrl: string, size: number, isUrl = false): Response {
	const location = isUrl
		? buildAvatarUrl(usernameOrUrl, size)
		: `https://avatars.githubusercontent.com/${usernameOrUrl}?s=${size}`;

	return new Response(null, {
		status: 302,
		headers: {
			Location: location,
			'Cache-Control': 'public, max-age=3600'
		}
	});
}

export const GET: RequestHandler = async ({ params, platform, url }) => {
	const { username } = params;

	// Validate username format
	if (!username || !isValidGitHubUsername(username)) {
		return new Response('Invalid username', { status: 400 });
	}

	const kv = platform!.env.KV;
	const size = normalizeAvatarSize(url.searchParams.get('size'));

	// The cache key already contains the username, so avoid a D1 query entirely
	// for the overwhelmingly common hit path.
	const cachedAvatar = await getCachedAvatar(kv, username, size);
	if (cachedAvatar) {
		return avatarResponse(cachedAvatar);
	}

	const db = createDb(platform!.env.DB);

	// Look up user to get their avatar URL
	const userResult = await db
		.select({ avatar_url: users.avatar_url })
		.from(users)
		.where(sql`${users.github_username} = ${username} COLLATE NOCASE`)
		.limit(1);

	if (userResult.length === 0 || !userResult[0].avatar_url) {
		// Fallback: redirect to GitHub avatar directly using username
		return avatarRedirect(username, size);
	}

	const avatarUrl = userResult[0].avatar_url;

	const fetchedAvatar = await fetchAndCacheAvatar(kv, username, avatarUrl, size);

	if (fetchedAvatar) {
		return avatarResponse({ ...fetchedAvatar, cached: false });
	}

	// Fallback: redirect to GitHub
	return avatarRedirect(avatarUrl, size, true);
};
