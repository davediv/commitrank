import type { Handle } from '@sveltejs/kit';

const PAGE_CACHE_SECONDS = 60;
const PAGE_CACHE_NAME = 'commitrank-public-pages';
const LEADERBOARD_PERIODS = new Set(['today', '7days', '30days', 'year']);
const PROFILE_PATH = /^\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

/**
 * Allowed origins for CORS
 * In production, only allow commitrank.dev
 * In development, allow localhost
 */
function getAllowedOrigins(environment: string): string[] {
	if (environment === 'production') {
		return ['https://commitrank.dev', 'https://www.commitrank.dev'];
	}
	// Development: allow localhost on common ports
	return [
		'http://localhost:5173',
		'http://localhost:4173',
		'http://localhost:8788',
		'http://127.0.0.1:5173',
		'http://127.0.0.1:4173',
		'http://127.0.0.1:8788'
	];
}

/**
 * Add security headers to response
 * Note: CSP is handled by SvelteKit in svelte.config.js with proper script hashing
 *
 * Mutates rather than rebuilding. `resolve()` hands back a Response SvelteKit
 * owns, whose headers are writable — this is the pattern in its own hooks
 * documentation — and reconstructing one copies the entire header list and
 * re-wraps the body stream to change three entries.
 */
function addSecurityHeaders(response: Response): Response {
	// Additional security headers (CSP is set by SvelteKit)
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	return response;
}

function isPublicPageRequest(request: Request, url: URL): boolean {
	if (request.method !== 'GET' || !request.headers.get('Accept')?.includes('text/html')) {
		return false;
	}

	return url.pathname === '/' || (url.pathname !== '/join' && PROFILE_PATH.test(url.pathname));
}

/**
 * Collapse tracking and invalid query parameters into the same cache entry.
 * The server only renders period/page on the leaderboard and no query state on
 * profile pages, so this also prevents unbounded cache-key fragmentation.
 */
function createPageCacheKey(url: URL): Request {
	const cacheUrl = new URL(url.origin);
	cacheUrl.pathname = url.pathname;

	if (url.pathname === '/') {
		const period = url.searchParams.get('period');
		if (period && LEADERBOARD_PERIODS.has(period) && period !== 'today') {
			cacheUrl.searchParams.set('period', period);
		}

		const page = Number.parseInt(url.searchParams.get('page') || '', 10);
		if (Number.isFinite(page) && page > 1) {
			cacheUrl.searchParams.set('page', String(page));
		}
	}

	return new Request(cacheUrl, { method: 'GET' });
}

/**
 * Check if origin is allowed.
 *
 * The app's own origin always counts: a request whose `Origin` equals the site's
 * is by definition not cross-site. Without that clause the hard-coded list is
 * the whole allowlist, so any host that is not literally commitrank.dev — a
 * preview deployment, or a dev server that had to take a port other than 5173 —
 * rejects the site's own requests. That only started to matter once something
 * asked for an /api response in CORS mode: the profile share card loads the
 * avatar with `crossOrigin`, which is what makes the browser send `Origin` on a
 * same-origin GET at all.
 */
function isOriginAllowed(
	origin: string | null,
	allowedOrigins: string[],
	selfOrigin: string
): boolean {
	if (!origin) return false;
	return origin === selfOrigin || allowedOrigins.includes(origin);
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(
	response: Response,
	origin: string,
	isPreflight: boolean = false
): Response {
	response.headers.set('Access-Control-Allow-Origin', origin);
	response.headers.set('Access-Control-Allow-Credentials', 'true');

	if (isPreflight) {
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
		response.headers.set(
			'Access-Control-Allow-Headers',
			'Content-Type, Authorization, X-Requested-With'
		);
		response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
	}

	return response;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { request, url, platform } = event;
	const origin = request.headers.get('Origin');

	// Get environment from platform (defaults to production for safety)
	const environment = platform?.env?.ENVIRONMENT || 'production';

	// Handle API routes with CORS
	if (url.pathname.startsWith('/api/')) {
		const allowedOrigins = getAllowedOrigins(environment);

		// Handle preflight OPTIONS requests
		if (request.method === 'OPTIONS') {
			if (origin && isOriginAllowed(origin, allowedOrigins, url.origin)) {
				return addCorsHeaders(new Response(null, { status: 204 }), origin, true);
			}
			// Non-allowed origin for preflight
			return new Response('Forbidden', { status: 403 });
		}

		// For actual requests, check origin
		if (origin && !isOriginAllowed(origin, allowedOrigins, url.origin)) {
			return new Response('Forbidden', { status: 403 });
		}

		// Process the API request
		const response = await resolve(event);

		// Add CORS headers if origin is allowed
		if (origin && isOriginAllowed(origin, allowedOrigins, url.origin)) {
			return addCorsHeaders(response, origin);
		}

		return response;
	}

	/*
	 * Public SSR pages are identical for every visitor. Keep the rendered HTML in
	 * each Cloudflare data center briefly so repeat visitors avoid Worker, KV, and
	 * D1 latency while preserving the leaderboard's near-real-time behavior.
	 *
	 * The cache is opened only once a request is known to be able to use it. It
	 * used to be opened, and awaited, on every non-API request — form POSTs to
	 * /join included — before anything asked whether the response was cacheable.
	 */
	const pageCacheKey =
		platform?.caches && isPublicPageRequest(request, url) ? createPageCacheKey(url) : null;
	const pageCache = pageCacheKey ? await platform!.caches.open(PAGE_CACHE_NAME) : undefined;

	if (pageCache && pageCacheKey) {
		try {
			const cachedResponse = await pageCache.match(pageCacheKey);
			if (cachedResponse) {
				// Re-wrapped rather than mutated: a Cache API response's headers are
				// not guaranteed writable. This only re-points the body stream, so
				// unlike clone() it does not tee it.
				const hit = new Response(cachedResponse.body, cachedResponse);
				hit.headers.set('X-Page-Cache', 'HIT');
				return hit;
			}
		} catch (error) {
			console.error(
				JSON.stringify({
					event: 'page_cache_read_failed',
					path: url.pathname,
					error: error instanceof Error ? error.message : String(error)
				})
			);
		}
	}

	const response = addSecurityHeaders(await resolve(event));

	if (
		pageCache &&
		pageCacheKey &&
		response.status === 200 &&
		!/\b(private|no-cache|no-store)\b/i.test(response.headers.get('Cache-Control') || '') &&
		response.headers.get('Content-Type')?.includes('text/html') &&
		!response.headers.has('Set-Cookie')
	) {
		/*
		 * Set the headers on the response itself and take the copy afterwards, so
		 * the stored bytes and the served bytes come from one object. This path
		 * used to build four Responses per miss — one per header tweak — each
		 * copying the whole header list and re-wrapping the body.
		 */
		response.headers.set('Cache-Control', `public, max-age=${PAGE_CACHE_SECONDS}`);

		const cacheWrite = pageCache.put(pageCacheKey, response.clone()).catch((error) => {
			console.error(
				JSON.stringify({
					event: 'page_cache_write_failed',
					path: url.pathname,
					error: error instanceof Error ? error.message : String(error)
				})
			);
		});

		if (platform?.ctx) {
			platform.ctx.waitUntil(cacheWrite);
		} else {
			await cacheWrite;
		}

		// After the copy, so the stored entry does not claim a cache status of
		// its own when it is later served as a HIT.
		response.headers.set('X-Page-Cache', 'MISS');
	}

	return response;
};
