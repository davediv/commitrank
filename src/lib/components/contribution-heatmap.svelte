<script lang="ts">
	import type { ContributionDayData } from '$lib/types';
	import { buildHeatmapGrid, DAYS_IN_WEEK, HEATMAP_LEVELS, type HeatmapCell } from '$lib/heatmap';

	interface Props {
		contributions: ContributionDayData[];
	}

	let { contributions }: Props = $props();

	const CELL_SIZE = 12;
	const CELL_GAP = 3;
	const CELL_STEP = CELL_SIZE + CELL_GAP;
	const LABEL_WIDTH = 28;
	const HEADER_HEIGHT = 16;

	const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

	// Phosphor ramp, read from the token layer so the heatmap follows the theme
	// instead of hard-coding a second palette. Adjacent steps are separated by
	// at least 1.5:1 so a level is legible without opening the tooltip.
	const COLORS = Array.from({ length: HEATMAP_LEVELS }, (_, i) => `var(--term-heat-${i})`);

	let hoveredCell: HeatmapCell | null = $state(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	/**
	 * Lay the shared grid out in SVG coordinates.
	 *
	 * Kept a plain function rather than inline `$derived` work so ESLint's
	 * svelte/prefer-svelte-reactivity rule does not flag the Date/Map use inside.
	 */
	function layoutHeatmap(contribs: ContributionDayData[]) {
		const grid = buildHeatmapGrid(contribs);

		const svgWidth = LABEL_WIDTH + grid.weeks * CELL_STEP;
		const svgHeight = HEADER_HEIGHT + DAYS_IN_WEEK * CELL_STEP;
		const paths = COLORS.map((color) => ({ color, d: '' }));

		// Hundreds of individual <rect><title> pairs made profile hydration and
		// layout disproportionately expensive. Grouping equal-color squares into
		// five SVG paths preserves the visual while cutting ~740 DOM nodes.
		for (const cell of grid.cells) {
			const x = LABEL_WIDTH + cell.col * CELL_STEP;
			const y = HEADER_HEIGHT + cell.row * CELL_STEP;
			paths[cell.level].d += `M${x} ${y}h${CELL_SIZE}v${CELL_SIZE}h-${CELL_SIZE}Z`;
		}

		const monthLabels = grid.months.map(({ label, col }) => ({
			label,
			x: LABEL_WIDTH + col * CELL_STEP
		}));

		return { cells: grid.cells, monthLabels, paths, svgWidth, svgHeight };
	}

	const heatmapData = $derived.by(() => layoutHeatmap(contributions));

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
