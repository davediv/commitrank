/**
 * Shared user profile utilities
 *
 * Provides reusable functions for computing period contributions and ranks,
 * used by both the profile page server load and the API endpoint.
 */

import { eq, sql, and, gte, desc } from 'drizzle-orm';
import { users, contributions } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import type { ContributionPeriod, PeriodContribution, UserProfile } from '$lib/types';

type DrizzleDb = ReturnType<typeof import('$lib/server/db').createDb>;

const PERIODS: ContributionPeriod[] = ['today', '7days', '30days', 'year'];

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

	return Promise.all(
		PERIODS.map(async (period) => {
			const { startDate, endDate } = ranges[period];

			const [contribResult, rankResult] = await Promise.all([
				// Get user's total contributions for this period
				db
					.select({
						total: sql<number>`COALESCE(SUM(${contributions.total_contributions}), 0)`
					})
					.from(contributions)
					.where(
						and(
							eq(contributions.user_id, userId),
							gte(contributions.date, startDate),
							sql`${contributions.date} <= ${endDate}`
						)
					),
				// Get all users ranked by contributions for this period
				db
					.select({
						user_id: users.id,
						total: sql<number>`COALESCE(SUM(${contributions.total_contributions}), 0)`.as('total')
					})
					.from(users)
					.leftJoin(
						contributions,
						and(
							eq(contributions.user_id, users.id),
							gte(contributions.date, startDate),
							sql`${contributions.date} <= ${endDate}`
						)
					)
					.groupBy(users.id)
					.orderBy(desc(sql`total`))
			]);

			const userContributions = Number(contribResult[0]?.total || 0);
			const rank = rankResult.findIndex((r) => r.user_id === userId) + 1;

			return {
				period,
				contributions: userContributions,
				rank: rank || 0
			};
		})
	);
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
