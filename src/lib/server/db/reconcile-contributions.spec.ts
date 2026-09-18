import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createDb } from './index';
import { reconcileContributions } from './reconcile-contributions';

describe('contribution reconciliation', () => {
	it('atomically replaces returned dates including zeroes, preserving other rows', async () => {
		const sqlite = new DatabaseSync(':memory:');
		sqlite.exec(readFileSync('drizzle/0000_initial_schema.sql', 'utf8'));
		sqlite.exec(`INSERT INTO users(id, github_username, github_id) VALUES ('a','alice',1),('b','bob',2);
		INSERT INTO contributions(id,user_id,date,total_contributions) VALUES
		('1','a','2026-09-11',9),('2','a','2026-09-18',7),
		('3','a','2026-09-10',4),('4','b','2026-09-18',3),('5','a','2026-09-12',2);`);
		const db = createDb({} as D1Database);
		const batch = vi.spyOn(db, 'batch').mockImplementation(async (statements) => {
			sqlite.exec('BEGIN');
			try {
				for (const statement of statements) {
					if (!('toSQL' in statement) || typeof statement.toSQL !== 'function') {
						throw new Error('Expected a Drizzle SQL statement');
					}
					const query: { sql: string; params: SQLInputValue[] } = statement.toSQL();
					expect(query.params.length).toBeLessThanOrEqual(100);
					sqlite.prepare(query.sql).run(...(query.params as SQLInputValue[]));
				}
				sqlite.exec('COMMIT');
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
			return [];
		});
		try {
			const count = await reconcileContributions(
				db,
				'a',
				[
					{ date: '2026-09-10', contributionCount: 99 },
					{ date: '2026-09-11', contributionCount: 5 },
					{ date: '2026-09-18', contributionCount: 0 },
					{ date: '2026-09-19', contributionCount: 99 }
				],
				'2026-09-11',
				'2026-09-18'
			);
			expect(count).toBe(1);
			expect(batch).toHaveBeenCalledOnce();
			expect(
				sqlite
					.prepare(
						'SELECT user_id,date,total_contributions FROM contributions ORDER BY user_id,date'
					)
					.all()
			).toEqual([
				{ user_id: 'a', date: '2026-09-10', total_contributions: 4 },
				{ user_id: 'a', date: '2026-09-11', total_contributions: 5 },
				{ user_id: 'a', date: '2026-09-12', total_contributions: 2 },
				{ user_id: 'b', date: '2026-09-18', total_contributions: 3 }
			]);
		} finally {
			sqlite.close();
		}
	});
	it('does not delete anything when the upstream calendar is empty', async () => {
		const db = createDb({} as D1Database);
		const batch = vi.spyOn(db, 'batch');
		expect(await reconcileContributions(db, 'a', [], '2026-09-11', '2026-09-18')).toBe(0);
		expect(batch).not.toHaveBeenCalled();
	});
});
