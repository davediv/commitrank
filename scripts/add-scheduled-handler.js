/**
 * Post-build script to add scheduled handler to the Cloudflare Worker
 *
 * This script patches the SvelteKit-generated _worker.js to add support
 * for Cloudflare Cron Triggers by adding a `scheduled` method to the default export.
 *
 * IMPORTANT: Cloudflare Workers require the scheduled handler to be a METHOD
 * on the default export object, NOT a standalone exported function.
 *
 * Run after `npm run build` with: node scripts/add-scheduled-handler.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = join(__dirname, '../.svelte-kit/cloudflare/_worker.js');

// Read the generated worker
let workerCode = readFileSync(workerPath, 'utf-8');

// Check if already patched (look for the scheduled method inside worker_default)
if (workerCode.includes('async scheduled(event, env, ctx)')) {
	console.log('Worker already patched with scheduled handler');
	process.exit(0);
}

// Helper functions to add before worker_default
const helperFunctionsCode = `
// ============================================
// SCHEDULED HANDLER HELPERS (added by post-build script)
// ============================================

// Import sync dependencies from built chunks
import { c as createDb, u as users, i as invalidateLeaderboardCache, d as deleteCached, s as setCached, e as lastSyncKey, a as contributions, b as statsKey } from "../output/server/chunks/cache.js";
import { asc, eq } from "drizzle-orm";
import { f as fetchContributions, G as GitHubApiError } from "../output/server/chunks/client.js";

const SYNC_REQUEST_DELAY_MS = 100;
const SYNC_BATCH_SIZE = 250;

async function syncUserContributions(db, userId, username, token) {
  try {
    const githubData = await fetchContributions(username, token);
    const contributionValues = githubData.contributions.days
      .filter((day) => day.contributionCount > 0)
      .map((day) => ({
        user_id: userId,
        date: day.date,
        commit_count: day.contributionCount,
        pr_count: 0,
        issue_count: 0,
        review_count: 0,
        total_contributions: day.contributionCount
      }));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString().split("T")[0];
    const recentContributions = contributionValues.filter((c) => c.date >= cutoffDate);

    if (recentContributions.length > 0) {
      for (const contrib of recentContributions) {
        await db.delete(contributions).where(eq(contributions.user_id, userId) && eq(contributions.date, contrib.date));
      }
      await db.insert(contributions).values(recentContributions);
    }

    await db.update(users).set({
      avatar_url: githubData.user.avatarUrl,
      display_name: githubData.user.name,
      bio: githubData.user.bio,
      location: githubData.user.location,
      company: githubData.user.company,
      blog: githubData.user.websiteUrl,
      public_repos: githubData.user.repositories,
      followers: githubData.user.followers,
      following: githubData.user.following,
      updated_at: new Date().toISOString()
    }).where(eq(users.id, userId));

    return { username, success: true, contributionsUpdated: recentContributions.length };
  } catch (error) {
    const errorMessage = error instanceof GitHubApiError
      ? \`\${error.type}: \${error.message}\`
      : error instanceof Error ? error.message : "Unknown error";
    await db.update(users).set({ updated_at: new Date().toISOString() }).where(eq(users.id, userId));
    return { username, success: false, error: errorMessage };
  }
}

function syncSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScheduledSync(dbBinding, kv, token) {
  const startTime = Date.now();
  const db = createDb(dbBinding);

  // Count total users
  const countResult = await db.select({ count: users.id }).from(users);
  const totalUsersInDb = countResult.length;

  // Fetch batch of users ordered by least recently updated
  const usersToSync = await db.select({
    id: users.id,
    github_username: users.github_username
  }).from(users).orderBy(asc(users.updated_at)).limit(SYNC_BATCH_SIZE);

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  console.log(\`[Sync] Starting batched sync: \${usersToSync.length}/\${totalUsersInDb} users (batch size: \${SYNC_BATCH_SIZE})\`);

  for (let i = 0; i < usersToSync.length; i++) {
    const user = usersToSync[i];
    const result = await syncUserContributions(db, user.id, user.github_username, token);
    if (result.success) {
      successCount++;
      console.log(\`[Sync] ✓ \${user.github_username}: \${result.contributionsUpdated} contributions\`);
    } else {
      failureCount++;
      console.log(\`[Sync] ✗ \${user.github_username}: \${result.error}\`);
    }
    results.push(result);
    if (i < usersToSync.length - 1) {
      await syncSleep(SYNC_REQUEST_DELAY_MS);
    }
  }

  const syncCompletedAt = new Date().toISOString();
  await Promise.all([
    invalidateLeaderboardCache(kv),
    deleteCached(kv, statsKey()),
    setCached(kv, lastSyncKey(), syncCompletedAt, 86400)
  ]);

  const durationMs = Date.now() - startTime;
  console.log(\`[Sync] Completed in \${Math.round(durationMs / 1000)}s: \${successCount}/\${usersToSync.length} success, \${failureCount} failed (\${totalUsersInDb} total users)\`);

  return { totalUsersInDb, batchSize: SYNC_BATCH_SIZE, syncedCount: usersToSync.length, successCount, failureCount, results, durationMs };
}

`;

// The scheduled method to add inside worker_default object (after fetch method)
const scheduledMethodCode = `,
  /**
   * Scheduled event handler for Cloudflare Cron Triggers
   * Runs at: 0 0,6,12,18 * * * (00:00, 06:00, 12:00, 18:00 UTC)
   */
  async scheduled(event, env, ctx) {
    console.log(\`[Cron] Scheduled sync triggered at \${new Date(event.scheduledTime).toISOString()}\`);
    console.log(\`[Cron] Cron pattern: \${event.cron}\`);

    const githubToken = env.GITHUB_TOKEN;
    if (!githubToken) {
      console.error("[Cron] GITHUB_TOKEN not configured");
      return;
    }

    try {
      ctx.waitUntil((async () => {
        const summary = await runScheduledSync(env.DB, env.KV, githubToken);
        console.log(\`[Cron] Sync completed: \${summary.successCount}/\${summary.syncedCount} succeeded in \${Math.round(summary.durationMs / 1000)}s (\${summary.totalUsersInDb} total users)\`);
      })());
    } catch (error) {
      console.error("[Cron] Sync failed:", error instanceof Error ? error.message : error);
    }
  }`;

// Step 1: Find var worker_default and insert helper functions before it
const workerDefaultMatch = workerCode.match(/var\s+worker_default\s*=\s*\{/);
if (!workerDefaultMatch) {
	console.error('Could not find worker_default declaration in worker');
	process.exit(1);
}

// Insert helper functions before worker_default
workerCode =
	workerCode.slice(0, workerDefaultMatch.index) +
	helperFunctionsCode +
	workerCode.slice(workerDefaultMatch.index);

// Step 2: Find the closing brace of the fetch method and add scheduled method after it
// The fetch method ends with "return pragma && res.status < 400 ? c(req, res, ctx) : res;\n  }\n};"
// We need to insert before the final "};" of worker_default

// Find the pattern: end of fetch method followed by closing of worker_default object
// Looking for the pattern "  }\n};" which closes fetch and then worker_default
const fetchEndPattern =
	/return pragma && res\.status < 400 \? c\(req, res, ctx\) : res;\s*\}\s*\};/;
const fetchEndMatch = workerCode.match(fetchEndPattern);

if (!fetchEndMatch) {
	console.error('Could not find fetch method end pattern in worker');
	process.exit(1);
}

// Replace the closing to inject our scheduled method
workerCode = workerCode.replace(
	fetchEndPattern,
	`return pragma && res.status < 400 ? c(req, res, ctx) : res;
  }${scheduledMethodCode}
};`
);

// Write the patched worker
writeFileSync(workerPath, workerCode);
console.log('Successfully added scheduled handler to worker (as method on default export)');
