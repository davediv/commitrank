<script lang="ts">
	import type { ContributionDayData } from '$lib/types';

	interface Props {
		contributions: ContributionDayData[];
	}

	let { contributions }: Props = $props();

	const CELL_SIZE = 11;
	const CELL_GAP = 2;
	const CELL_STEP = CELL_SIZE + CELL_GAP;
	const LABEL_WIDTH = 28;
	const HEADER_HEIGHT = 16;
	const DAYS_IN_WEEK = 7;

	const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
	const MONTH_NAMES = [
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

	// Color levels for dark theme (oklch green scale)
	const COLORS = [
		'oklch(0.22 0.015 250)', // 0: empty
		'oklch(0.30 0.08 145)', // 1: low
		'oklch(0.38 0.12 145)', // 2: medium-low
		'oklch(0.46 0.15 145)', // 3: medium
		'oklch(0.55 0.18 145)' // 4: high (matches --success)
	];

	interface CellData {
		date: string;
		count: number;
		col: number;
		row: number;
		color: string;
	}

	/**
	 * Build the heatmap grid data from contribution data.
	 * Extracted as a plain function to avoid ESLint svelte/prefer-svelte-reactivity
	 * warnings for Map/Date inside $derived.
	 */
	function buildHeatmapData(contribs: ContributionDayData[]) {
		// Build lookup object
		const countMap: Record<string, number> = {};
		for (const c of contribs) {
			countMap[c.date] = c.count;
		}

		// Use UTC to avoid DST issues
		const today = new Date();
		const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
		const todayDay = new Date(todayUtc).getUTCDay(); // 0=Sunday

		// Start date: 52 weeks before the start of the current week
		const startMs = todayUtc - (todayDay + 52 * 7) * 86400000;
		const endMs = todayUtc;

		// Compute thresholds based on non-zero values
		const nonZero = contribs.filter((c) => c.count > 0).map((c) => c.count);
		nonZero.sort((a, b) => a - b);

		let thresholds: number[];
		if (nonZero.length === 0) {
			thresholds = [1, 2, 3, 4];
		} else {
			const q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
			const q2 = nonZero[Math.floor(nonZero.length * 0.5)] || q1 + 1;
			const q3 = nonZero[Math.floor(nonZero.length * 0.75)] || q2 + 1;
			thresholds = [1, q1 + 1, q2 + 1, q3 + 1];
		}

		function getColor(count: number): string {
			if (count === 0) return COLORS[0];
			if (count < thresholds[1]) return COLORS[1];
			if (count < thresholds[2]) return COLORS[2];
			if (count < thresholds[3]) return COLORS[3];
			return COLORS[4];
		}

		// Generate cells
		const cells: CellData[] = [];
		const monthLabels: { label: string; x: number }[] = [];
		let lastMonth = -1;

		const totalDays = Math.ceil((endMs - startMs) / 86400000) + 1;
		const numWeeks = Math.ceil(totalDays / 7);
		let currentMs = startMs;

		for (let d = 0; d < totalDays; d++) {
			const current = new Date(currentMs);
			const dateStr = current.toISOString().split('T')[0];
			const dayOfWeek = current.getUTCDay();
			const col = Math.floor(d / 7);
			const row = dayOfWeek;
			const count = countMap[dateStr] || 0;

			// Track month labels
			const month = current.getUTCMonth();
			if (month !== lastMonth && row === 0) {
				monthLabels.push({
					label: MONTH_NAMES[month],
					x: LABEL_WIDTH + col * CELL_STEP
				});
				lastMonth = month;
			}

			cells.push({
				date: dateStr,
				count,
				col,
				row,
				color: getColor(count)
			});

			currentMs += 86400000;
		}

		const svgWidth = LABEL_WIDTH + numWeeks * CELL_STEP;
		const svgHeight = HEADER_HEIGHT + DAYS_IN_WEEK * CELL_STEP;

		return { cells, monthLabels, svgWidth, svgHeight };
	}

	const heatmapData = $derived.by(() => buildHeatmapData(contributions));

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
</script>

<div class="overflow-x-auto">
	<svg
		width={heatmapData.svgWidth}
		height={heatmapData.svgHeight}
		class="block"
		role="img"
		aria-label="Contribution heatmap for the past year"
	>
		<!-- Month labels -->
		{#each heatmapData.monthLabels as { label, x } (x)}
			<text {x} y={10} class="fill-muted-foreground text-[10px]">{label}</text>
		{/each}

		<!-- Day labels -->
		{#each DAY_LABELS as label, i (i)}
			{#if label}
				<text
					x={0}
					y={HEADER_HEIGHT + i * CELL_STEP + CELL_SIZE - 1}
					class="fill-muted-foreground text-[10px]"
				>
					{label}
				</text>
			{/if}
		{/each}

		<!-- Contribution cells -->
		{#each heatmapData.cells as cell (cell.date)}
			<rect
				x={LABEL_WIDTH + cell.col * CELL_STEP}
				y={HEADER_HEIGHT + cell.row * CELL_STEP}
				width={CELL_SIZE}
				height={CELL_SIZE}
				rx={2}
				fill={cell.color}
				class="outline-none"
			>
				<title
					>{cell.count} contribution{cell.count !== 1 ? 's' : ''} on {formatDate(cell.date)}</title
				>
			</rect>
		{/each}
	</svg>
</div>

<!-- Legend -->
<div class="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
	<span>Less</span>
	{#each COLORS as color (color)}
		<span class="inline-block h-[10px] w-[10px] rounded-sm" style="background: {color}"></span>
	{/each}
	<span>More</span>
</div>
