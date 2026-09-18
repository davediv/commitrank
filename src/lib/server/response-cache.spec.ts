import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResponseCache, responseCacheKey } from './response-cache.js';
import { instrumentWorker } from '../../../scripts/cloudflare-adapter.js';

const html = (path: string, headers = {}) =>
	new Request(`https://commitrank.dev${path}`, { headers: { Accept: 'text/html', ...headers } });
afterEach(() => vi.restoreAllMocks());

describe('single response cache', () => {
	it('collapses tracking/default query variants while preserving page and period', () => {
		const first = responseCacheKey(html('/?utm_source=test&period=today&page=1'));
		expect(first?.key.url).toBe(responseCacheKey(html('/'))?.key.url);
		expect(responseCacheKey(html('/?period=year'))?.key.url).not.toBe(first?.key.url);
		expect(responseCacheKey(html('/?page=2'))?.key.url).not.toBe(first?.key.url);
		expect(responseCacheKey(html('/Alice?utm_source=test'))?.key.url).toBe(
			responseCacheKey(html('/Alice'))?.key.url
		);
		expect(responseCacheKey(html('/Alice'))?.key.url).not.toBe(
			responseCacheKey(html('/alice'))?.key.url
		);
	});
	it('preserves SvelteKit data invalidation parameters and conditional headers', () => {
		const entry = responseCacheKey(
			html('/alice/__data.json?x-sveltekit-invalidated=01', { 'If-None-Match': 'etag' })
		);
		expect(entry?.key.url).toContain('x-sveltekit-invalidated=01');
		expect(entry?.key.headers.get('If-None-Match')).toBe('etag');
		expect(entry?.key.url).not.toBe(
			responseCacheKey(html('/alice/__data.json?x-sveltekit-invalidated=11'))?.key.url
		);
	});
	it('separates allowed image origins and rejects disallowed origins', () => {
		const url = 'https://commitrank.dev/api/card/Alice.png';
		const key = (origin?: string) =>
			responseCacheKey(new Request(url, { headers: origin ? { Origin: origin } : {} }));
		expect(key()?.key.url).not.toBe(key('https://commitrank.dev')?.key.url);
		expect(key('https://commitrank.dev')?.key.url).not.toBe(
			key('https://www.commitrank.dev')?.key.url
		);
		expect(key('https://attacker.example')).toBeNull();
		expect(key()?.key.url).toBe(
			responseCacheKey(new Request('https://commitrank.dev/api/card/alice.png?tracking=x'))?.key.url
		);
	});
	it('bypasses personalized, mutating, no-store and rate-limited requests', async () => {
		const cache = { match: vi.fn(), put: vi.fn() };
		const wrapper = createResponseCache(cache);
		for (const request of [
			html('/join'),
			html('/join/__data.json'),
			html('/api/leaderboard'),
			html('/api/stats'),
			html('/', { Cookie: 'session=value' }),
			html('/', { Authorization: 'Bearer token' }),
			html('/', { 'Cache-Control': 'no-store' }),
			new Request('https://commitrank.dev/', { method: 'POST' })
		]) {
			expect(await wrapper.match(request)).toBeUndefined();
			await wrapper.put(request, new Response('private'));
		}
		expect(cache.match).not.toHaveBeenCalled();
		expect(cache.put).not.toHaveBeenCalled();
	});
	it('logs actual hits and replaces replayed MISS headers', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const cache = {
			match: vi
				.fn()
				.mockResolvedValue(new Response('cached', { headers: { 'X-Page-Cache': 'MISS' } })),
			put: vi.fn()
		};
		const response = await createResponseCache(cache).match(html('/Alice'));
		expect(response?.headers.get('X-Response-Cache')).toBe('HIT');
		expect(response?.headers.get('X-Page-Cache')).toBe('HIT');
		expect(log).toHaveBeenCalledWith({
			event: 'cpu_cache',
			layer: 'response',
			outcome: 'hit',
			resource: 'html',
			sample_rate: 0.1
		});
		expect(JSON.stringify(log.mock.calls)).not.toContain('Alice');
	});
	it('does not store cookies or prohibited response cache policies', async () => {
		const cache = { match: vi.fn(), put: vi.fn() };
		const wrapper = createResponseCache(cache);
		for (const policy of ['private', 'no-store', 'no-cache'])
			await wrapper.put(html('/'), new Response('body', { headers: { 'Cache-Control': policy } }));
		await wrapper.put(
			html('/'),
			new Response('body', { headers: { 'Set-Cookie': 'session=value' } })
		);
		expect(cache.put).not.toHaveBeenCalled();
		await wrapper.put(
			html('/'),
			new Response('public', { headers: { 'Cache-Control': 'public,max-age=60' } })
		);
		expect(cache.put).toHaveBeenCalledOnce();
	});
	it('fails open on cache errors', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const cache = {
			match: vi.fn().mockRejectedValue(new Error('cache unavailable')),
			put: vi.fn().mockRejectedValue(new Error('cache unavailable'))
		};
		expect(await createResponseCache(cache).match(html('/'))).toBeUndefined();
		await expect(
			createResponseCache(cache).put(html('/'), new Response('body'))
		).resolves.toBeUndefined();
	});
	it('instruments the installed adapter and rejects unknown future integrations', () => {
		const source = readFileSync(
			'node_modules/@sveltejs/adapter-cloudflare/files/worker.js',
			'utf8'
		);
		expect(instrumentWorker(source)).toContain(
			'createResponseCache(caches.default, env.ENVIRONMENT)'
		);
		expect(() => instrumentWorker('changed adapter')).toThrow('integration changed');
	});
});
