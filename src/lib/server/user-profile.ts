/**
 * Shared user profile utilities
 *
 * Provides reusable functions for computing period contributions and ranks,
 * used by both the profile page server load and the API endpoint.
 */

import { sql } from 'drizzle-orm';
import { users } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import type { ContributionPeriod, PeriodContribution, UserProfile } from '$lib/types';

type DrizzleDb = ReturnType<typeof import('$lib/server/db').createDb>;

const PERIODS: ContributionPeriod[] = ['today', '7days', '30days', 'year'];

/** One row of per-period totals and ranks, as both rank queries select it. */
interface RankedTotals {
	today_total: number;
	today_rank: number;
	seven_days_total: number;
	seven_days_rank: number;
	thirty_days_total: number;
	thirty_days_rank: number;
	year_total: number;
	year_rank: number;
}

function toPeriodContributions(row: RankedTotals): PeriodContribution[] {
	return [
		{ period: 'today', contributions: Number(row.today_total), rank: Number(row.today_rank) },
		{
			period: '7days',
			contributions: Number(row.seven_days_total),
			rank: Number(row.seven_days_rank)
		},
		{
			period: '30days',
			contributions: Number(row.thirty_days_total),
			rank: Number(row.thirty_days_rank)
		},
		{ period: 'year', contributions: Number(row.year_total), rank: Number(row.year_rank) }
	];
}

/**
 * Get date range for a contribution period
 */
export function getDateRange(period: ContributionPeriod): { startDate: string; endDate: string } {
	const now = new Date();
	const endDate = now.toISOString().split('T')[0];

	let startDate: string;
	if (period === 'today') {
		startDate = endDate;
	} else if (period === '7days') {
		const weekAgo = new Date(now);
		weekAgo.setDate(weekAgo.getDate() - 6);
		startDate = weekAgo.toISOString().split('T')[0];
	} else if (period === '30days') {
		const monthAgo = new Date(now);
		monthAgo.setDate(monthAgo.getDate() - 29);
		startDate = monthAgo.toISOString().split('T')[0];
	} else {
		const yearAgo = new Date(now);
		yearAgo.setFullYear(yearAgo.getFullYear() - 1);
		yearAgo.setDate(yearAgo.getDate() + 1);
		startDate = yearAgo.toISOString().split('T')[0];
	}

	return { startDate, endDate };
}

/**
 * Compute contribution totals and ranks for all periods for a given user
 */
export async function computePeriodContributions(
	db: DrizzleDb,
	userId: string
): Promise<PeriodContribution[]> {
	const ranges = Object.fromEntries(
		PERIODS.map((period) => [period, getDateRange(period)])
	) as Record<ContributionPeriod, { startDate: string; endDate: string }>;

	try {
		// Compute all four totals and ranks in one D1 statement. The previous
		// implementation issued eight queries and transferred four full ranking
		// tables to the Worker just to find one row.
		const row = await db.get<RankedTotals>(sql`
			WITH totals AS (
				SELECT
					u.id,
					COALESCE(SUM(CASE WHEN c.date = ${ranges.today.startDate} THEN c.total_contributions ELSE 0 END), 0) AS today_total,
					COALESCE(SUM(CASE WHEN c.date >= ${ranges['7days'].startDate} AND c.date <= ${ranges['7days'].endDate} THEN c.total_contributions ELSE 0 END), 0) AS seven_days_total,
					COALESCE(SUM(CASE WHEN c.date >= ${ranges['30days'].startDate} AND c.date <= ${ranges['30days'].endDate} THEN c.total_contributions ELSE 0 END), 0) AS thirty_days_total,
					COALESCE(SUM(CASE WHEN c.date >= ${ranges.year.startDate} AND c.date <= ${ranges.year.endDate} THEN c.total_contributions ELSE 0 END), 0) AS year_total
				FROM users AS u
				LEFT JOIN contributions AS c
					ON c.user_id = u.id
					AND c.date >= ${ranges.year.startDate}
					AND c.date <= ${ranges.year.endDate}
				GROUP BY u.id
			), ranked AS (
				SELECT
					*,
					ROW_NUMBER() OVER (ORDER BY today_total DESC, id ASC) AS today_rank,
					ROW_NUMBER() OVER (ORDER BY seven_days_total DESC, id ASC) AS seven_days_rank,
					ROW_NUMBER() OVER (ORDER BY thirty_days_total DESC, id ASC) AS thirty_days_rank,
					ROW_NUMBER() OVER (ORDER BY year_total DESC, id ASC) AS year_rank
				FROM totals
			)
			SELECT
				today_total,
				today_rank,
				seven_days_total,
				seven_days_rank,
				thirty_days_total,
				thirty_days_rank,
				year_total,
				year_rank
			FROM ranked
			WHERE id = ${userId}
		`);

		if (!row) {
			return PERIODS.map((period) => ({ period, contributions: 0, rank: 0 }));
		}

		return toPeriodContributions(row);
	} catch (error) {
		// Keep compatibility with older/local SQLite builds while the optimized
		// query is rolled out. This path preserves correctness at higher latency.
		console.error(
			JSON.stringify({
				event: 'profile_rank_query_fallback',
				error: error instanceof Error ? error.message : String(error)
			})
		);
	}

	/*
	 * Same four totals and ranks without window functions, for a SQLite that
	 * predates them. Ranks are counted rather than ordered, so this no longer
	 * pulls four complete ranking tables into the Worker to read four indices
	 * out of them — that was the expensive part, not ROW_NUMBER.
	 */
	const fallback = await db.get<RankedTotals>(sql`
		WITH totals AS (
			SELECT
				u.id AS id,
				COALESCE(SUM(CASE WHEN c.date = ${ranges.today.startDate} THEN c.total_contributions ELSE 0 END), 0) AS today_total,
				COALESCE(SUM(CASE WHEN c.date >= ${ranges['7days'].startDate} AND c.date <= ${ranges['7days'].endDate} THEN c.total_contributions ELSE 0 END), 0) AS seven_days_total,
				COALESCE(SUM(CASE WHEN c.date >= ${ranges['30days'].startDate} AND c.date <= ${ranges['30days'].endDate} THEN c.total_contributions ELSE 0 END), 0) AS thirty_days_total,
				COALESCE(SUM(CASE WHEN c.date >= ${ranges.year.startDate} AND c.date <= ${ranges.year.endDate} THEN c.total_contributions ELSE 0 END), 0) AS year_total
			FROM users AS u
			LEFT JOIN contributions AS c
				ON c.user_id = u.id
				AND c.date >= ${ranges.year.startDate}
				AND c.date <= ${ranges.year.endDate}
			GROUP BY u.id
		)
		SELECT
			t.today_total,
			1 + (SELECT COUNT(*) FROM totals AS o WHERE o.today_total > t.today_total OR (o.today_total = t.today_total AND o.id < t.id)) AS today_rank,
			t.seven_days_total,
			1 + (SELECT COUNT(*) FROM totals AS o WHERE o.seven_days_total > t.seven_days_total OR (o.seven_days_total = t.seven_days_total AND o.id < t.id)) AS seven_days_rank,
			t.thirty_days_total,
			1 + (SELECT COUNT(*) FROM totals AS o WHERE o.thirty_days_total > t.thirty_days_total OR (o.thirty_days_total = t.thirty_days_total AND o.id < t.id)) AS thirty_days_rank,
			t.year_total,
			1 + (SELECT COUNT(*) FROM totals AS o WHERE o.year_total > t.year_total OR (o.year_total = t.year_total AND o.id < t.id)) AS year_rank
		FROM totals AS t
		WHERE t.id = ${userId}
	`);

	if (!fallback) {
		return PERIODS.map((period) => ({ period, contributions: 0, rank: 0 }));
	}

	return toPeriodContributions(fallback);
}

/**
 * Rank a user by today's contributions.
 *
 * Counts the users ahead instead of materializing the ordering. The previous
 * implementation — duplicated in the join action and the register endpoint —
 * selected every user row with their daily total, shipped the whole table to
 * the Worker and linear-scanned it for one index. That is Worker CPU and D1
 * rows-read proportional to the entire user base, on every registration.
 *
 * The tiebreak matches the ROW_NUMBER ordering in `computePeriodContributions`,
 * so the rank a user is told at registration is the one their profile shows.
 * `findIndex` over a `total DESC` sort left ties to SQLite's discretion, and
 * the two could disagree.
 */
export async function calculateTodayRank(db: DrizzleDb, userId: string): Promise<number> {
	const { startDate } = getDateRange('today');

	const row = await db.get<{ rank: number }>(sql`
		WITH totals AS (
			SELECT u.id AS id, COALESCE(SUM(c.total_contributions), 0) AS total
			FROM users AS u
			LEFT JOIN contributions AS c
				ON c.user_id = u.id AND c.date = ${startDate}
			GROUP BY u.id
		)
		SELECT 1 + (
			SELECT COUNT(*) FROM totals AS o
			WHERE o.total > t.total OR (o.total = t.total AND o.id < t.id)
		) AS rank
		FROM totals AS t
		WHERE t.id = ${userId}
	`);

	return Number(row?.rank ?? 0);
}

/**
 * Find a user by their GitHub username (case-insensitive via COLLATE NOCASE)
 */
export async function findUserByUsername(db: DrizzleDb, username: string): Promise<User | null> {
	const result = await db
		.select()
		.from(users)
		.where(sql`${users.github_username} = ${username} COLLATE NOCASE`)
		.limit(1);
	return result[0] ?? null;
}

/**
 * Build a UserProfile object from a database User row and period contributions
 */
export function buildUserProfile(
	user: User,
	periodContributions: PeriodContribution[]
): UserProfile {
	return {
		id: user.id,
		github_username: user.github_username,
		github_id: user.github_id,
		display_name: user.display_name,
		avatar_url: user.avatar_url,
		bio: user.bio,
		twitter_handle: user.twitter_handle,
		location: user.location,
		company: user.company,
		blog: user.blog,
		public_repos: user.public_repos ?? 0,
		followers: user.followers ?? 0,
		following: user.following ?? 0,
		github_created_at: user.github_created_at ?? '',
		created_at: user.created_at,
		updated_at: user.updated_at,
		contributions: periodContributions
	};
}
