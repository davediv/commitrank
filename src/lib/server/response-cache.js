import { recordCacheOutcome } from './cpu-observability.js';
import { isAllowedApiOrigin } from './cors.js';

const PERIODS = new Set(['today', '7days', '30days', 'year']);
const USERNAME = '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?';
const PROFILE = new RegExp(`^/${USERNAME}$`);
const IMAGE = new RegExp(`^/api/(avatar/(${USERNAME})|card/(${USERNAME})\\.png)$`);
const DATA = new RegExp(`^/(?:${USERNAME}/)?__data\\.json$`);

/** @param {Request} request @param {string} environment */
export function responseCacheKey(request, environment = 'production') {
	if (
		request.method !== 'GET' ||
		request.headers.has('Authorization') ||
		request.headers.has('Cookie') ||
		/\b(no-cache|no-store)\b/i.test(request.headers.get('Cache-Control') || '')
	)
		return null;
	const url = new URL(request.url);
	const image = IMAGE.test(url.pathname);
	const html =
		(url.pathname === '/' || (url.pathname !== '/join' && PROFILE.test(url.pathname))) &&
		request.headers.get('Accept')?.includes('text/html');
	const data = DATA.test(url.pathname) && url.pathname !== '/join/__data.json';
	if (!image && !html && !data) return null;
	const origin = request.headers.get('Origin');
	if (image && origin && !isAllowedApiOrigin(origin, url.origin, environment)) return null;
	const key = new URL(url);
	// Versioned namespace avoids old entries with replayed CORS/cache headers.
	key.pathname = `/__commitrank_cache/v2${url.pathname}`;
	if (html) {
		key.search = '';
		if (url.pathname === '/') {
			const period = url.searchParams.get('period');
			if (period && PERIODS.has(period) && period !== 'today')
				key.searchParams.set('period', period);
			const page = Number.parseInt(url.searchParams.get('page') || '', 10);
			if (Number.isFinite(page) && page > 1) key.searchParams.set('page', String(page));
		}
	} else if (image) {
		key.pathname = key.pathname.toLowerCase();
		key.search = '';
		if (url.pathname.startsWith('/api/avatar/')) {
			// Keep size semantics in the avatar helper; only strip unrelated params.
			const size = url.searchParams.get('size');
			if (size !== null) key.searchParams.set('size', size);
		}
		key.searchParams.set('origin', origin || '');
	}
	// Data requests keep every SvelteKit invalidation/search parameter intact.
	return {
		key: new Request(key, { headers: request.headers }),
		resource: image
			? url.pathname.startsWith('/api/card/')
				? 'card'
				: 'avatar'
			: data
				? 'page-data'
				: 'html'
	};
}

/**
 * Decorates only the adapter's cache, never global state. The adapter retains
 * routing, assets, HEAD support, waitUntil, and HTTP cache-policy handling.
 * @param {Pick<Cache, 'match' | 'put'>} cache
 * @param {string} [environment]
 * @returns {Pick<Cache, 'match' | 'put'>}
 */
export function createResponseCache(cache, environment = 'production') {
	return {
		async match(input) {
			const request = input instanceof Request ? input : new Request(input);
			const entry = responseCacheKey(request, environment);
			if (!entry) return undefined;
			try {
				const response = await cache.match(entry.key);
				recordCacheOutcome('response', response ? 'hit' : 'miss', entry.resource);
				if (!response) return undefined;
				const hit = new Response(response.body, response);
				hit.headers.set('X-Response-Cache', 'HIT');
				if (entry.resource === 'html') hit.headers.set('X-Page-Cache', 'HIT');
				return hit;
			} catch {
				recordCacheOutcome('response', 'error', entry.resource, 1);
				return undefined;
			}
		},
		async put(input, response) {
			const request = input instanceof Request ? input : new Request(input);
			const entry = responseCacheKey(request, environment);
			if (
				!entry ||
				response.headers.has('Set-Cookie') ||
				/\b(private|no-cache|no-store)\b/i.test(response.headers.get('Cache-Control') || '')
			)
				return;
			try {
				await cache.put(entry.key, response);
			} catch {
				recordCacheOutcome('response', 'write-error', entry.resource, 1);
			}
		}
	};
}
