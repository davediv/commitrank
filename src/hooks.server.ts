import type { Handle } from '@sveltejs/kit';
import { isAllowedApiOrigin } from '$lib/server/cors.js';

const PAGE_CACHE_SECONDS = 60;
const PROFILE_PATH = /^\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

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
		// Handle preflight OPTIONS requests
		if (request.method === 'OPTIONS') {
			if (origin && isAllowedApiOrigin(origin, url.origin, environment)) {
				return addCorsHeaders(new Response(null, { status: 204 }), origin, true);
			}
			// Non-allowed origin for preflight
			return new Response('Forbidden', { status: 403 });
		}

		// For actual requests, check origin
		if (origin && !isAllowedApiOrigin(origin, url.origin, environment)) {
			return new Response('Forbidden', { status: 403 });
		}

		// Process the API request
		const response = await resolve(event);

		// Add CORS headers if origin is allowed
		if (origin && isAllowedApiOrigin(origin, url.origin, environment)) {
			return addCorsHeaders(response, origin);
		}

		return response;
	}

	const response = addSecurityHeaders(await resolve(event));
	if (
		platform?.caches &&
		isPublicPageRequest(request, url) &&
		response.status === 200 &&
		response.headers.get('Content-Type')?.includes('text/html') &&
		!response.headers.has('Set-Cookie') &&
		!/\b(private|no-cache|no-store)\b/i.test(response.headers.get('Cache-Control') || '')
	) {
		// One response cache in the adapter owns lookup, normalization and writes.
		response.headers.set('Cache-Control', `public, max-age=${PAGE_CACHE_SECONDS}`);
		response.headers.set('X-Page-Cache', 'MISS');
	}
	return response;
};
