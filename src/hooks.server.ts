import type { Handle } from '@sveltejs/kit';

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

	// Handle non-API routes: add security headers
	const response = await resolve(event);
	return addSecurityHeaders(response);
};
