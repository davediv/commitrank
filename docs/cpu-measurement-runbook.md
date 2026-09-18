# CPU and cache measurement runbook

This implements the measurement plan in [the audit](cpu-audit-2026-09-18.md).
No production hit rate or CPU reduction has yet been measured.

## What the implementation measures

The adapter owns one response cache. `scripts/cloudflare-adapter.js` decorates
the upstream cache object after building; it fails the build if the expected
upstream integration is absent or duplicated. On adapter upgrades, review that
integration and run both tests and a local Workers smoke test. Supporting runtime
modules live outside the static asset directory.

Sampled structured log events have this shape:

```json
{
	"event": "cpu_cache",
	"layer": "response",
	"outcome": "hit",
	"resource": "card",
	"sample_rate": 0.1
}
```

- `layer=response`: actual adapter lookup before SvelteKit; resources `html`,
  `page-data`, `card`, `avatar`; outcomes `hit`, `miss`, `error`, `write-error`.
- `layer=kv`: lookups conditional on reaching application code; resource names
  are key prefixes, not usernames. `invalid` is an unusable JSON entry.
- `layer=compute`, `outcome=render`, `resource=card`: every attempted resvg render,
  sampled at 1. These include failed renders; correlate with error outcomes.
- Hits/misses sample at 0.1, cache errors at 1. Platform log sampling, if enabled,
  is an additional sampling factor. Weight events accordingly.
- Use invocation metadata for Worker name, version, CPU time and available colo
  information. Do not add usernames/IPs/query strings to metric dimensions.

`X-Response-Cache: HIT` is generated at the actual response lookup. `X-Page-Cache`
is updated on HTML hits. `X-Cache` still describes the underlying KV generation
and can be replayed from a response cache; do not use it as a response-hit metric.

Authenticated, cookie-bearing, non-GET and prohibited-cache requests bypass this
cache. JSON APIs also bypass it so rate limiting, CORS checks, dynamic timestamps
and response cache flags keep executing. The adapter itself bypasses no-cache
lookups. Bypasses are excluded from eligible cache-lookup denominators; use total
invocation counts separately to see how much traffic is ineligible.

## Production comparison

1. Use Workers Logs/Query Builder for **only** `commitrank` and `commitrank-sync`.
   Save a representative baseline and compare equivalent traffic/time windows
   after deployment. Include at least a full sync cycle and preferably 24 hours.
   Deployment and data migration are separate release steps, not performed by
   this implementation task.
2. Group by version, route template and available colo; count requests and sum
   invocation CPU. Compare mean and p50/p95 CPU with the same sampling policy.
   Do not treat application `durationMs` or request elapsed time as CPU.
3. Filter `event=cpu_cache`. Weight each event by `1 / sample_rate` (and platform
   sampling when applicable). Compute, separately for each layer/resource:

   ```text
   lookup hit rate = weighted hits / (weighted hits + weighted misses)
   lookup error rate = weighted errors / weighted attempted lookups
   render rate = weighted render attempts / total incoming card requests
   ```

   Report sample sizes and errors alongside percentages. KV hit rate is
   conditional on missing/bypassing response caching; never add the layers'
   denominators together. Do not include write errors as lookup misses.

4. Correlate events to invocation CPU through the platform invocation identifier.
   Report hit and miss CPU separately. Record profile/data misses after sync and
   whether identical card artifacts prevent rerendering.
5. Keep scheduled invocations and manual `/api/sync` requests separate. Compare
   sync CPU per selected/successful user and failure counts as well as totals.
6. Confirm response bodies, image dimensions, ranks/ties, UTC boundary counts,
   allowed/disallowed origins, cache freshness and rate limits. Check that the
   narrower GitHub window matches the former query at UTC date boundaries.

## Gates for conditional architecture

- Introduce Queue/DO coordination only if overlapping misses repeatedly render
  the same version, and account for added requests/storage/coordination cost.
  Generation must be idempotent; keep a correct response for first-time requests.
  Never blindly regenerate every user's card after every sync.
- Replace prefix deletion with generation keys only when measured cardinality
  and invalidation CPU justify publication/consistency complexity.
- Materialize rank snapshots only when D1 rows-read/query time justify them.
  Preserve global rank changes, tie-breaking, rolling windows and atomic updates.
- Do not extend cache TTLs to improve a graph at the expense of existing freshness.

## Local verification already performed

The production build was exercised with `wrangler dev --local` using isolated
temporary D1/KV state, the initial schema and the NOCASE index. Checks cover HTML
tracking-query reuse, profile rendering, a valid 640x640 PNG, image username-case
and query reuse, origin isolation, forbidden origins, JSON API bypass and no-store
empty leaderboard pages. This proves runtime integration, not production CPU.

The standalone idempotent index SQL is `drizzle/0001_username_nocase.sql`. Apply it
through the normal D1 release process. The existing historical Drizzle journal
does not match its initial SQL filename, so do not assume `db:migrate` is ready
to discover this standalone file.
