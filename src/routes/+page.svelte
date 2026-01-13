<script lang="ts">
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/stores';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { Trophy, Github, Twitter, Users, Activity, CheckCircle, X } from '@lucide/svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Table from '$lib/components/ui/table';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Alert from '$lib/components/ui/alert';
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
	// Use $derived to make periodLabel reactive to data.period changes
	const periodLabel = $derived(periodLabels[data.period] || 'today');

	// Show loading state during navigation
	let isLoading = $derived(!!$navigating);

	// Number of skeleton rows to show
	const SKELETON_ROWS = 10;

	// Success message from registration
	let successMessage: { username: string; rank: number; contributions: number } | null =
		$state(null);

	onMount(() => {
		// Check for join_success cookie
		const cookies = document.cookie.split(';');
		for (const cookie of cookies) {
			const [name, value] = cookie.trim().split('=');
			if (name === 'join_success') {
				try {
					successMessage = JSON.parse(decodeURIComponent(value));
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
		successMessage = null;
	}

	function handlePeriodChange(period: string) {
		const url = new URL($page.url);
		url.searchParams.set('period', period);
		url.searchParams.delete('page'); // Reset to page 1
		goto(url.toString(), { replaceState: true });
	}

	function handlePageChange(newPage: number) {
		const url = new URL($page.url);
		url.searchParams.set('page', newPage.toString());
		goto(url.toString(), { replaceState: true });
	}

	function getMedalEmoji(rank: number): string {
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return rank.toString();
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	/**
	 * Get optimized GitHub avatar URL with proper sizing
	 * Uses 2x size for retina displays when avatar is displayed at 32px (h-8 w-8)
	 */
	function getAvatarUrl(url: string | null, size: number = 64): string {
		if (!url) return '';
		// GitHub avatar URL with size parameter (2x for retina: 64px for 32px display)
		return url.includes('?') ? `${url}&s=${size}` : `${url}?s=${size}`;
	}
</script>

<!-- SEO Meta Tags -->
<svelte:head>
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

<!-- Noscript fallback message -->
<noscript>
	<div
		class="border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-center text-sm text-yellow-800"
	>
		JavaScript is disabled. Tab switching and pagination require JavaScript, but the leaderboard
		content is fully visible.
	</div>
</noscript>

<div class="container mx-auto px-4 py-8">
	<!-- Success Alert -->
	{#if successMessage}
		<Alert.Root class="relative mb-6">
			<CheckCircle class="h-4 w-4" />
			<Alert.Title>Welcome to CommitRank!</Alert.Title>
			<Alert.Description>
				<strong>@{successMessage.username}</strong> has joined the leaderboard at rank #{successMessage.rank}
				with {formatNumber(successMessage.contributions)} contributions this year.
			</Alert.Description>
			<button
				onclick={dismissSuccess}
				class="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Dismiss"
			>
				<X class="h-4 w-4" />
			</button>
		</Alert.Root>
	{/if}

	<!-- Header Section -->
	<div class="mb-8 text-center">
		<div class="mb-4 flex items-center justify-center gap-3">
			<Trophy class="h-10 w-10 text-yellow-500" />
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">GitHub Commit Leaderboard</h1>
		</div>
		<p class="text-muted-foreground">See who's shipping the most code</p>
	</div>

	<!-- Stats Summary -->
	{#if data.stats}
		<div
			class="mb-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground"
		>
			<div class="flex items-center gap-2">
				<Users class="h-4 w-4" />
				<span>{formatNumber(data.stats.total_users)} developers</span>
			</div>
			<div class="flex items-center gap-2">
				<Activity class="h-4 w-4" />
				<span>{formatNumber(data.stats.total_contributions_today)} contributions today</span>
			</div>
		</div>
	{/if}

	<!-- Time Period Tabs -->
	<div class="mb-6">
		<Tabs.Root value={data.period} onValueChange={handlePeriodChange} class="w-full">
			<Tabs.List class="grid w-full grid-cols-4">
				<Tabs.Trigger value="today">Today</Tabs.Trigger>
				<Tabs.Trigger value="7days">7 Days</Tabs.Trigger>
				<Tabs.Trigger value="30days">30 Days</Tabs.Trigger>
				<Tabs.Trigger value="year">Year</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	</div>

	<!-- Leaderboard Table -->
	<div class="rounded-md border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16 text-center">Rank</Table.Head>
					<Table.Head>Developer</Table.Head>
					<Table.Head class="w-32 text-right">Contributions</Table.Head>
					<Table.Head class="hidden w-32 text-right sm:table-cell">Twitter</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if isLoading}
					<!-- Loading skeleton -->
					{#each Array.from({ length: SKELETON_ROWS }, (_, i) => i) as i (i)}
						<Table.Row>
							<Table.Cell class="text-center">
								<Skeleton class="mx-auto h-5 w-5" />
							</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-3">
									<Skeleton class="h-8 w-8 rounded-full" />
									<div class="flex flex-col gap-1">
										<Skeleton class="h-4 w-24" />
										<Skeleton class="h-3 w-16" />
									</div>
								</div>
							</Table.Cell>
							<Table.Cell class="text-right">
								<Skeleton class="ml-auto h-4 w-12" />
							</Table.Cell>
							<Table.Cell class="hidden text-right sm:table-cell">
								<Skeleton class="ml-auto h-4 w-20" />
							</Table.Cell>
						</Table.Row>
					{/each}
				{:else if data.leaderboard.leaderboard.length === 0}
					<Table.Row>
						<Table.Cell colspan={4} class="py-12 text-center text-muted-foreground">
							No developers on the leaderboard yet. Be the first to
							<a href={resolve('/join')} class="text-primary underline">join</a>!
						</Table.Cell>
					</Table.Row>
				{:else}
					{#each data.leaderboard.leaderboard as entry (entry.github_username)}
						<Table.Row>
							<Table.Cell class="text-center font-medium">
								{#if entry.rank <= 3}
									<span class="text-xl">{getMedalEmoji(entry.rank)}</span>
								{:else}
									{entry.rank}
								{/if}
							</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-3">
									<Avatar.Root class="h-8 w-8">
										<Avatar.Image
											src={getAvatarUrl(entry.avatar_url)}
											alt={entry.github_username}
											loading="lazy"
											decoding="async"
											width={32}
											height={32}
										/>
										<Avatar.Fallback>
											{entry.github_username.slice(0, 2).toUpperCase()}
										</Avatar.Fallback>
									</Avatar.Root>
									<div class="flex flex-col">
										<a
											href="https://github.com/{entry.github_username}"
											target="_blank"
											rel="noopener noreferrer"
											class="flex items-center gap-1 font-medium hover:text-primary hover:underline"
										>
											<Github class="h-3 w-3" />
											{entry.github_username}
										</a>
										{#if entry.display_name}
											<span class="text-xs text-muted-foreground">{entry.display_name}</span>
										{/if}
									</div>
								</div>
							</Table.Cell>
							<Table.Cell class="text-right font-mono font-semibold">
								{formatNumber(entry.contributions)}
							</Table.Cell>
							<Table.Cell class="hidden text-right sm:table-cell">
								{#if entry.twitter_handle}
									<a
										href="https://twitter.com/{entry.twitter_handle}"
										target="_blank"
										rel="noopener noreferrer"
										class="flex items-center justify-end gap-1 text-muted-foreground hover:text-primary"
									>
										<Twitter class="h-3 w-3" />
										@{entry.twitter_handle}
									</a>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				{/if}
			</Table.Body>
		</Table.Root>
	</div>

	<!-- Pagination -->
	{#if data.leaderboard.pagination.totalPages > 1}
		<div class="mt-6 flex items-center justify-between">
			<p class="text-sm text-muted-foreground">
				Page {data.leaderboard.pagination.page} of {data.leaderboard.pagination.totalPages}
				<span class="hidden sm:inline">
					({formatNumber(data.leaderboard.pagination.total)} developers)
				</span>
			</p>
			<div class="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={data.leaderboard.pagination.page <= 1}
					onclick={() => handlePageChange(data.leaderboard.pagination.page - 1)}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={data.leaderboard.pagination.page >= data.leaderboard.pagination.totalPages}
					onclick={() => handlePageChange(data.leaderboard.pagination.page + 1)}
				>
					Next
				</Button>
			</div>
		</div>
	{/if}
</div>
