<script lang="ts">
	import { resolve } from '$app/paths';
	import { onDestroy } from 'svelte';
	import {
		ArrowLeft,
		ExternalLink,
		MapPin,
		Building2,
		Globe,
		Share2,
		Copy,
		Trophy,
		GitCommitHorizontal
	} from '@lucide/svelte';
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

<div class="mx-auto max-w-3xl px-4 py-6">
	<!-- Back link -->
	<a
		href={resolve('/')}
		class="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft class="h-3.5 w-3.5" />
		Back to leaderboard
	</a>

	<!-- Profile Header -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
		<Avatar
			src={getAvatarUrl(data.profile.github_username, 160)}
			srcset={getAvatarSrcset(data.profile.github_username)}
			sizes="80px"
			alt={data.profile.github_username}
			initials={data.profile.github_username.slice(0, 2).toUpperCase()}
			width={80}
			height={80}
			class="shrink-0"
			fallbackClass="text-xl"
			loading="eager"
			fetchpriority="high"
		/>

		<div class="min-w-0 flex-1">
			<div class="flex flex-col gap-1">
				{#if data.profile.display_name}
					<h1 class="text-xl font-bold">{data.profile.display_name}</h1>
				{/if}
				<div class="flex items-center gap-2">
					<a
						href="https://github.com/{data.profile.github_username}"
						target="_blank"
						rel="noopener noreferrer"
						class="group flex items-center gap-1 text-muted-foreground hover:text-primary"
					>
						@{data.profile.github_username}
						<ExternalLink class="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />
					</a>
					{#if data.profile.twitter_handle}
						<span class="text-muted-foreground/40">·</span>
						<a
							href="https://x.com/{data.profile.twitter_handle}"
							target="_blank"
							rel="noopener noreferrer"
							class="text-sm text-muted-foreground hover:text-primary"
						>
							@{data.profile.twitter_handle}
						</a>
					{/if}
				</div>
			</div>

			{#if data.profile.bio}
				<p class="mt-2 text-sm text-muted-foreground">{data.profile.bio}</p>
			{/if}

			<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
				{#if data.profile.location}
					<span class="flex items-center gap-1">
						<MapPin class="h-3 w-3" />
						{data.profile.location}
					</span>
				{/if}
				{#if data.profile.company}
					<span class="flex items-center gap-1">
						<Building2 class="h-3 w-3" />
						{data.profile.company}
					</span>
				{/if}
				{#if data.profile.blog}
					<a
						href={data.profile.blog.startsWith('http')
							? data.profile.blog
							: `https://${data.profile.blog}`}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1 hover:text-primary"
					>
						<Globe class="h-3 w-3" />
						{data.profile.blog.replace(/^https?:\/\//, '')}
					</a>
				{/if}
			</div>

			<p class="mt-1 text-xs text-muted-foreground/60">
				Joined CommitRank {formatJoinDate(data.profile.created_at)}
			</p>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each data.profile.contributions as period (period.period)}
			<div class="rounded-md border border-border bg-muted/20 p-3">
				<p class="text-xs text-muted-foreground">{periodLabels[period.period]}</p>
				<p class="mt-1 font-mono text-lg font-bold text-primary">
					{formatNumber(period.contributions)}
				</p>
				<div class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
					<Trophy class="h-3 w-3" />
					Rank #{period.rank || '-'}
				</div>
			</div>
		{/each}
	</div>

	<!-- Contribution Heatmap -->
	<div class="deferred-section mb-6">
		<h2 class="mb-3 flex items-center gap-2 text-sm font-medium">
			<GitCommitHorizontal class="h-4 w-4" />
			Contributions
		</h2>
		<div class="rounded-md border border-border bg-muted/20 p-3">
			<ContributionHeatmap contributions={data.dailyContributions} />
		</div>
	</div>

	<!-- Contribution Trend -->
	<div class="deferred-section mb-6">
		<h2 class="mb-3 text-sm font-medium">Weekly Trend</h2>
		<div class="rounded-md border border-border bg-muted/20 p-3">
			<ContributionChart contributions={data.dailyContributions} />
		</div>
	</div>

	<!-- Share Section -->
	<div class="flex items-center gap-2">
		<Button variant="outline" size="sm" onclick={shareOnX}>
			<Share2 class="mr-1.5 h-3.5 w-3.5" />
			Share on X
		</Button>
		<Button variant="outline" size="sm" onclick={copyLink}>
			<Copy class="mr-1.5 h-3.5 w-3.5" />
			{copyState === 'success' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy Link'}
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
