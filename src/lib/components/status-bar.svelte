<script lang="ts">
	import { onMount } from 'svelte';
	import { formatUTCClockTime } from '$lib/time';
	import Kbd from './kbd.svelte';
	import type { StatsResponse } from '$lib/types';

	interface Props {
		/** Present only on routes whose load returns them; segments hide when absent. */
		stats?: StatsResponse | null;
		/** Current path, rendered as the session's working directory. */
		path: string;
		onOpenPalette: () => void;
	}

	let { stats = null, path, onOpenPalette }: Props = $props();

	const numberFormatter = new Intl.NumberFormat('en-US');

	let utcNow: Date | null = $state(null);
	const utcNowLabel = $derived(utcNow ? formatUTCClockTime(utcNow) : '--:--:-- UTC');

	/* The product's whole premise is hourly UTC sync, so the clock is ambient
	   state that belongs in the status bar rather than on one page. */
	onMount(() => {
		utcNow = new Date();
		const timer = window.setInterval(() => {
			utcNow = new Date();
		}, 1000);
		return () => window.clearInterval(timer);
	});

	const cwd = $derived(path === '/' ? '~/' : `~${path}`);

	function formatNumber(num: number): string {
		return numberFormatter.format(num);
	}

	function formatRelativeTime(isoString: string | null): string {
		if (!isoString) return 'never';

		const diffMs = Date.now() - new Date(isoString).getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		return `${diffDays}d ago`;
	}

	function formatTimeUntil(isoString: string | null): string {
		if (!isoString) return 'unknown';

		const diffMs = new Date(isoString).getTime() - Date.now();
		if (diffMs <= 0) return 'soon';

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

		return (
			new Date(isoString).toLocaleString('en-US', {
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
</script>

<!--
	tmux's status line. Every readout carries its own label, which is the point:
	the previous design showed four unlabelled icon+number pairs and required a
	hover to learn that "42m" meant the next sync.
-->
<footer
	class="sticky bottom-0 z-40 flex h-[var(--shell-status)] items-center gap-x-3 overflow-x-auto border-t border-border bg-card px-3 text-2xs whitespace-nowrap text-subtle-foreground"
>
	<span class="text-primary">{cwd}</span>

	{#if stats}
		<span class="hidden items-center gap-1 sm:flex">
			<span class="term-label">users</span>
			<span class="text-foreground">{formatNumber(stats.total_users)}</span>
		</span>
		<span class="hidden items-center gap-1 sm:flex" title="Contributions recorded for today (UTC)">
			<span class="term-label">today</span>
			<span class="text-foreground">{formatNumber(stats.total_contributions_today)}</span>
		</span>
		<span class="hidden items-center gap-1 md:flex" title={formatUTCTime(stats.last_sync)}>
			<span class="term-label">synced</span>
			<span class="text-foreground">{formatRelativeTime(stats.last_sync)}</span>
		</span>
		<span class="hidden items-center gap-1 md:flex" title={formatUTCTime(stats.next_sync)}>
			<span class="term-label">next</span>
			<span class="text-foreground">{formatTimeUntil(stats.next_sync)}</span>
		</span>
	{/if}

	<span class="ml-auto flex items-center gap-3">
		<span class="text-foreground" aria-label="Current UTC time">{utcNowLabel}</span>
		<button
			type="button"
			onclick={onOpenPalette}
			class="term-transition flex size-6 items-center justify-center text-subtle-foreground hover:text-primary"
		>
			<span class="sr-only">Open command palette</span>
			<Kbd key="⌘K" />
		</button>
	</span>
</footer>
