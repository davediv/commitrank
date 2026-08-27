<script lang="ts">
	import { resolve } from '$app/paths';
	import { onDestroy } from 'svelte';
	import Avatar from '$lib/components/avatar.svelte';
	import { Button } from '$lib/components/ui/button';
	import ContributionHeatmap from '$lib/components/contribution-heatmap.svelte';
	import ContributionChart from '$lib/components/contribution-chart.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const profileUrl = $derived(`https://commitrank.dev/${data.profile.github_username}`);

	// Find year contribution stats for share text
	const yearStats = $derived(data.profile.contributions.find((c) => c.period === 'year'));
	const yearContributions = $derived(yearStats?.contributions ?? 0);
	const yearRank = $derived(yearStats?.rank ?? 0);
	const numberFormatter = new Intl.NumberFormat('en-US');
	const joinDateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	let copyState: 'idle' | 'success' | 'error' = $state('idle');
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

	const periodLabels: Record<string, string> = {
		today: 'Today',
		'7days': '7 Days',
		'30days': '30 Days',
		year: 'Year'
	};

	// Metadata reads as `finger` output: one aligned label column, one value
	// column. Labels replace the icons the previous design used, which is what
	// this style asks for and what makes the block scannable.
	const metadata = $derived(
		[
			{ label: 'loc', value: data.profile.location, href: null },
			{ label: 'org', value: data.profile.company, href: null },
			{
				label: 'www',
				value: data.profile.blog?.replace(/^https?:\/\//, '') ?? null,
				href: data.profile.blog
					? data.profile.blog.startsWith('http')
						? data.profile.blog
						: `https://${data.profile.blog}`
					: null
			},
			{ label: 'joined', value: formatJoinDate(data.profile.created_at), href: null }
		].filter((row) => row.value)
	);

	function formatNumber(num: number): string {
		return numberFormatter.format(num);
	}

	function getAvatarUrl(username: string, size: number): string {
		return `/api/avatar/${username}?size=${size}`;
	}

	function getAvatarSrcset(username: string): string {
		return [80, 160].map((size) => `${getAvatarUrl(username, size)} ${size}w`).join(', ');
	}

	function shareOnX() {
		const text = `I'm ranked #${yearRank} on CommitRank with ${formatNumber(yearContributions)} contributions this year!`;
		const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(profileUrl)}`;
		window.open(url, '_blank', 'noopener,noreferrer');
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(profileUrl);
			copyState = 'success';
		} catch {
			copyState = 'error';
		}

		if (copyResetTimer) clearTimeout(copyResetTimer);
		copyResetTimer = setTimeout(() => (copyState = 'idle'), 2000);
	}

	function formatJoinDate(isoString: string): string {
		return joinDateFormatter.format(new Date(isoString));
	}

	onDestroy(() => {
		if (copyResetTimer) clearTimeout(copyResetTimer);
	});
</script>

<svelte:head>
	<title>{data.profile.display_name || data.profile.github_username} - CommitRank</title>
	<link rel="canonical" href={profileUrl} />
	<meta
		name="description"
		content="{data.profile.github_username} has made {formatNumber(
			yearContributions
		)} contributions this year. Rank #{yearRank} on CommitRank."
	/>
	<meta property="og:title" content="{data.profile.github_username} on CommitRank" />
	<meta
		property="og:description"
		content="{formatNumber(yearContributions)} contributions this year. Rank #{yearRank}."
	/>
	<meta property="og:type" content="profile" />
	<meta property="og:image" content="/api/avatar/{data.profile.github_username}" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="{data.profile.github_username} on CommitRank" />
	<meta
		name="twitter:description"
		content="{formatNumber(yearContributions)} contributions this year. Rank #{yearRank}."
	/>
</svelte:head>

<div class="mx-auto max-w-[var(--viz-max)] px-3 py-4">
	<a
		href={resolve('/')}
		class="term-transition inline-flex h-6 items-center gap-1 text-sm text-subtle-foreground hover:text-primary"
	>
		<span aria-hidden="true">←</span>
		Back to leaderboard
	</a>

	<!-- Identity -->
	<div class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
		<Avatar
			src={getAvatarUrl(data.profile.github_username, 160)}
			srcset={getAvatarSrcset(data.profile.github_username)}
			sizes="72px"
			alt=""
			initials={data.profile.github_username.slice(0, 2)}
			width={72}
			height={72}
			class="shrink-0"
			fallbackClass="text-lg"
			loading="eager"
			fetchpriority="high"
		/>

		<div class="min-w-0 flex-1">
			<h1 class="text-xl font-medium text-foreground">
				{data.profile.display_name || data.profile.github_username}
			</h1>

			<div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
				<a
					href="https://github.com/{data.profile.github_username}"
					target="_blank"
					rel="noopener noreferrer"
					class="term-transition inline-flex h-6 items-center text-primary hover:underline"
				>
					@{data.profile.github_username}<span
						aria-hidden="true"
						class="pl-1 text-subtle-foreground">↗</span
					>
				</a>
				{#if data.profile.twitter_handle}
					<span aria-hidden="true" class="text-disabled">·</span>
					<a
						href="https://x.com/{data.profile.twitter_handle}"
						target="_blank"
						rel="noopener noreferrer"
						class="term-transition inline-flex h-6 items-center text-muted-foreground hover:text-primary"
					>
						@{data.profile.twitter_handle}
					</a>
				{/if}
			</div>

			{#if data.profile.bio}
				<p class="mt-2 max-w-[var(--measure)] text-sm text-muted-foreground">{data.profile.bio}</p>
			{/if}

			{#if metadata.length > 0}
				<dl class="mt-3 grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-0.5 text-sm">
					{#each metadata as row (row.label)}
						<dt class="term-label pt-[0.2rem]">{row.label}</dt>
						<dd class="min-w-0 truncate text-muted-foreground">
							{#if row.href}
								<a
									href={row.href}
									target="_blank"
									rel="noopener noreferrer"
									class="term-transition hover:text-primary">{row.value}</a
								>
							{:else}
								{row.value}
							{/if}
						</dd>
					{/each}
				</dl>
			{/if}
		</div>
	</div>

	<!-- Period readout: one strip divided by rules, not four cards. -->
	<div class="mt-5 grid grid-cols-2 border border-border sm:grid-cols-4">
		{#each data.profile.contributions as period (period.period)}
			<div
				class="border-r border-b border-border px-3 py-2 last:border-r-0 sm:border-b-0 [&:nth-child(2)]:border-r-0 sm:[&:nth-child(2)]:border-r"
			>
				<p class="term-label">{periodLabels[period.period]}</p>
				<p
					class="mt-1 text-lg {period.contributions > 0
						? 'text-primary'
						: 'text-subtle-foreground'}"
				>
					{formatNumber(period.contributions)}
				</p>
				<p
					class="text-xs {period.contributions > 0
						? 'text-muted-foreground'
						: 'text-subtle-foreground'}"
				>
					rank #{period.rank || '-'}
				</p>
			</div>
		{/each}
	</div>

	<!-- Contribution heatmap: finally has room to be read. -->
	<section class="deferred-section mt-5">
		<h2 class="term-label mb-2">Contributions</h2>
		<div class="term-panel overflow-x-auto p-3">
			<ContributionHeatmap contributions={data.dailyContributions} />
		</div>
	</section>

	<section class="deferred-section mt-5">
		<h2 class="term-label mb-2">Weekly Trend</h2>
		<div class="term-panel p-3">
			<ContributionChart contributions={data.dailyContributions} />
		</div>
	</section>

	<div class="mt-5 flex items-center gap-2">
		<Button variant="outline" size="sm" onclick={shareOnX}>Share on X ↗</Button>
		<Button variant="outline" size="sm" onclick={copyLink}>
			{copyState === 'success' ? '✓ Copied' : copyState === 'error' ? '✗ Copy failed' : 'Copy Link'}
		</Button>
		<span class="sr-only" aria-live="polite">
			{copyState === 'success'
				? 'Link copied to clipboard'
				: copyState === 'error'
					? 'Failed to copy link'
					: ''}
		</span>
	</div>
</div>
