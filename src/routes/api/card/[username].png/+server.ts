/**
 * Share card endpoint — serves the profile card as a PNG.
 *
 * This is what `og:image` points at, so it has to answer a crawler that runs no
 * JavaScript. Rendering is still the most expensive thing in the app by an order
 * of magnitude (tens of ms of rasterization, against sub-millisecond page
 * renders), so a rendered card is cached in KV under CACHE_TTL.CARD and dropped
 * when that user next syncs.
 *
 * The `.png` in the route is deliberate: several crawlers and chat unfurlers
 * key off the extension as well as the content type.
 */

import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { contributions } from '$lib/server/db/schema';
import { eq, gte, asc, and } from 'drizzle-orm';
import { isValidGitHubUsername } from '$lib/validation';
import {
	cardKey,
	CACHE_TTL,
	getBinary,
	getCached,
	setCached,
	profilePageKey
} from '$lib/server/cache';
import { getOrFetchAvatar } from '$lib/server/avatar';
import { renderCardSvgPng, toDataUri } from '$lib/server/card-png';
import { renderCardSvg } from '$lib/server/card-svg';
import { cardArtifactKey, getCardArtifact, cacheCardArtifact } from '$lib/server/card-artifact';
import {
	computePeriodContributions,
	findUserByUsername,
	buildUserProfile
} from '$lib/server/user-profile';
import type { ContributionDayData, ProfilePageData } from '$lib/types';

/** Matches the profile page: the card is only as fresh as the data behind it. */
const BROWSER_CACHE_SECONDS = 3600;

const AVATAR_SIZE = 160;

/**
 * Copies out the exact bytes of a view rather than handing on `.buffer`, which
 * for a Wasm-backed array can be the whole heap. resvg happens to return a
 * JS-owned copy today; this does not depend on that staying true.
 */
function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
	if (!(data instanceof Uint8Array)) return data;
	return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function pngResponse(data: ArrayBuffer | Uint8Array, cache: 'HIT' | 'MISS'): Response {
	const body = toArrayBuffer(data);

	return new Response(body, {
		headers: {
			'Content-Type': 'image/png',
			'Content-Length': String(body.byteLength),
			'Cache-Control': `public, max-age=${BROWSER_CACHE_SECONDS}`,
			'X-Content-Type-Options': 'nosniff',
			'X-Cache': cache
		}
	});
}

export const GET: RequestHandler = async ({ params, platform, url }) => {
	const username = params.username;

	if (!username || !isValidGitHubUsername(username)) {
		return new Response('Invalid username', { status: 400 });
	}

	const kv = platform!.env.KV;
	const key = cardKey(username);

	const cached = await getBinary(kv, key);
	if (cached) {
		return pngResponse(cached, 'HIT');
	}

	// The profile page caches exactly the payload the card needs, so a card
	// requested after its page has been viewed costs no database work at all.
	let pageData = await getCached<ProfilePageData>(kv, profilePageKey(username));

	if (!pageData) {
		const db = createDb(platform!.env.DB);
		const user = await findUserByUsername(db, username);
		if (!user) {
			return new Response('Not found', { status: 404 });
		}

		const yearAgo = new Date();
		yearAgo.setDate(yearAgo.getDate() - 370);
		const startDate = yearAgo.toISOString().split('T')[0];

		const [periodContributions, dailyResult] = await Promise.all([
			computePeriodContributions(db, user.id),
			db
				.select({ date: contributions.date, total: contributions.total_contributions })
				.from(contributions)
				.where(and(eq(contributions.user_id, user.id), gte(contributions.date, startDate)))
				.orderBy(asc(contributions.date))
		]);

		const dailyContributions: ContributionDayData[] = dailyResult.map((row) => ({
			date: row.date,
			count: row.total
		}));

		pageData = {
			profile: buildUserProfile(user, periodContributions),
			dailyContributions
		};

		const pageWrite = setCached(kv, profilePageKey(username), pageData, CACHE_TTL.USER);
		if (platform?.ctx) platform.ctx.waitUntil(pageWrite);
	}

	// A missing avatar degrades to the initials block rather than failing the
	// render — the same fallback the browser card uses.
	let avatarDataUri: string | null = null;
	try {
		const avatar = pageData.profile.avatar_url
			? await getOrFetchAvatar(kv, username, pageData.profile.avatar_url, AVATAR_SIZE)
			: null;
		if (avatar) {
			avatarDataUri = toDataUri(avatar.data, avatar.contentType);
		}
	} catch {
		avatarDataUri = null;
	}

	try {
		const svg = renderCardSvg({
			profile: pageData.profile,
			dailyContributions: pageData.dailyContributions,
			avatarDataUri
		});

		// Revalidate profile/ranks/avatar first, then reuse only identical output.
		const artifactKey = await cardArtifactKey(svg);
		const artifact = await getCardArtifact(kv, artifactKey);
		const body = artifact?.body ?? toArrayBuffer(await renderCardSvgPng(svg));
		const write = cacheCardArtifact(kv, username, artifactKey, body, artifact?.expiresAt).catch(
			(error) => {
				console.error('Card cache write failed:', error);
			}
		);
		if (platform?.ctx) platform.ctx.waitUntil(write);
		else await write;

		return pngResponse(body, artifact ? 'HIT' : 'MISS');
	} catch (error) {
		console.error(
			JSON.stringify({
				event: 'card_render_failed',
				username,
				path: url.pathname,
				error: error instanceof Error ? error.message : String(error)
			})
		);
		return new Response('Failed to render card', { status: 500 });
	}
};
