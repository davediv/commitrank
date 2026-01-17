/**
 * Scheduled sync service for updating user contributions
 *
 * This module handles the periodic synchronization of GitHub contribution data
 * for all registered users via Cloudflare Cron Triggers.
 */

import { createDb } from './db';
import { users, contributions } from './db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { fetchContributions, GitHubApiError } from './github';
import {
	invalidateLeaderboardCache,
	deleteCached,
	statsKey,
	lastSyncKey,
	setCached
} from './cache';

/**
 * Result of syncing a single user
 */
interface SyncResult {
	username: string;
	success: boolean;
	error?: string;
	contributionsUpdated?: number;
}

/**
 * Summary of the sync job
 */
interface SyncSummary {
	totalUsersInDb: number;
	batchSize: number;
	syncedCount: number;
	successCount: number;
	failureCount: number;
	results: SyncResult[];
	durationMs: number;
}

/**
 * Delay between API requests to respect rate limits
 * GitHub allows 5,000 requests/hour with auth, but we're conservative
 */
const REQUEST_DELAY_MS = 100;

/**
 * Maximum number of users to sync per cron run
 * With 4 cron runs/day (every 6 hours), this allows ~1000 users/day
 * This prevents Worker CPU timeout (30s limit) on large user bases
 */
const BATCH_SIZE = 250;

/**
 * Sync contributions for a single user
 *
 * @param db - Database instance
 * @param userId - User ID to sync
 * @param username - GitHub username
 * @param token - GitHub API token
 * @returns Sync result
 */
async function syncUserContributions(
	db: ReturnType<typeof createDb>,
	userId: string,
	username: string,
	token: string
): Promise<SyncResult> {
	try {
		// Fetch fresh contribution data from GitHub
		const githubData = await fetchContributions(username, token);

		// Get contribution days with data
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

		// Upsert contribution records
		// D1/SQLite doesn't have great upsert support, so we'll delete and insert
		// For performance, we only update the last 7 days
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
		const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

		// Filter to recent contributions only
		const recentContributions = contributionValues.filter((c) => c.date >= cutoffDate);

		if (recentContributions.length > 0) {
			// Delete existing records for these dates
			for (const contrib of recentContributions) {
				await db
					.delete(contributions)
					.where(and(eq(contributions.user_id, userId), eq(contributions.date, contrib.date)));
			}

			// Insert new records
			await db.insert(contributions).values(recentContributions);
		}

		// Update user's updated_at timestamp
		await db
			.update(users)
			.set({
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
			})
			.where(eq(users.id, userId));

		return {
			username,
			success: true,
			contributionsUpdated: recentContributions.length
		};
	} catch (error) {
		const errorMessage =
			error instanceof GitHubApiError
				? `${error.type}: ${error.message}`
				: error instanceof Error
					? error.message
					: 'Unknown error';

		// Still update the timestamp to prevent retry loop
		await db
			.update(users)
			.set({ updated_at: new Date().toISOString() })
			.where(eq(users.id, userId));

		return {
			username,
			success: false,
			error: errorMessage
		};
	}
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the scheduled sync job
 *
 * Fetches users ordered by updated_at ASC (oldest first) and syncs
 * their contribution data from GitHub. Uses batching to prevent
 * Worker CPU timeout on large user bases.
 *
 * The updated_at timestamp is updated after each sync, so users
 * naturally rotate through the queue across multiple cron runs.
 *
 * @param db - D1 Database binding
 * @param kv - KV Namespace binding
 * @param token - GitHub API token
 * @returns Sync summary
 */
export async function runScheduledSync(
	dbBinding: D1Database,
	kv: KVNamespace<string>,
	token: string
): Promise<SyncSummary> {
	const startTime = Date.now();
	const db = createDb(dbBinding);

	// Count total users in database
	const countResult = await db.select({ count: users.id }).from(users);
	const totalUsersInDb = countResult.length;

	// Fetch batch of users ordered by least recently updated
	const usersToSync = await db
		.select({
			id: users.id,
			github_username: users.github_username
		})
		.from(users)
		.orderBy(asc(users.updated_at))
		.limit(BATCH_SIZE);

	const results: SyncResult[] = [];
	let successCount = 0;
	let failureCount = 0;

	console.log(
		`[Sync] Starting batched sync: ${usersToSync.length}/${totalUsersInDb} users (batch size: ${BATCH_SIZE})`
	);

	for (let i = 0; i < usersToSync.length; i++) {
		const user = usersToSync[i];
		const result = await syncUserContributions(db, user.id, user.github_username, token);

		if (result.success) {
			successCount++;
			console.log(`[Sync] ✓ ${user.github_username}: ${result.contributionsUpdated} contributions`);
		} else {
			failureCount++;
			console.log(`[Sync] ✗ ${user.github_username}: ${result.error}`);
		}

		results.push(result);

		// Delay between requests to respect rate limits
		if (i < usersToSync.length - 1) {
			await sleep(REQUEST_DELAY_MS);
		}
	}

	// Invalidate all caches after sync and store last sync timestamp
	const syncCompletedAt = new Date().toISOString();
	await Promise.all([
		invalidateLeaderboardCache(kv),
		deleteCached(kv, statsKey()),
		// Store last sync timestamp (TTL: 24 hours - long enough to survive between syncs)
		setCached(kv, lastSyncKey(), syncCompletedAt, 86400)
	]);

	const durationMs = Date.now() - startTime;

	console.log(
		`[Sync] Completed in ${Math.round(durationMs / 1000)}s: ${successCount}/${usersToSync.length} success, ${failureCount} failed (${totalUsersInDb} total users)`
	);

	return {
		totalUsersInDb,
		batchSize: BATCH_SIZE,
		syncedCount: usersToSync.length,
		successCount,
		failureCount,
		results,
		durationMs
	};
}
