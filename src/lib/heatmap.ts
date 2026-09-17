/**
 * Contribution heatmap geometry, shared by every renderer.
 *
 * The SVG heatmap on the profile page and the PNG share card both need the same
 * 53-week window and the same intensity thresholds. Computing that twice is how
 * an exported image quietly stops matching the page it claims to show, so the
 * date walk and the quartile ramp live here and each renderer only decides
 * where to put pixels.
 */

import type { ContributionDayData } from '$lib/types';

const DAY_MS = 86400000;
const WEEKS_BEFORE_CURRENT = 52;

export const DAYS_IN_WEEK = 7;

/** Number of steps in the phosphor ramp, level 0 (empty) included. */
export const HEATMAP_LEVELS = 5;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** February needs the leap rule; every other month is a constant. */
function daysInUtcMonth(year: number, month: number): number {
	if (month !== 1) return DAYS_IN_MONTH[month];
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
}

export const MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

export interface HeatmapCell {
	/** YYYY-MM-DD */
	date: string;
	count: number;
	/** Week index, 0 at the left edge. */
	col: number;
	/** Day of week, 0 = Sunday. */
	row: number;
	/** Intensity step, 0 through HEATMAP_LEVELS - 1. */
	level: number;
}

export interface HeatmapMonth {
	label: string;
	/** Week index the month's first Sunday falls in. */
	col: number;
}

export interface HeatmapGrid {
	/** Column-major: cells[col * DAYS_IN_WEEK + row]. */
	cells: HeatmapCell[];
	months: HeatmapMonth[];
	weeks: number;
}

/**
 * Split the non-zero counts at their quartiles so the ramp adapts to the
 * developer being rendered — a 3-commit day is dark for a maintainer and bright
 * for a hobbyist, and a fixed scale would flatten one of them.
 */
function computeThresholds(contributions: ContributionDayData[]): number[] {
	const nonZero = contributions.filter((c) => c.count > 0).map((c) => c.count);
	if (nonZero.length === 0) return [1, 2, 3, 4];

	nonZero.sort((a, b) => a - b);
	const q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
	const q2 = nonZero[Math.floor(nonZero.length * 0.5)] || q1 + 1;
	const q3 = nonZero[Math.floor(nonZero.length * 0.75)] || q2 + 1;
	return [1, q1 + 1, q2 + 1, q3 + 1];
}

/**
 * Build the 53-week grid ending on `now`.
 *
 * Everything is computed in UTC: the contribution rows are UTC dates and a
 * local-time walk would drop or double a day at a DST boundary.
 *
 * @param now Injectable for tests, and so one page renders every heatmap
 *            against a single "today" rather than one per component.
 */
export function buildHeatmapGrid(
	contributions: ContributionDayData[],
	now: Date = new Date()
): HeatmapGrid {
	const countByDate: Record<string, number> = {};
	for (const c of contributions) {
		countByDate[c.date] = c.count;
	}

	const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const todayDay = new Date(todayUtc).getUTCDay();
	// Start on the Sunday that opens the window, so column 0 is a whole week.
	const startMs = todayUtc - (todayDay + WEEKS_BEFORE_CURRENT * DAYS_IN_WEEK) * DAY_MS;
	const totalDays = Math.round((todayUtc - startMs) / DAY_MS) + 1;

	const thresholds = computeThresholds(contributions);
	const levelOf = (count: number): number => {
		if (count === 0) return 0;
		if (count < thresholds[1]) return 1;
		if (count < thresholds[2]) return 2;
		if (count < thresholds[3]) return 3;
		return 4;
	};

	const cells: HeatmapCell[] = [];
	const months: HeatmapMonth[] = [];
	let lastMonth = -1;

	/*
	 * Walked arithmetically rather than by allocating a Date per day and
	 * formatting it. `new Date().toISOString()` across the window was about
	 * two thirds of this function's cost, and it runs on every profile render
	 * and again for every share card.
	 *
	 * The window always opens on the Sunday that starts it, so the weekday is
	 * the loop index and needs no lookup either.
	 */
	const start = new Date(startMs);
	let year = start.getUTCFullYear();
	let month = start.getUTCMonth();
	let day = start.getUTCDate();

	for (let d = 0; d < totalDays; d++) {
		const row = d % DAYS_IN_WEEK;
		const col = (d / DAYS_IN_WEEK) | 0;
		const date = `${year}-${month < 9 ? '0' : ''}${month + 1}-${day < 10 ? '0' : ''}${day}`;

		// Labelled from the top row only, so a month never lands mid-column.
		if (month !== lastMonth && row === 0) {
			months.push({ label: MONTH_NAMES[month], col });
			lastMonth = month;
		}

		const dayCount = countByDate[date] || 0;
		cells.push({ date, count: dayCount, col, row, level: levelOf(dayCount) });

		if (++day > daysInUtcMonth(year, month)) {
			day = 1;
			if (++month > 11) {
				month = 0;
				year++;
			}
		}
	}

	return { cells, months, weeks: Math.ceil(totalDays / DAYS_IN_WEEK) };
}
