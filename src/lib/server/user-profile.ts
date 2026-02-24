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
	return Promise.all(
		PERIODS.map(async (period) => {
			const { startDate, endDate } = getDateRange(period);

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
