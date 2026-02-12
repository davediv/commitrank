# CommitRank

**CommitRank** is a web application that ranks GitHub profiles by their commit contributions. Users submit their GitHub username (and optionally their Twitter/X handle), and the system fetches their contribution data from GitHub's API to display on a public leaderboard.

## Scheduled Sync Architecture

CommitRank now uses a dedicated Cloudflare Worker (`/Users/div/Desktop/project/commitrank/src/sync-worker.ts`) with native Cron Triggers instead of external HTTP cron services.

- Cron schedule: `0 * * * *` (hourly, UTC)
- Config file: `/Users/div/Desktop/project/commitrank/wrangler.sync.jsonc`
- Runtime knobs:
  - `SYNC_BATCH_SIZE` (default `75`)
  - `SYNC_REQUEST_DELAY_MS` (default `100`)

The `/api/sync` endpoint remains available as a manual/admin fallback trigger.

## Deploy

```bash
npm run deploy:app
npm run deploy:sync
```

Or deploy both:

```bash
npm run deploy:all
```
