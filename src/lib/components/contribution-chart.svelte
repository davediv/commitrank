<script lang="ts">
	import type { ContributionDayData } from '$lib/types';

	interface Props {
		contributions: ContributionDayData[];
	}

	let { contributions }: Props = $props();

	const CHART_HEIGHT = 120;
	const PADDING_TOP = 8;
	const PADDING_BOTTOM = 20;
	const PADDING_LEFT = 52;
	const PADDING_RIGHT = 8;
	const DAY_MS = 86400000;

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

	interface WeekBucket {
		weekStart: string;
		total: number;
		month: number;
	}

	interface ChartPoint extends WeekBucket {
		x: number;
		y: number;
	}

	const numberFormatter = new Intl.NumberFormat('en-US');

	let containerElement: HTMLDivElement | undefined = $state();
	let containerWidth = $state(0);
	let hoveredPoint: ChartPoint | null = $state(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	function parseDateUTC(date: string): number {
		return Date.parse(`${date}T00:00:00Z`);
	}

	function formatDateUTC(timestamp: number): string {
		return new Date(timestamp).toISOString().slice(0, 10);
	}

	function startOfWeekUTC(timestamp: number): number {
		const dayOfWeek = new Date(timestamp).getUTCDay();
		return timestamp - dayOfWeek * DAY_MS;
	}

	function addDaysUTC(timestamp: number, days: number): number {
		return timestamp + days * DAY_MS;
	}

	/** Rounds up to the next readable axis value: 3153 -> 4000, 78 -> 80. */
	function niceCeiling(value: number): number {
		if (value <= 1) return 1;
		const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
		for (const step of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) {
			const candidate = step * magnitude;
			if (value <= candidate) return candidate;
		}
		return 10 * magnitude;
	}

	function buildChartData(contribs: ContributionDayData[], width: number) {
		if (contribs.length === 0) return null;

		const sortedContributions = [...contribs].sort((a, b) => a.date.localeCompare(b.date));
		const dayTotals: Record<string, number> = {};
		for (const day of sortedContributions) {
			dayTotals[day.date] = (dayTotals[day.date] ?? 0) + day.count;
		}

		const firstContributionDate = parseDateUTC(sortedContributions[0].date);
		const lastContributionDate = parseDateUTC(
			sortedContributions[sortedContributions.length - 1].date
		);
		const firstWeekStart = startOfWeekUTC(firstContributionDate);
		const lastWeekStart = startOfWeekUTC(lastContributionDate);

		// Build continuous Sunday-to-Saturday buckets, including zero-contribution weeks
		const weeks: WeekBucket[] = [];
		for (
			let weekStart = firstWeekStart;
			weekStart <= lastWeekStart;
			weekStart = addDaysUTC(weekStart, 7)
		) {
			let total = 0;
			for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
				const dayKey = formatDateUTC(addDaysUTC(weekStart, dayOffset));
				total += dayTotals[dayKey] ?? 0;
			}

			weeks.push({
				weekStart: formatDateUTC(weekStart),
				total,
				month: new Date(weekStart).getUTCMonth()
			});
		}

		if (weeks.length === 0) return null;

		// Round the axis up to a readable number so the labels are 4,000 / 2,000 / 0
		// rather than 3,153 / 1,577 / 0.
		const maxVal = niceCeiling(Math.max(...weeks.map((w) => w.total), 1));
		const drawWidth = width - PADDING_LEFT - PADDING_RIGHT;
		const drawHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

		if (drawWidth <= 0) return null;

		// Generate points
		const points: ChartPoint[] = weeks.map((w, i) => {
			const x = PADDING_LEFT + (i / Math.max(weeks.length - 1, 1)) * drawWidth;
			const y = PADDING_TOP + drawHeight - (w.total / maxVal) * drawHeight;
			return { x, y, ...w };
		});

		// SVG polyline string
		const linePath = points.map((p) => `${p.x},${p.y}`).join(' ');

		// Area fill path (closed polygon to bottom)
		const areaPath =
			`M ${points[0].x},${PADDING_TOP + drawHeight} ` +
			points.map((p) => `L ${p.x},${p.y}`).join(' ') +
			` L ${points[points.length - 1].x},${PADDING_TOP + drawHeight} Z`;

		// Y-axis labels (0, mid, max)
		const yLabels = [
			{ value: maxVal, y: PADDING_TOP + 4 },
			{ value: Math.round(maxVal / 2), y: PADDING_TOP + drawHeight / 2 + 4 },
			{ value: 0, y: PADDING_TOP + drawHeight + 4 }
		];

		// X-axis month labels
		const monthLabels: { label: string; x: number }[] = [];
		let lastMonth = -1;
		for (const p of points) {
			if (p.month !== lastMonth) {
				monthLabels.push({ label: MONTH_NAMES[p.month], x: p.x });
				lastMonth = p.month;
			}
		}

		// Horizontal grid lines
		const gridLines = [PADDING_TOP, PADDING_TOP + drawHeight / 2, PADDING_TOP + drawHeight];

		return { points, linePath, areaPath, yLabels, monthLabels, gridLines, drawHeight };
	}

	const chartData = $derived.by(() => buildChartData(contributions, containerWidth));

	// ResizeObserver reports the measured size after layout. This avoids the
	// synchronous width read performed by a clientWidth binding during hydration.
	$effect(() => {
		if (!containerElement) return;

		const observer = new ResizeObserver(([entry]) => {
			containerWidth = entry.contentRect.width;
		});
		observer.observe(containerElement);

		return () => observer.disconnect();
	});

	function handlePointerMove(event: PointerEvent) {
		if (!chartData || chartData.points.length === 0) return;

		const svg = event.currentTarget as SVGSVGElement;
		const bounds = svg.getBoundingClientRect();
		const ratio = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1);
		const index = Math.round(ratio * (chartData.points.length - 1));
		hoveredPoint = chartData.points[index];
		tooltipX = (hoveredPoint.x / containerWidth) * bounds.width;
		tooltipY = hoveredPoint.y;
	}
</script>

<div
	class="relative w-full"
	bind:this={containerElement}
	onpointerleave={() => (hoveredPoint = null)}
>
	{#if chartData && containerWidth > 0}
		<svg
			width={containerWidth}
			height={CHART_HEIGHT}
			class="block"
			role="img"
			aria-label="Weekly contribution trend chart"
			onpointermove={handlePointerMove}
		>
			<title>Weekly contribution trend chart</title>
			<!-- Grid lines -->
			{#each chartData.gridLines as y (y)}
				<line
					x1={PADDING_LEFT}
					y1={y}
					x2={containerWidth - PADDING_RIGHT}
					y2={y}
					stroke="var(--border)"
					stroke-width="1"
				/>
			{/each}

			<!-- Area fill -->
			<path d={chartData.areaPath} fill="var(--term-phosphor)" fill-opacity="0.12" />

			<!-- Line -->
			<polyline
				points={chartData.linePath}
				fill="none"
				stroke="var(--term-phosphor)"
				stroke-width="1.5"
				stroke-linejoin="miter"
			/>

			<!-- A single active point replaces dozens of always-hydrated circles. -->
			{#if hoveredPoint}
				<circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="3" fill="var(--term-phosphor)" />
			{/if}

			<!-- Y-axis labels -->
			{#each chartData.yLabels as label, i (i)}
				<text
					x={PADDING_LEFT - 4}
					y={label.y}
					text-anchor="end"
					class="fill-subtle-foreground text-2xs"
				>
					{numberFormatter.format(label.value)}
				</text>
			{/each}

			<!-- X-axis month labels -->
			{#each chartData.monthLabels as { label, x } (label + x)}
				<text {x} y={CHART_HEIGHT - 4} class="fill-subtle-foreground text-2xs">
					{label}
				</text>
			{/each}

			<rect
				x={PADDING_LEFT}
				y={PADDING_TOP}
				width={containerWidth - PADDING_LEFT - PADDING_RIGHT}
				height={chartData.drawHeight}
				fill="transparent"
			/>
		</svg>

		{#if hoveredPoint}
			<div
				class="term-tooltip pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] border border-border-control bg-popover px-2 py-1 text-2xs whitespace-nowrap text-foreground"
				style="left: {tooltipX}px; top: {tooltipY}px"
			>
				Week of {hoveredPoint.weekStart}: {hoveredPoint.total} contributions
			</div>
		{/if}
	{:else}
		<div class="flex h-[120px] items-center justify-center text-sm text-subtle-foreground">
			<span aria-hidden="true" class="pr-1 text-primary">&gt;</span> No contribution data available
		</div>
	{/if}
</div>
