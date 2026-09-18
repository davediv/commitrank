import { and, eq, inArray } from 'drizzle-orm';
import type { ContributionDay } from '../github';
import type { Database } from './index';
import { contributions } from './schema';
import { contributionInserts } from './contribution-inserts';

/** Replace only dates actually returned by GitHub, including new zero counts. */
export async function reconcileContributions(
	db: Database,
	userId: string,
	days: ContributionDay[],
	startDate: string,
	endDate: string
): Promise<number> {
	const recent = days.filter((day) => day.date >= startDate && day.date <= endDate);
	if (recent.length === 0) return 0;
	const rows = recent
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
	await db.batch([
		db.delete(contributions).where(
			and(
				eq(contributions.user_id, userId),
				inArray(
					contributions.date,
					recent.map((day) => day.date)
				)
			)
		),
		...contributionInserts(db, rows)
	]);
	return rows.length;
}
