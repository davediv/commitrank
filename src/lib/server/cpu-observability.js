/**
 * Compact events correlate with Workers invocation logs (CPU, colo, version).
 * No usernames, query strings, IPs, tokens, or payloads are logged here.
 * @param {string} layer
 * @param {string} outcome
 * @param {string} resource
 * @param {number} [sampleRate]
 */
export function recordCacheOutcome(layer, outcome, resource, sampleRate = 0.1) {
	if (Math.random() >= sampleRate) return;
	console.log({ event: 'cpu_cache', layer, outcome, resource, sample_rate: sampleRate });
}
