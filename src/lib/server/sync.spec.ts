import { describe, expect, it, vi } from 'vitest';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';

vi.mock('./db', () => ({ createDb: vi.fn() }));
vi.mock('./cache', async (importOriginal) => ({
	...(await importOriginal<typeof import('./cache')>()),
	invalidateLeaderboardCache: vi.fn(),
	deleteCached: vi.fn(),
	setCached: vi.fn()
}));

import { createDb } from './db';
import { runScheduledSync } from './sync';

describe('scheduled sync', () => {
	it('counts users in SQL without transferring every user ID', async () => {
		const select = vi
			.fn()
			.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([{ count: 20000 }]) })
			.mockReturnValueOnce({ from: () => ({ orderBy: () => ({ limit: async () => [] }) }) });
		vi.mocked(createDb).mockReturnValue({ select } as unknown as ReturnType<typeof createDb>);
		const result = await runScheduledSync({} as D1Database, {} as KVNamespace, 'token');
		expect(result.totalUsersInDb).toBe(20000);
		expect(result.syncedCount).toBe(0);
		const fields = select.mock.calls[0][0] as { count: SQL };
		expect(new SQLiteSyncDialect().sqlToQuery(fields.count).sql).toBe('COUNT(*)');
	});
});
