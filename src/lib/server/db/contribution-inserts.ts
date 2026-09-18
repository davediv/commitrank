import type { Database } from './index';
import { contributions, type NewContribution } from './schema';

/** Leave room for all nine columns, including optional IDs/timestamps. */
const ROWS_PER_STATEMENT = 11;

export function contributionInserts(db: Database, rows: NewContribution[]) {
	const statements = [];
	for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
		statements.push(db.insert(contributions).values(rows.slice(i, i + ROWS_PER_STATEMENT)));
	}
	return statements;
}

export async function insertContributions(db: Database, rows: NewContribution[]): Promise<void> {
	const [first, ...rest] = contributionInserts(db, rows);
	if (first) await db.batch([first, ...rest]);
}
