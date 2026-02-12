// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

declare global {
	namespace App {
		interface Platform {
			env: Env & {
				/** Secret key for authenticating manual /api/sync API calls (set via wrangler secret) */
				CRON_SECRET?: string;
				/** Optional sync batch size override for manual /api/sync runs */
				SYNC_BATCH_SIZE?: string;
				/** Optional delay between GitHub requests in milliseconds */
				SYNC_REQUEST_DELAY_MS?: string;
			};
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf: CfProperties & IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
