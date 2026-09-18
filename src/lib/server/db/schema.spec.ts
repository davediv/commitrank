import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('uses the NOCASE index without changing case-sensitive uniqueness', () => {
	const sqlite = new DatabaseSync(':memory:');
	try {
		sqlite.exec(readFileSync('drizzle/0000_initial_schema.sql', 'utf8'));
		sqlite.exec(readFileSync('drizzle/0001_username_nocase.sql', 'utf8'));
		sqlite.exec(readFileSync('drizzle/0001_username_nocase.sql', 'utf8'));
		sqlite.exec(
			"INSERT INTO users(id,github_username,github_id) VALUES ('a','Alice',1),('b','alice',2)"
		);
		const plan = sqlite
			.prepare(
				'EXPLAIN QUERY PLAN SELECT * FROM users WHERE github_username = ? COLLATE NOCASE LIMIT 1'
			)
			.all('ALICE');
		expect(
			plan.some((row) =>
				String(row.detail).includes('USING INDEX users_github_username_nocase_idx')
			)
		).toBe(true);
		expect(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get()?.count).toBe(2);
	} finally {
		sqlite.close();
	}
});
