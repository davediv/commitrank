<script lang="ts">
	import type { ContributionDayData } from '$lib/types';

	interface Props {
		contributions: ContributionDayData[];
	}

	let { contributions }: Props = $props();

	const CELL_SIZE = 12;
	const CELL_GAP = 3;
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

	// Phosphor ramp, read from the token layer so the heatmap follows the theme
	// instead of hard-coding a second palette. Adjacent steps are separated by
	// at least 1.5:1 so a level is legible without opening the tooltip.
	const COLORS = [
		'var(--term-heat-0)',
		'var(--term-heat-1)',
		'var(--term-heat-2)',
		'var(--term-heat-3)',
		'var(--term-heat-4)'
	];

	interface CellData {
		date: string;
		count: number;
		col: number;
		row: number;
		level: number;
	}

	let hoveredCell: CellData | null = $state(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

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

		function getLevel(count: number): number {
			if (count === 0) return 0;
			if (count < thresholds[1]) return 1;
			if (count < thresholds[2]) return 2;
			if (count < thresholds[3]) return 3;
			return 4;
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
				level: getLevel(count)
			});

			currentMs += 86400000;
		}

		const svgWidth = LABEL_WIDTH + numWeeks * CELL_STEP;
		const svgHeight = HEADER_HEIGHT + DAYS_IN_WEEK * CELL_STEP;
		const paths = COLORS.map((color) => ({ color, d: '' }));

		// Hundreds of individual <rect><title> pairs made profile hydration and
		// layout disproportionately expensive. Grouping equal-color squares into
		// five SVG paths preserves the visual while cutting ~740 DOM nodes.
		for (const cell of cells) {
			const x = LABEL_WIDTH + cell.col * CELL_STEP;
			const y = HEADER_HEIGHT + cell.row * CELL_STEP;
			paths[cell.level].d += `M${x} ${y}h${CELL_SIZE}v${CELL_SIZE}h-${CELL_SIZE}Z`;
		}

		return { cells, monthLabels, paths, svgWidth, svgHeight };
	}

	const heatmapData = $derived.by(() => buildHeatmapData(contributions));

	function formatDate(dateStr: string): string {
		return dateFormatter.format(new Date(dateStr + 'T00:00:00'));
	}

	function handlePointerMove(event: PointerEvent) {
		const svg = event.currentTarget as SVGSVGElement;
		const bounds = svg.getBoundingClientRect();
		const x = ((event.clientX - bounds.left) / bounds.width) * heatmapData.svgWidth;
		const y = ((event.clientY - bounds.top) / bounds.height) * heatmapData.svgHeight;
		const relativeX = x - LABEL_WIDTH;
		const relativeY = y - HEADER_HEIGHT;

		if (relativeX < 0 || relativeY < 0) {
			hoveredCell = null;
			return;
		}

		const col = Math.floor(relativeX / CELL_STEP);
		const row = Math.floor(relativeY / CELL_STEP);
		const insideCell = relativeX % CELL_STEP <= CELL_SIZE && relativeY % CELL_STEP <= CELL_SIZE;
		const cell = heatmapData.cells[col * DAYS_IN_WEEK + row];

		if (!insideCell || !cell || cell.col !== col || cell.row !== row) {
			hoveredCell = null;
			return;
		}

		hoveredCell = cell;
		tooltipX = event.clientX - bounds.left;
		tooltipY = event.clientY - bounds.top;
	}
</script>

<div class="relative overflow-x-auto" onpointerleave={() => (hoveredCell = null)}>
	<svg
		viewBox="0 0 {heatmapData.svgWidth} {heatmapData.svgHeight}"
		width="100%"
		style="min-width: {heatmapData.svgWidth}px"
		preserveAspectRatio="xMidYMid meet"
		class="block"
		role="img"
		aria-label="Contribution heatmap for the past year"
		onpointermove={handlePointerMove}
	>
		<title>Contribution heatmap for the past year</title>
		<!-- Month labels -->
		{#each heatmapData.monthLabels as { label, x } (x)}
			<text {x} y={10} class="fill-subtle-foreground text-2xs">{label}</text>
		{/each}

		<!-- Day labels -->
		{#each DAY_LABELS as label, i (i)}
			{#if label}
				<text
					x={0}
					y={HEADER_HEIGHT + i * CELL_STEP + CELL_SIZE - 1}
					class="fill-subtle-foreground text-2xs"
				>
					{label}
				</text>
			{/if}
		{/each}

		<!-- Contribution cells, grouped by intensity into five paths -->
		{#each heatmapData.paths as path (path.color)}
			{#if path.d}
				<path d={path.d} fill={path.color} pointer-events="none" />
			{/if}
		{/each}

		<rect
			x={LABEL_WIDTH}
			y={HEADER_HEIGHT}
			width={heatmapData.svgWidth - LABEL_WIDTH}
			height={heatmapData.svgHeight - HEADER_HEIGHT}
			fill="transparent"
		/>
	</svg>

	{#if hoveredCell}
		<div
			class="term-tooltip pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] border border-border-control bg-popover px-2 py-1 text-2xs whitespace-nowrap text-foreground"
			style="left: {tooltipX}px; top: {tooltipY}px"
		>
			{hoveredCell.count} contribution{hoveredCell.count !== 1 ? 's' : ''} on {formatDate(
				hoveredCell.date
			)}
		</div>
	{/if}
</div>

<!-- Legend -->
<div class="mt-2 flex items-center justify-end gap-1 text-2xs text-subtle-foreground">
	<span>less</span>
	{#each COLORS as color (color)}
		<span aria-hidden="true" class="inline-block h-[10px] w-[10px]" style="background: {color}"
		></span>
	{/each}
	<span>more</span>
</div>
