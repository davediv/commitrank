<script lang="ts">
	import type { ContributionDayData } from '$lib/types';

	interface Props {
		contributions: ContributionDayData[];
	}

	let { contributions }: Props = $props();

	const CHART_HEIGHT = 120;
	const PADDING_TOP = 8;
	const PADDING_BOTTOM = 20;
	const PADDING_LEFT = 32;
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

	let containerWidth = $state(0);

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

		const maxVal = Math.max(...weeks.map((w) => w.total), 1);
		const drawWidth = width - PADDING_LEFT - PADDING_RIGHT;
		const drawHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

		if (drawWidth <= 0) return null;

		// Generate points
		const points = weeks.map((w, i) => {
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
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if chartData && containerWidth > 0}
		<svg
			width={containerWidth}
			height={CHART_HEIGHT}
			class="block"
			role="img"
			aria-label="Weekly contribution trend chart"
		>
			<!-- Grid lines -->
			{#each chartData.gridLines as y (y)}
				<line
					x1={PADDING_LEFT}
					y1={y}
					x2={containerWidth - PADDING_RIGHT}
					y2={y}
					stroke="oklch(0.25 0.015 250)"
					stroke-width="1"
				/>
			{/each}

			<!-- Area fill -->
			<path d={chartData.areaPath} fill="oklch(0.55 0.18 145 / 0.1)" />

			<!-- Line -->
			<polyline
				points={chartData.linePath}
				fill="none"
				stroke="oklch(0.55 0.18 145)"
				stroke-width="1.5"
				stroke-linejoin="round"
			/>

			<!-- Data points (only show on hover via CSS) -->
			{#each chartData.points as point (point.weekStart)}
				<circle
					cx={point.x}
					cy={point.y}
					r="3"
					fill="oklch(0.55 0.18 145)"
					class="opacity-0 hover:opacity-100"
				>
					<title>Week of {point.weekStart}: {point.total} contributions</title>
				</circle>
			{/each}

			<!-- Y-axis labels -->
			{#each chartData.yLabels as label, i (i)}
				<text
					x={PADDING_LEFT - 4}
					y={label.y}
					text-anchor="end"
					class="fill-muted-foreground text-[9px]"
				>
					{label.value}
				</text>
			{/each}

			<!-- X-axis month labels -->
			{#each chartData.monthLabels as { label, x } (label + x)}
				<text {x} y={CHART_HEIGHT - 4} class="fill-muted-foreground text-[9px]">
					{label}
				</text>
			{/each}
		</svg>
	{:else}
		<div class="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
			No contribution data available
		</div>
	{/if}
</div>
