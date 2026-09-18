import { Buffer } from 'node:buffer';
import { recordCacheOutcome } from './cpu-observability.js';
import { CARD_RASTER_SIZE } from '$lib/card-layout';
import { getCardFonts } from './card-fonts';
import { CACHE_TTL, cardKey } from './cache';

/** Bump when renderer/library options change in a way not encoded in the SVG. */
const RENDER_VERSION = 'resvg-2.6.2-v1';

export async function cardArtifactKey(svg: string): Promise<string> {
	// Hash actual fonts and SVG, including avatar bytes, ranks and UTC date.
	const input = JSON.stringify([
		RENDER_VERSION,
		CARD_RASTER_SIZE,
		getCardFonts().map((font) => Buffer.from(font).toString('base64')),
		svg
	]);
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return `card-artifact:${Buffer.from(digest).toString('hex')}`;
}

export async function getCardArtifact(kv: KVNamespace, key: string) {
	const { value, metadata } = await kv.getWithMetadata<{ expiresAt: number }>(key, 'arrayBuffer');
	if (!value || !Number.isFinite(metadata?.expiresAt) || metadata!.expiresAt <= Date.now() / 1000) {
		recordCacheOutcome('kv', 'miss', 'card-artifact');
		return null;
	}
	recordCacheOutcome('kv', 'hit', 'card-artifact');
	return { body: value, expiresAt: metadata!.expiresAt };
}

export function cacheCardArtifact(
	kv: KVNamespace,
	username: string,
	key: string,
	body: ArrayBuffer,
	existingExpiry?: number
): Promise<unknown> {
	const expiresAt = existingExpiry ?? Math.floor(Date.now() / 1000) + CACHE_TTL.CARD;
	// KV requires expiry at least 60s ahead. Never extend an artifact's lifetime.
	if (expiresAt <= Date.now() / 1000 + 60) return Promise.resolve();
	const options = { expiration: expiresAt, metadata: { contentType: 'image/png', expiresAt } };
	const writes = [kv.put(cardKey(username), body, options)];
	if (existingExpiry === undefined) writes.push(kv.put(key, body, options));
	return Promise.all(writes);
}
