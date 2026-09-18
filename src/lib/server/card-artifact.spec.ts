import { afterEach, describe, expect, it, vi } from 'vitest';
const fonts = vi.hoisted(() => ({ bytes: new Uint8Array([1, 2, 3]) }));
vi.mock('./card-fonts', () => ({ getCardFonts: () => [fonts.bytes] }));
import { cardArtifactKey, cacheCardArtifact, getCardArtifact } from './card-artifact';

afterEach(() => vi.useRealTimers());

describe('content-addressed cards', () => {
	it('reuses identical SVG but separates changed ranks, dates, avatars and fonts', async () => {
		const svg = '<svg><text>rank 1; 2026-09-18</text><image href="avatar-a"/></svg>';
		const key = await cardArtifactKey(svg);
		expect(await cardArtifactKey(svg)).toBe(key);
		for (const changed of [
			svg.replace('rank 1', 'rank 2'),
			svg.replace('09-18', '09-19'),
			svg.replace('avatar-a', 'avatar-b')
		]) {
			expect(await cardArtifactKey(changed)).not.toBe(key);
		}
		fonts.bytes = new Uint8Array([4, 5, 6]);
		expect(await cardArtifactKey(svg)).not.toBe(key);
	});

	it('restores an invalidated alias without extending expiry or rewriting the artifact', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
		const put = vi.fn().mockResolvedValue(undefined);
		const kv = { put } as unknown as KVNamespace;
		const body = new ArrayBuffer(8);
		const expiresAt = Math.floor(Date.now() / 1000) + 3600;
		await cacheCardArtifact(kv, 'Example', 'artifact', body, expiresAt);
		expect(put).toHaveBeenCalledExactlyOnceWith('card:example', body, {
			expiration: expiresAt,
			metadata: { contentType: 'image/png', expiresAt }
		});
	});

	it('does not extend artifacts too close to KV minimum expiry', async () => {
		const put = vi.fn();
		await cacheCardArtifact(
			{ put } as unknown as KVNamespace,
			'example',
			'artifact',
			new ArrayBuffer(0),
			Math.floor(Date.now() / 1000) + 30
		);
		expect(put).not.toHaveBeenCalled();
	});

	it('ignores expired or unversioned artifacts', async () => {
		const getWithMetadata = vi
			.fn()
			.mockResolvedValue({ value: new ArrayBuffer(8), metadata: { expiresAt: 0 } });
		const kv = { getWithMetadata } as unknown as KVNamespace;
		expect(await getCardArtifact(kv, 'artifact')).toBeNull();
		getWithMetadata.mockResolvedValue({ value: new ArrayBuffer(8), metadata: null });
		expect(await getCardArtifact(kv, 'artifact')).toBeNull();
	});
});
