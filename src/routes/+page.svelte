<script lang="ts">
	import { navigating } from '$app/stores';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Avatar from '$lib/components/avatar.svelte';
	import Meter from '$lib/components/meter.svelte';
	import Kbd from '$lib/components/kbd.svelte';
	import { Button } from '$lib/components/ui/button';
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
	const numberFormatter = new Intl.NumberFormat('en-US');

	// Client-side filter over the rows already on screen. ⌘K searches everyone;
	// this narrows what you are looking at, which is the commoner need.
	let filter = $state('');
	let filterInput: HTMLInputElement | null = $state(null);

	const rows = $derived.by(() => {
		const query = filter.trim().toLowerCase();
		if (!query) return data.leaderboard.leaderboard;
		return data.leaderboard.leaderboard.filter(
			(entry) =>
				entry.github_username.toLowerCase().includes(query) ||
				(entry.display_name?.toLowerCase().includes(query) ?? false) ||
				(entry.twitter_handle?.toLowerCase().includes(query) ?? false)
		);
	});

	// The meter reads as share of the page leader, so it needs the page maximum.
	const maxContributions = $derived(
		data.leaderboard.leaderboard.reduce((max, entry) => Math.max(max, entry.contributions), 0)
	);

	// A braille spinner is this style's loading signal. It runs only while a
	// navigation is in flight and stops dead when it lands.
	const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
	let spinnerFrame = $state(0);

	$effect(() => {
		if (!isLoading) {
			spinnerFrame = 0;
			return;
		}
		const timer = window.setInterval(() => {
			spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
		}, 80);
		return () => window.clearInterval(timer);
	});

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

	// `/` focuses the filter, the way it does in less, vim and fzf — but never
	// while the user is already typing somewhere.
	$effect(() => {
		function onKeydown(event: KeyboardEvent) {
			if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest('input, textarea, select, [contenteditable]')) return;
			event.preventDefault();
			filterInput?.focus();
			filterInput?.select();
		}
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
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

	// Rank is this product's primary axis, so it is expressed in the one
	// hierarchy tool a terminal actually has: brightness. Phosphor for the
	// leader, full white for the podium, subtle for the field.
	function rankTone(rank: number): string {
		if (rank === 1) return 'text-primary';
		if (rank <= 3) return 'text-foreground';
		return 'text-subtle-foreground';
	}

	// Period tabs configuration
	const periods = [
		{ value: 'today', label: 'Today' },
		{ value: '7days', label: '7 Days' },
		{ value: '30days', label: '30 Days' },
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
		class="m-auto w-[calc(100%-2rem)] max-w-sm border border-primary bg-card p-4 text-foreground"
		aria-labelledby="welcome-title"
		aria-describedby="welcome-description"
		onclose={() => (showSuccessModal = false)}
		onclick={(event) => {
			if (event.target === event.currentTarget) dismissSuccess();
		}}
	>
		<div class="flex flex-col gap-3">
			<h2 id="welcome-title" class="text-sm font-medium text-primary">
				<span aria-hidden="true">✓</span> Welcome to CommitRank
			</h2>
			<p id="welcome-description" class="text-sm text-muted-foreground">
				<strong class="font-medium text-foreground">@{successMessage.username}</strong> joined with
				<strong class="font-medium text-primary"
					>{formatNumber(successMessage.contributions)}</strong
				>
				contributions.
			</p>
			<div class="flex justify-end">
				<Button onclick={dismissSuccess} size="sm" kbd="↵">View leaderboard</Button>
			</div>
		</div>
	</dialog>
{/if}

<div class="px-3 py-4">
	<!-- Command bar: what this is, how to slice it, how to find someone -->
	<div class="flex flex-col gap-3 pb-3 lg:flex-row lg:items-end lg:justify-between">
		<div class="flex flex-col gap-1.5">
			<h1 class="term-label">GitHub Commit Leaderboard</h1>
			<nav aria-label="Contribution period" class="flex items-center">
				<span aria-hidden="true" class="pr-2 text-subtle-foreground">period</span>
				<ul class="flex items-center gap-1">
					{#each periods as period (period.value)}
						<li>
							<a
								href={getPeriodHref(period.value)}
								aria-current={data.period === period.value ? 'page' : undefined}
								class="term-transition inline-flex h-7 items-center border px-2 text-sm {data.period ===
								period.value
									? 'border-primary bg-primary/10 text-primary'
									: 'border-border-control text-muted-foreground hover:border-primary hover:text-primary'}"
							>
								{period.label}
							</a>
						</li>
					{/each}
				</ul>
				{#if isLoading}
					<span
						class="pl-2 text-primary"
						role="status"
						aria-label="Loading leaderboard"
						aria-live="polite">{SPINNER_FRAMES[spinnerFrame]}</span
					>
				{/if}
			</nav>
		</div>

		{#if data.leaderboard.leaderboard.length > 0}
			<div class="flex items-center gap-2">
				<label for="row-filter" class="term-label shrink-0">filter</label>
				<div class="relative flex w-full items-center lg:w-72">
					<span aria-hidden="true" class="pointer-events-none absolute left-2 text-primary">/</span>
					<input
						bind:this={filterInput}
						bind:value={filter}
						id="row-filter"
						type="text"
						autocomplete="off"
						spellcheck="false"
						placeholder="narrow this page"
						class="term-transition h-7 w-full rounded-md border border-input bg-surface-sunken py-1 pr-8 pl-6 text-sm text-foreground placeholder:text-subtle-foreground focus-visible:border-primary"
					/>
					<span class="pointer-events-none absolute right-1.5"><Kbd key="/" /></span>
				</div>
				<!-- Filtering changes the table silently for a screen-reader user, so
				     the new row count has to be announced. -->
				<span class="sr-only" role="status" aria-live="polite">
					{filter.trim()
						? `${rows.length} of ${data.leaderboard.leaderboard.length} rows match ${filter.trim()}`
						: ''}
				</span>
			</div>
		{/if}
	</div>

	<!-- Leaderboard -->
	<div
		class="term-transition border border-border {isLoading ? 'opacity-60' : ''}"
		aria-busy={isLoading}
	>
		<table class="w-full table-fixed border-collapse text-sm">
			<thead>
				<tr class="border-b border-border bg-card">
					<th scope="col" class="term-label w-[6%] py-1.5 pr-4 text-right">Rank</th>
					<th scope="col" class="term-label w-[46%] py-1.5 pl-1 text-left">Developer</th>
					<th scope="col" class="term-label hidden w-[26%] py-1.5 text-left md:table-cell"
						>Twitter</th
					>
					<th scope="col" class="term-label w-[22%] py-1.5 pr-3 text-right">Contributions</th>
				</tr>
			</thead>
			<tbody>
				{#if data.leaderboard.leaderboard.length === 0}
					<tr>
						<td colspan={4} class="px-3 py-10 text-center">
							<p class="text-muted-foreground">
								<span aria-hidden="true" class="text-primary">&gt;</span>
								<span>No developers on the leaderboard yet</span>
							</p>
							<p class="mt-1 text-subtle-foreground">
								Run <a
									href={resolve('/join')}
									class="term-transition border-b border-primary/40 text-primary hover:border-primary"
									>join</a
								> to be the first.
							</p>
						</td>
					</tr>
				{:else if rows.length === 0}
					<tr>
						<td colspan={4} class="px-3 py-10 text-center">
							<p class="text-muted-foreground">
								<span aria-hidden="true" class="text-primary">&gt;</span> No rows on this page match
								<span class="text-foreground">{filter}</span>
							</p>
							<p class="mt-1 text-subtle-foreground">
								Press <Kbd key="⌘K" /> to search every developer.
							</p>
						</td>
					</tr>
				{:else}
					{#each rows as entry (entry.github_username)}
						<tr class="term-transition border-b border-border/60 last:border-0 hover:bg-accent">
							<td class="py-1.5 pr-4 text-right align-middle">
								<span class="flex items-center justify-end gap-1">
									<span
										aria-hidden="true"
										class="text-primary {entry.rank === 1 ? 'opacity-100' : 'opacity-0'}">▍</span
									>
									<span class="{rankTone(entry.rank)} {entry.rank <= 3 ? 'font-medium' : ''}">
										{entry.rank}
									</span>
								</span>
							</td>
							<td class="py-1.5 pl-1 align-middle">
								<div class="flex items-center gap-2">
									<Avatar
										src={getAvatarUrl(entry.github_username, 64)}
										srcset={getAvatarSrcset(entry.github_username)}
										sizes="24px"
										alt=""
										initials={entry.github_username.slice(0, 2)}
										width={24}
										height={24}
										fallbackClass="text-2xs"
									/>
									<a
										href={resolve(`/${entry.github_username}`)}
										class="term-transition truncate {entry.rank === 1
											? 'text-primary'
											: 'text-foreground'} hover:text-primary hover:underline"
									>
										{entry.github_username}
									</a>
									{#if entry.display_name}
										<span class="hidden truncate text-subtle-foreground sm:inline">
											{entry.display_name}
										</span>
									{/if}
								</div>
							</td>
							<td class="hidden py-1.5 align-middle md:table-cell">
								{#if entry.twitter_handle}
									<a
										href="https://x.com/{entry.twitter_handle}"
										target="_blank"
										rel="noopener noreferrer"
										class="term-transition truncate text-muted-foreground hover:text-primary"
									>
										@{entry.twitter_handle}
									</a>
								{:else}
									<span class="text-subtle-foreground">-</span>
								{/if}
							</td>
							<td class="py-1.5 pr-3 align-middle">
								<span
									class="block text-right {entry.rank === 1 ? 'text-primary' : 'text-foreground'}"
									>{formatNumber(entry.contributions)}</span
								>
								<Meter
									value={entry.contributions}
									max={maxContributions}
									label="{formatNumber(entry.contributions)} contributions, {Math.round(
										(entry.contributions / (maxContributions || 1)) * 100
									)}% of the leader on this page"
									class="mt-1"
								/>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if data.leaderboard.pagination.totalPages > 1}
		<div class="mt-3 flex items-center justify-between text-sm">
			<span class="text-subtle-foreground">
				Page {data.leaderboard.pagination.page} of {data.leaderboard.pagination.totalPages}
				<span class="hidden sm:inline"
					>· {formatNumber(data.leaderboard.pagination.total)} ranked</span
				>
			</span>
			<div class="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					href={getPageHref(data.leaderboard.pagination.page - 1)}
					disabled={data.leaderboard.pagination.page <= 1}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					href={getPageHref(data.leaderboard.pagination.page + 1)}
					disabled={data.leaderboard.pagination.page >= data.leaderboard.pagination.totalPages}
				>
					Next
				</Button>
			</div>
		</div>
	{/if}
</div>
