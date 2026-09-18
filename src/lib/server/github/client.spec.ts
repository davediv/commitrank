import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchContributions } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('contribution query window', () => {
	it.each([undefined, { from: '2026-09-11T00:00:00.000Z', to: '2026-09-18T15:00:00.000Z' }])(
		'keeps optional bounds in GraphQL variables: %j',
		async (window) => {
			const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { user: null } }));
			vi.stubGlobal('fetch', fetchMock);
			await expect(fetchContributions('example', 'token', window)).rejects.toThrow('not found');
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.variables).toEqual({ username: 'example', ...window });
			expect(body.query).toContain('contributionsCollection(from: $from, to: $to)');
			if (!window) {
				expect(body.variables).not.toHaveProperty('from');
				expect(body.variables).not.toHaveProperty('to');
			}
		}
	);
});
