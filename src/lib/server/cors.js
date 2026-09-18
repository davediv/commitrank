/**
 * Shared by the adapter cache and SvelteKit's API hook. Always allow the
 * request's own origin so previews and nonstandard local ports keep working.
 * @param {string | null} origin
 * @param {string} selfOrigin
 * @param {string} environment
 */
export function isAllowedApiOrigin(origin, selfOrigin, environment) {
	if (!origin) return false;
	if (origin === selfOrigin) return true;
	const allowed =
		environment === 'production'
			? ['https://commitrank.dev', 'https://www.commitrank.dev']
			: [
					'http://localhost:5173',
					'http://localhost:4173',
					'http://localhost:8788',
					'http://127.0.0.1:5173',
					'http://127.0.0.1:4173',
					'http://127.0.0.1:8788'
				];
	return allowed.includes(origin);
}
