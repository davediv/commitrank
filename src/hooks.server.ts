import type { Handle } from '@sveltejs/kit';

const PAGE_CACHE_SECONDS = 60;
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
 */
function addSecurityHeaders(response: Response): Response {
	const headers = new Headers(response.headers);

	// Additional security headers (CSP is set by SvelteKit)
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('X-Frame-Options', 'DENY');
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
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

function withPageCacheStatus(response: Response, status: 'HIT' | 'MISS'): Response {
	const headers = new Headers(response.headers);
	headers.set('X-Page-Cache', status);

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

function createCacheableResponse(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set('Cache-Control', `public, max-age=${PAGE_CACHE_SECONDS}`);
	headers.delete('X-Page-Cache');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
	if (!origin) return false;
	return allowedOrigins.includes(origin);
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(
	response: Response,
	origin: string,
	isPreflight: boolean = false
): Response {
	const headers = new Headers(response.headers);

	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Access-Control-Allow-Credentials', 'true');

	if (isPreflight) {
		headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
		headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
		headers.set('Access-Control-Max-Age', '86400'); // 24 hours
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
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
			if (origin && isOriginAllowed(origin, allowedOrigins)) {
				return addCorsHeaders(new Response(null, { status: 204 }), origin, true);
			}
			// Non-allowed origin for preflight
			return new Response('Forbidden', { status: 403 });
		}

		// For actual requests, check origin
		if (origin && !isOriginAllowed(origin, allowedOrigins)) {
			return new Response('Forbidden', { status: 403 });
		}

		// Process the API request
		const response = await resolve(event);

		// Add CORS headers if origin is allowed
		if (origin && isOriginAllowed(origin, allowedOrigins)) {
			return addCorsHeaders(response, origin);
		}

		return response;
	}

	// Public SSR pages are identical for every visitor. Keep the rendered HTML in
	// each Cloudflare data center briefly so repeat visitors avoid Worker, KV, and
	// D1 latency while preserving the leaderboard's near-real-time behavior.
	const pageCache = platform?.caches
		? await platform.caches.open('commitrank-public-pages')
		: undefined;
	const cacheableRequest = pageCache && isPublicPageRequest(request, url);
	const pageCacheKey = cacheableRequest ? createPageCacheKey(url) : null;

	if (pageCache && pageCacheKey) {
		try {
			const cachedResponse = await pageCache.match(pageCacheKey);
			if (cachedResponse) {
				return withPageCacheStatus(cachedResponse, 'HIT');
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
		response.headers.get('Content-Type')?.includes('text/html') &&
		!response.headers.has('Set-Cookie')
	) {
		const responseForCache = createCacheableResponse(response.clone());
		const cacheWrite = pageCache.put(pageCacheKey, responseForCache).catch((error) => {
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

		return withPageCacheStatus(createCacheableResponse(response), 'MISS');
	}

	return response;
};
