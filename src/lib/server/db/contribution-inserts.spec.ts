import { describe, expect, it } from 'vitest';
import { createDb } from './index';
import { contributionInserts } from './contribution-inserts';

describe('contribution insert statements', () => {
	it('keeps a full year below 100 parameters even with every column supplied', () => {
		const db = createDb({} as D1Database);
		const rows = Array.from({ length: 366 }, (_, i) => ({
			id: String(i),
			user_id: 'user',
			date: `day-${i}`,
			commit_count: 1,
			pr_count: 0,
			issue_count: 0,
			review_count: 0,
			total_contributions: 1,
			created_at: '2026-01-01'
		}));
		const queries = contributionInserts(db, rows).map((statement) => statement.toSQL());
		expect(queries.every((query) => query.params.length <= 100)).toBe(true);
		expect(queries.reduce((sum, query) => sum + query.params.length, 0)).toBe(366 * 9);
		expect(queries).toHaveLength(34);
	});
	it('does not construct an invalid empty insert', () => {
		expect(contributionInserts(createDb({} as D1Database), [])).toEqual([]);
	});
});
