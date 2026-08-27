import { describe, it, expect } from 'vitest';
import { buildHeatmapGrid, DAYS_IN_WEEK, HEATMAP_LEVELS } from './heatmap';
import type { ContributionDayData } from './types';

/* A Wednesday, so the window has a partial final week to get wrong. */
const NOW = new Date('2026-08-26T12:00:00Z');

function days(entries: Record<string, number>): ContributionDayData[] {
	return Object.entries(entries).map(([date, count]) => ({ date, count }));
}

describe('buildHeatmapGrid', () => {
	it('covers 53 weeks ending today', () => {
		const grid = buildHeatmapGrid([], NOW);

		expect(grid.weeks).toBe(53);
		expect(grid.cells.at(0)?.date).toBe('2025-08-24'); // the Sunday that opens the window
		expect(grid.cells.at(-1)?.date).toBe('2026-08-26');
	});

	it('opens on a Sunday and lays cells out column-major', () => {
		const grid = buildHeatmapGrid([], NOW);

		expect(grid.cells[0].row).toBe(0);
		// The hit test in the SVG heatmap indexes by col * 7 + row, so this
		// ordering is load-bearing rather than incidental.
		const sample = grid.cells[9 * DAYS_IN_WEEK + 4];
		expect([sample.col, sample.row]).toEqual([9, 4]);
	});

	it('walks dates in UTC across a DST boundary', () => {
		// US DST ends 2025-11-02; a local-time walk repeats or skips a day here.
		const grid = buildHeatmapGrid([], NOW);
		const around = grid.cells.filter((c) => c.date >= '2025-11-01' && c.date <= '2025-11-03');

		expect(around.map((c) => c.date)).toEqual(['2025-11-01', '2025-11-02', '2025-11-03']);
	});

	it('maps counts onto the day they fall on', () => {
		const grid = buildHeatmapGrid(days({ '2026-01-15': 12 }), NOW);

		expect(grid.cells.find((c) => c.date === '2026-01-15')?.count).toBe(12);
	});

	it('separates empty days from active ones, and ranks active days by count', () => {
		const grid = buildHeatmapGrid(days({ '2026-01-15': 1, '2026-01-16': 200 }), NOW);
		const level = (date: string) => grid.cells.find((c) => c.date === date)?.level ?? -1;

		expect(level('2026-01-14')).toBe(0);
		expect(level('2026-01-15')).toBeGreaterThan(0);
		expect(level('2026-01-16')).toBeGreaterThan(level('2026-01-15'));
	});

	it('spreads a wide range of counts across every level', () => {
		// Quartile thresholds are what keep a busy profile from rendering as one
		// flat colour; a fixed scale would collapse this into levels 0 and 4.
		const counts: Record<string, number> = {};
		for (let i = 0; i < 40; i++) {
			counts[`2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`] = i + 1;
		}
		const grid = buildHeatmapGrid(days(counts), NOW);
		const used = new Set(grid.cells.map((c) => c.level));

		expect(used.size).toBe(HEATMAP_LEVELS);
	});

	it('labels every month boundary once, in ascending columns', () => {
		const grid = buildHeatmapGrid([], NOW);

		// 13, not 12: a 53-week window opens and closes in the same month, so the
		// card legitimately shows August at both ends.
		expect(grid.months).toHaveLength(13);
		expect(grid.months.map((m) => m.col)).toEqual(
			[...grid.months.map((m) => m.col)].sort((a, b) => a - b)
		);
		expect(grid.months.every((m, i) => i === 0 || m.label !== grid.months[i - 1].label)).toBe(true);
	});

	it('handles a profile with no contributions at all', () => {
		const grid = buildHeatmapGrid([], NOW);

		expect(grid.cells.every((c) => c.level === 0 && c.count === 0)).toBe(true);
	});
});
