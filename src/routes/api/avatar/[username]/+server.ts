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
import { eq } from 'drizzle-orm';
import { isValidGitHubUsername } from '$lib/validation';
import { getOrFetchAvatar, buildAvatarUrl } from '$lib/server/avatar';

/** Browser cache duration (1 day) */
const BROWSER_CACHE_SECONDS = 86400;

export const GET: RequestHandler = async ({ params, platform }) => {
	const { username } = params;

	// Validate username format
	if (!username || !isValidGitHubUsername(username)) {
		return new Response('Invalid username', { status: 400 });
	}

	const kv = platform!.env.KV;
	const db = createDb(platform!.env.DB);

	// Look up user to get their avatar URL
	const userResult = await db
		.select({ avatar_url: users.avatar_url })
		.from(users)
		.where(eq(users.github_username, username.toLowerCase()))
		.limit(1);

	if (userResult.length === 0 || !userResult[0].avatar_url) {
		return new Response('User not found', { status: 404 });
	}

	const avatarUrl = userResult[0].avatar_url;

	// Try to get from cache or fetch
	const result = await getOrFetchAvatar(kv, username, avatarUrl);

	if (result) {
		return new Response(result.data, {
			headers: {
				'Content-Type': result.contentType,
				'Cache-Control': `public, max-age=${BROWSER_CACHE_SECONDS}`,
				'X-Cache': result.cached ? 'HIT' : 'MISS'
			}
		});
	}

	// Fallback: redirect to GitHub
	return Response.redirect(buildAvatarUrl(avatarUrl, 128), 302);
};
