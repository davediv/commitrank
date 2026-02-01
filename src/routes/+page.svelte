<script lang="ts">
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/stores';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import {
		ExternalLink,
		Users,
		GitCommitHorizontal,
		Clock,
		CheckCircle,
		RefreshCw
	} from '@lucide/svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
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

	// Number of skeleton rows to show
	const SKELETON_ROWS = 10;

	// Success message from registration
	let successMessage: { username: string; rank: number; contributions: number } | null =
		$state(null);
	let showSuccessModal = $state(false);

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

	function dismissSuccess() {
		showSuccessModal = false;
	}

	function handlePeriodChange(period: string) {
		const url = new URL($page.url);
		url.searchParams.set('period', period);
		url.searchParams.delete('page');
		goto(url.toString(), { replaceState: true });
	}

	function handlePageChange(newPage: number) {
		const url = new URL($page.url);
		url.searchParams.set('page', newPage.toString());
		goto(url.toString(), { replaceState: true });
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function getAvatarUrl(username: string): string {
		return `/api/avatar/${username}`;
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
	<Dialog.Root bind:open={showSuccessModal} onOpenChange={dismissSuccess}>
		<Dialog.Content class="sm:max-w-sm">
			<Dialog.Header>
				<Dialog.Title class="flex items-center gap-2 text-base">
					<CheckCircle class="h-4 w-4 text-primary" />
					Welcome to CommitRank
				</Dialog.Title>
				<Dialog.Description>
					<strong class="text-foreground">@{successMessage.username}</strong> joined with
					<strong class="text-primary">{formatNumber(successMessage.contributions)}</strong> contributions.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button onclick={dismissSuccess} size="sm">View Leaderboard</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
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
					<span
						class="flex items-center gap-1"
						title="Contributions for {new Date().toISOString().split('T')[0]} (UTC date)"
					>
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
				<p class="mt-1 text-xs text-muted-foreground/70">
					Data syncs every 6h. "Today" = UTC date.
				</p>
			{/if}
		</div>

		<!-- Period Tabs -->
		<div class="flex rounded-md border border-border bg-muted/30 p-0.5">
			{#each periods as period (period.value)}
				<button
					onclick={() => handlePeriodChange(period.value)}
					class="rounded px-3 py-1 text-sm font-medium transition-colors {data.period ===
					period.value
						? 'bg-card text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{period.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Leaderboard Table -->
	<div class="overflow-hidden rounded-md border border-border">
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
				{#if isLoading}
					<!-- Loading skeleton -->
					{#each Array.from({ length: SKELETON_ROWS }, (_, i) => i) as i (i)}
						<tr>
							<td class="py-3 text-center">
								<Skeleton class="mx-auto h-4 w-4" />
							</td>
							<td class="py-3 pl-2">
								<div class="flex items-center gap-2.5">
									<Skeleton class="h-8 w-8 rounded-full" />
									<div class="flex flex-col gap-1">
										<Skeleton class="h-3.5 w-20" />
										<Skeleton class="h-2.5 w-14" />
									</div>
								</div>
							</td>
							<td class="hidden py-3 text-right sm:table-cell">
								<Skeleton class="ml-auto h-4 w-16" />
							</td>
							<td class="py-3 pr-4 text-right">
								<Skeleton class="ml-auto h-4 w-10" />
							</td>
						</tr>
					{/each}
				{:else if data.leaderboard.leaderboard.length === 0}
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
									<Avatar.Root class="h-8 w-8">
										<Avatar.Image
											src={getAvatarUrl(entry.github_username)}
											alt={entry.github_username}
											loading="lazy"
											decoding="async"
											width={32}
											height={32}
										/>
										<Avatar.Fallback class="text-[10px]">
											{entry.github_username.slice(0, 2).toUpperCase()}
										</Avatar.Fallback>
									</Avatar.Root>
									<div class="min-w-0 flex-1">
										<a
											href="https://github.com/{entry.github_username}"
											target="_blank"
											rel="noopener noreferrer"
											class="group flex items-center gap-1 font-medium text-foreground hover:text-primary"
										>
											{entry.github_username}
											<ExternalLink
												class="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50"
											/>
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
				<Button
					variant="ghost"
					size="sm"
					class="h-7 px-2 text-sm"
					disabled={data.leaderboard.pagination.page <= 1}
					onclick={() => handlePageChange(data.leaderboard.pagination.page - 1)}
				>
					Prev
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="h-7 px-2 text-sm"
					disabled={data.leaderboard.pagination.page >= data.leaderboard.pagination.totalPages}
					onclick={() => handlePageChange(data.leaderboard.pagination.page + 1)}
				>
					Next
				</Button>
			</div>
		</div>
	{/if}
</div>
