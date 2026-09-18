import adapter from '@sveltejs/adapter-cloudflare';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The upstream adapter has no cache customization option. Keep its entrypoint,
 * replacing only the cache object; fail the build if that integration changes.
 * @param {string} source
 */
export function instrumentWorker(source) {
	const marker = 'var s = caches.default;';
	if (source.split(marker).length !== 2)
		throw new Error('Cloudflare adapter cache integration changed; review before deploying');
	return (
		`import { createResponseCache } from '../cloudflare-tmp/response-cache.js';\n` +
		source.replace(marker, 'var s = createResponseCache(caches.default, env.ENVIRONMENT);')
	);
}

/** @returns {import('@sveltejs/kit').Adapter} */
export default function instrumentedAdapter() {
	const upstream = adapter();
	return {
		...upstream,
		async adapt(builder) {
			await upstream.adapt(builder);
			const worker = path.join(builder.getBuildDirectory('cloudflare'), '_worker.js');
			const instrumented = instrumentWorker(readFileSync(worker, 'utf8'));
			for (const file of ['response-cache.js', 'cpu-observability.js', 'cors.js']) {
				builder.copy(
					`src/lib/server/${file}`,
					path.join(builder.getBuildDirectory('cloudflare-tmp'), file)
				);
			}
			writeFileSync(worker, instrumented);
		}
	};
}
