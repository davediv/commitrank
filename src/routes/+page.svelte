<script lang="ts">
	import { navigating } from '$app/stores';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { Users, GitCommitHorizontal, Clock, CheckCircle, RefreshCw } from '@lucide/svelte';
	import Avatar from '$lib/components/avatar.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatUTCClockTime } from '$lib/time';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// SEO: Generate period label for meta description
	const periodLabels: Record<string, string> = {
		today: 'today',
		'7days': 'this week',
		'30days': 'this month',
		year: 'this year'
	};
	const periodLabel = $derived(periodLabels[data.period] || 'today');

	// Show loading state during navigation
	let isLoading = $derived(!!$navigating);

	// Success message from registration
	let successMessage: { username: string; rank: number; contributions: number } | null =
		$state(null);
	let showSuccessModal = $state(false);
	let successDialog: HTMLDialogElement | null = $state(null);
	let utcNow: Date | null = $state(null);
	const utcNowLabel = $derived(utcNow ? formatUTCClockTime(utcNow) : '--:--:-- UTC');
	const numberFormatter = new Intl.NumberFormat('en-US');
	const todayUtc = new Date().toISOString().slice(0, 10);

	onMount(() => {
		// Check for join_success cookie
		const cookies = document.cookie.split(';');
		for (const cookie of cookies) {
			const [name, value] = cookie.trim().split('=');
			if (name === 'join_success') {
				try {
					successMessage = JSON.parse(decodeURIComponent(value));
					showSuccessModal = true;
					// Clear the cookie
					document.cookie = 'join_success=; path=/; max-age=0';
				} catch {
					// Ignore parse errors
				}
				break;
			}
		}
	});

	$effect(() => {
		if (showSuccessModal && successDialog && !successDialog.open) {
			successDialog.showModal();
		}
	});

	onMount(() => {
		utcNow = new Date();

		const timer = window.setInterval(() => {
			utcNow = new Date();
		}, 1000);

		return () => {
			window.clearInterval(timer);
		};
	});

	function dismissSuccess() {
		if (successDialog?.open) successDialog.close();
		showSuccessModal = false;
	}

	function getPeriodHref(period: string): string {
		return `/?period=${encodeURIComponent(period)}`;
	}

	function getPageHref(newPage: number): string {
		return `/?period=${encodeURIComponent(data.period)}&page=${newPage}`;
	}

	function formatNumber(num: number): string {
		return numberFormatter.format(num);
	}

	function getAvatarUrl(username: string, size: number): string {
		return `/api/avatar/${username}?size=${size}`;
	}

	function getAvatarSrcset(username: string): string {
		return [32, 64, 96].map((size) => `${getAvatarUrl(username, size)} ${size}w`).join(', ');
	}

	function formatRelativeTime(isoString: string | null): string {
		if (!isoString) return 'Never';

		const date = new Date(isoString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		return `${diffDays}d ago`;
	}

	function formatTimeUntil(isoString: string | null): string {
		if (!isoString) return 'Unknown';

		const target = new Date(isoString);
		const now = new Date();
		const diffMs = target.getTime() - now.getTime();

		if (diffMs <= 0) return 'Soon';

		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const remainingMins = diffMins % 60;

		if (diffHours >= 1) {
			return remainingMins > 0 ? `${diffHours}h ${remainingMins}m` : `${diffHours}h`;
		}
		return `${diffMins}m`;
	}

	function formatUTCTime(isoString: string | null): string {
		if (!isoString) return 'Never';

		const date = new Date(isoString);
		return (
			date.toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'UTC',
				hour12: false
			}) + ' UTC'
		);
	}

	// Period tabs configuration
	const periods = [
		{ value: 'today', label: 'Today' },
		{ value: '7days', label: '7d' },
		{ value: '30days', label: '30d' },
		{ value: 'year', label: 'Year' }
	];
</script>

<!-- SEO Meta Tags -->
<svelte:head>
	<link rel="canonical" href="https://commitrank.dev/" />
	<title>CommitRank - GitHub Commit Leaderboard</title>
	<meta
		name="description"
		content="See who's shipping the most code {periodLabel}. Top GitHub contributors ranked by commits."
	/>
	<meta property="og:title" content="CommitRank - GitHub Commit Leaderboard" />
	<meta
		property="og:description"
		content="See who's shipping the most code. Top GitHub contributors ranked by commits."
	/>
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="CommitRank - GitHub Commit Leaderboard" />
	<meta
		name="twitter:description"
		content="See who's shipping the most code. Top GitHub contributors ranked by commits."
	/>
</svelte:head>

<!-- Success Modal -->
{#if successMessage}
	<dialog
		bind:this={successDialog}
		class="success-dialog w-[calc(100%-2rem)] max-w-sm rounded-lg border border-border bg-background p-6 text-foreground shadow-2xl"
		aria-labelledby="welcome-title"
		aria-describedby="welcome-description"
		onclose={() => (showSuccessModal = false)}
		onclick={(event) => {
			if (event.target === event.currentTarget) dismissSuccess();
		}}
	>
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<h2 id="welcome-title" class="flex items-center gap-2 text-base font-semibold">
					<CheckCircle class="h-4 w-4 text-primary" />
					Welcome to CommitRank
				</h2>
				<p id="welcome-description" class="text-sm text-muted-foreground">
					<strong class="text-foreground">@{successMessage.username}</strong> joined with
					<strong class="text-primary">{formatNumber(successMessage.contributions)}</strong>
					contributions.
				</p>
			</div>
			<div class="flex justify-end">
				<Button onclick={dismissSuccess} size="sm">View Leaderboard</Button>
			</div>
		</div>
	</dialog>
{/if}

<!-- Hero Section -->
<div class="hero-gradient relative overflow-hidden py-16">
	<div class="hero-glow"></div>
	<div class="relative z-10 mx-auto max-w-3xl px-4 text-center">
		<h1 class="hero-title text-3xl font-bold tracking-tight sm:text-4xl">CommitRank</h1>
		<p class="mt-3 font-mono text-muted-foreground">GitHub Commit Leaderboard</p>
	</div>
</div>

<div class="mx-auto max-w-3xl px-4 py-6">
	<!-- Header with stats -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 class="text-lg font-semibold">Leaderboard</h2>
			{#if data.stats}
				<div class="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
					<span class="flex items-center gap-1">
						<Users class="h-3 w-3" />
						{formatNumber(data.stats.total_users)}
					</span>
					<span class="flex items-center gap-1" title="Contributions for {todayUtc} (UTC date)">
						<GitCommitHorizontal class="h-3 w-3" />
						{formatNumber(data.stats.total_contributions_today)} today
					</span>
					<span
						class="flex items-center gap-1"
						title="Last synced: {formatUTCTime(data.stats.last_sync)}"
					>
						<Clock class="h-3 w-3" />
						{formatRelativeTime(data.stats.last_sync)}
					</span>
					<span
						class="flex items-center gap-1"
						title="Next sync: {formatUTCTime(data.stats.next_sync)}"
					>
						<RefreshCw class="h-3 w-3" />
						{formatTimeUntil(data.stats.next_sync)}
					</span>
				</div>
				<div class="mt-1 space-y-0.5 text-xs text-muted-foreground/70">
					<p
						class="font-mono text-muted-foreground/80"
						aria-label="Current UTC time"
						title="Current UTC time (updates every second)"
					>
						UTC now: {utcNowLabel}
					</p>
					<p>Today resets at 00:00 UTC. Sync runs hourly.</p>
				</div>
			{/if}
		</div>

		<!-- Period Tabs -->
		<div
			class="flex rounded-md border border-border bg-muted/30 p-0.5"
			role="tablist"
			aria-label="Contribution period"
		>
			{#each periods as period (period.value)}
				<a
					href={getPeriodHref(period.value)}
					role="tab"
					aria-selected={data.period === period.value}
					aria-label={period.label === '7d'
						? '7 Days'
						: period.label === '30d'
							? '30 Days'
							: period.label}
					class="rounded px-3 py-1 text-sm font-medium transition-colors {data.period ===
					period.value
						? 'bg-card text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{period.label}
				</a>
			{/each}
		</div>
	</div>

	<!-- Leaderboard Table -->
	<div
		class="relative overflow-hidden rounded-md border border-border transition-opacity duration-100 {isLoading
			? 'opacity-70'
			: ''}"
		aria-busy={isLoading}
	>
		{#if isLoading}
			<div class="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary"></div>
		{/if}
		<table class="w-full">
			<thead>
				<tr class="border-b border-border bg-muted/30 text-sm text-muted-foreground">
					<th class="w-12 py-2 text-center font-medium">#</th>
					<th class="py-2 pl-2 text-left font-medium">Developer</th>
					<th class="hidden w-32 py-2 text-right font-medium sm:table-cell">Twitter/X</th>
					<th class="w-24 py-2 pr-4 text-right font-medium">Commits</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border">
				{#if data.leaderboard.leaderboard.length === 0}
					<tr>
						<td colspan={4} class="py-12 text-center text-muted-foreground">
							No developers yet.
							<a href={resolve('/join')} class="text-primary hover:underline">Be the first</a>
						</td>
					</tr>
				{:else}
					{#each data.leaderboard.leaderboard as entry (entry.github_username)}
						<tr class="table-row-hover">
							<td class="py-2.5 text-center">
								{#if entry.rank === 1}
									<span class="rank-badge rank-badge-gold">1</span>
								{:else if entry.rank === 2}
									<span class="rank-badge rank-badge-silver">2</span>
								{:else if entry.rank === 3}
									<span class="rank-badge rank-badge-bronze">3</span>
								{:else}
									<span class="text-sm text-muted-foreground">{entry.rank}</span>
								{/if}
							</td>
							<td class="py-2.5 pl-2">
								<div class="flex items-center gap-2.5">
									<Avatar
										src={getAvatarUrl(entry.github_username, 64)}
										srcset={getAvatarSrcset(entry.github_username)}
										sizes="32px"
										alt={entry.github_username}
										initials={entry.github_username.slice(0, 2).toUpperCase()}
										width={32}
										height={32}
										fallbackClass="text-[10px]"
									/>
									<div class="min-w-0 flex-1">
										<a
											href={resolve(`/${entry.github_username}`)}
											class="font-medium text-foreground hover:text-primary"
										>
											{entry.github_username}
										</a>
										{#if entry.display_name}
											<p class="truncate text-sm text-muted-foreground">
												{entry.display_name}
											</p>
										{/if}
									</div>
								</div>
							</td>
							<td class="hidden py-2.5 text-right sm:table-cell">
								{#if entry.twitter_handle}
									<a
										href="https://x.com/{entry.twitter_handle}"
										target="_blank"
										rel="noopener noreferrer"
										class="text-sm text-muted-foreground hover:text-primary"
									>
										@{entry.twitter_handle}
									</a>
								{:else}
									<span class="text-sm text-muted-foreground/50">-</span>
								{/if}
							</td>
							<td class="py-2.5 pr-4 text-right">
								<span class="contrib-count font-medium">
									{formatNumber(entry.contributions)}
								</span>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if data.leaderboard.pagination.totalPages > 1}
		<div class="mt-4 flex items-center justify-between text-sm">
			<span class="text-muted-foreground">
				Page {data.leaderboard.pagination.page} of {data.leaderboard.pagination.totalPages}
			</span>
			<div class="flex gap-1">
				{#if data.leaderboard.pagination.page > 1}
					<a
						href={getPageHref(data.leaderboard.pagination.page - 1)}
						class="inline-flex h-7 items-center rounded-md px-2 text-sm hover:bg-accent hover:text-accent-foreground"
					>
						Prev
					</a>
				{:else}
					<span class="inline-flex h-7 items-center px-2 text-sm opacity-50" aria-disabled="true"
						>Prev</span
					>
				{/if}
				{#if data.leaderboard.pagination.page < data.leaderboard.pagination.totalPages}
					<a
						href={getPageHref(data.leaderboard.pagination.page + 1)}
						class="inline-flex h-7 items-center rounded-md px-2 text-sm hover:bg-accent hover:text-accent-foreground"
					>
						Next
					</a>
				{:else}
					<span class="inline-flex h-7 items-center px-2 text-sm opacity-50" aria-disabled="true"
						>Next</span
					>
				{/if}
			</div>
		</div>
	{/if}
</div>
