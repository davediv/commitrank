/**
 * Scheduled sync service for updating user contributions
 *
 * This module handles the periodic synchronization of GitHub contribution data
 * for all registered users via Cloudflare Cron Triggers.
 */

import { createDb } from './db';
import { reconcileContributions } from './db/reconcile-contributions';
import { users } from './db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { fetchContributions, GitHubApiError } from './github';
import {
	invalidateLeaderboardCache,
	invalidateUserCache,
	deleteCached,
	statsKey,
	lastSyncKey,
	setCached
} from './cache';
import { fetchAndCacheAvatar } from './avatar';
import {
	DEFAULT_SYNC_BATCH_SIZE,
	DEFAULT_SYNC_REQUEST_DELAY_MS,
	type SyncRuntimeConfig
} from './sync-config';

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

export interface RunScheduledSyncOptions extends SyncRuntimeConfig {
	trigger: 'api' | 'scheduled';
	cron?: string;
	scheduledTime?: string;
}

/**
 * Sync contributions for a single user
 *
 * @param db - Database instance
 * @param kv - KV namespace for avatar caching
 * @param userId - User ID to sync
 * @param username - GitHub username
 * @param token - GitHub API token
 * @returns Sync result
 */
async function syncUserContributions(
	db: ReturnType<typeof createDb>,
	kv: KVNamespace<string>,
	userId: string,
	username: string,
	token: string
): Promise<SyncResult> {
	try {
		// Use the same inclusive UTC window for the request and reconciliation.
		const now = new Date();
		const sevenDaysAgo = new Date(now);
		sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
		const cutoffDate = sevenDaysAgo.toISOString().slice(0, 10);
		// Fetch fresh contribution data from GitHub
		const githubData = await fetchContributions(username, token, {
			from: `${cutoffDate}T00:00:00.000Z`,
			to: now.toISOString()
		});

		const contributionsUpdated = await reconcileContributions(
			db,
			userId,
			githubData.contributions.days,
			cutoffDate,
			now.toISOString().slice(0, 10)
		);

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

		// Track completion so the scheduled invocation cannot drop the refresh.
		if (githubData.user.avatarUrl) {
			await fetchAndCacheAvatar(kv, username, githubData.user.avatarUrl).catch(() => {
				// Silently ignore avatar cache failures
			});
		}

		return {
			username,
			success: true,
			contributionsUpdated
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
	token: string,
	options?: Partial<RunScheduledSyncOptions>
): Promise<SyncSummary> {
	const startTime = Date.now();
	const db = createDb(dbBinding);
	const batchSize = options?.batchSize ?? DEFAULT_SYNC_BATCH_SIZE;
	const requestDelayMs = options?.requestDelayMs ?? DEFAULT_SYNC_REQUEST_DELAY_MS;
	const trigger = options?.trigger ?? 'api';

	// Count total users in database
	const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
	const totalUsersInDb = Number(countResult.count);

	// Fetch batch of users ordered by least recently updated
	const usersToSync = await db
		.select({
			id: users.id,
			github_username: users.github_username
		})
		.from(users)
		.orderBy(asc(users.updated_at))
		.limit(batchSize);

	const results: SyncResult[] = [];
	let successCount = 0;
	let failureCount = 0;

	console.log(
		JSON.stringify({
			event: 'sync_start',
			trigger,
			cron: options?.cron,
			scheduledTime: options?.scheduledTime,
			totalUsersInDb,
			batchSize,
			requestDelayMs,
			usersSelected: usersToSync.length
		})
	);

	for (let i = 0; i < usersToSync.length; i++) {
		const user = usersToSync[i];
		const result = await syncUserContributions(db, kv, user.id, user.github_username, token);

		if (result.success) {
			successCount++;
		} else {
			failureCount++;
			console.log(`[Sync] ✗ ${user.github_username}: ${result.error}`);
		}

		results.push(result);

		// Delay between requests to respect rate limits
		if (i < usersToSync.length - 1) {
			await sleep(requestDelayMs);
		}
	}

	/*
	 * Invalidate what this run actually changed, then store the sync timestamp.
	 *
	 * This used to wipe the user, profile and card prefixes wholesale. A run
	 * touches `batchSize` users, but the wipe deleted every rendered share card
	 * in the namespace, so each one had to be rasterized again on its next
	 * request — the single most expensive operation in the app, re-run for the
	 * whole user base every hour. It bought no freshness either: the PNG
	 * carries its own Cache-Control and the adapter keeps it in `caches.default`,
	 * which a KV delete does not reach, so the edge went on serving the old
	 * bytes regardless.
	 *
	 * The leaderboard and stats keys are global aggregates — any user's numbers
	 * moving invalidates them, so those still go every run. A profile's own
	 * numbers only move when that profile syncs; what can drift in between is
	 * its rank, and CACHE_TTL bounds that.
	 */
	const syncCompletedAt = new Date().toISOString();
	await Promise.all([
		invalidateLeaderboardCache(kv),
		deleteCached(kv, statsKey()),
		// Store last sync timestamp (TTL: 24 hours - long enough to survive between syncs)
		setCached(kv, lastSyncKey(), syncCompletedAt, 86400),
		...usersToSync.map((user) => invalidateUserCache(kv, user.github_username))
	]);

	const durationMs = Date.now() - startTime;

	console.log(
		JSON.stringify({
			event: 'sync_complete',
			trigger,
			cron: options?.cron,
			scheduledTime: options?.scheduledTime,
			totalUsersInDb,
			usersSynced: usersToSync.length,
			successCount,
			failureCount,
			contributionDaysUpdated: results.reduce(
				(total, result) => total + (result.contributionsUpdated ?? 0),
				0
			),
			durationMs,
			batchSize,
			requestDelayMs
		})
	);

	return {
		totalUsersInDb,
		batchSize,
		syncedCount: usersToSync.length,
		successCount,
		failureCount,
		results,
		durationMs
	};
}
