<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Kbd from './kbd.svelte';
	import type { ApiResponse, LeaderboardEntry, LeaderboardResponse } from '$lib/types';

	interface Command {
		id: string;
		label: string;
		hint: string;
		group: string;
		run: () => void;
	}

	let dialog: HTMLDialogElement | null = $state(null);
	let input: HTMLInputElement | null = $state(null);
	let query = $state('');
	let activeIndex = $state(0);
	let users: LeaderboardEntry[] = $state([]);
	let indexState: 'idle' | 'loading' | 'ready' | 'error' = $state('idle');
	/* Restored on close so the palette never strands the keyboard user. */
	let lastFocused: HTMLElement | null = null;

	const PERIODS = [
		['today', 'Today'],
		['7days', 'Last 7 days'],
		['30days', 'Last 30 days'],
		['year', 'Last year']
	] as const;

	/*
	 * The user index is fetched on first open, never on page load — an unopened
	 * palette must cost nothing. It reads the existing /api/leaderboard
	 * contract; no endpoint or response shape changes.
	 */
	async function loadIndex() {
		if (indexState === 'loading' || indexState === 'ready') return;
		indexState = 'loading';
		try {
			const res = await fetch('/api/leaderboard?period=year&limit=100');
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as ApiResponse<LeaderboardResponse>;
			users = body.success ? (body.data?.leaderboard ?? []) : [];
			indexState = 'ready';
		} catch {
			indexState = 'error';
		}
	}

	export function open() {
		lastFocused = document.activeElement as HTMLElement | null;
		query = '';
		activeIndex = 0;
		dialog?.showModal();
		input?.focus();
		void loadIndex();
	}

	function close() {
		if (dialog?.open) dialog.close();
	}

	function handleClose() {
		query = '';
		activeIndex = 0;
		lastFocused?.focus();
		lastFocused = null;
	}

	/**
	 * Subsequence match, ranked: prefix beats substring beats scattered letters.
	 * Returns -1 for no match so callers can filter in one pass.
	 */
	function score(haystack: string, needle: string): number {
		if (!needle) return 0;
		const h = haystack.toLowerCase();
		const n = needle.toLowerCase();
		if (h.startsWith(n)) return 1000 - h.length;
		const at = h.indexOf(n);
		if (at !== -1) return 500 - at - h.length;

		let i = 0;
		let gaps = 0;
		for (const char of h) {
			if (char === n[i]) {
				i++;
				if (i === n.length) return 100 - gaps;
			} else if (i > 0) {
				gaps++;
			}
		}
		return -1;
	}

	function navigate(href: string) {
		close();
		void goto(href);
	}

	const commands: Command[] = $derived.by(() => {
		const q = query.trim();

		const userCommands: (Command & { rank: number })[] = users
			.map((entry) => {
				const best = Math.max(
					score(entry.github_username, q),
					entry.display_name ? score(entry.display_name, q) : -1
				);
				return { entry, best };
			})
			.filter(({ best }) => best > -1)
			.sort((a, b) => b.best - a.best || a.entry.rank - b.entry.rank)
			.slice(0, 8)
			.map(({ entry }) => ({
				id: `user-${entry.github_username}`,
				label: entry.github_username,
				hint: entry.display_name ?? `#${entry.rank}`,
				group: 'Developers',
				rank: entry.rank,
				run: () => navigate(resolve(`/${entry.github_username}`))
			}));

		const periodCommands: Command[] = PERIODS.filter(
			([, label]) => score(label, q) > -1 || score('period', q) > -1
		).map(([value, label]) => ({
			id: `period-${value}`,
			label,
			hint: 'period',
			group: 'Leaderboard',
			run: () => navigate(`${resolve('/')}?period=${value}`)
		}));

		const goCommands: Command[] = [
			{ id: 'go-home', label: 'Leaderboard', hint: '/', href: resolve('/') },
			{ id: 'go-join', label: 'Join CommitRank', hint: '/join', href: resolve('/join') }
		]
			.filter(({ label }) => score(label, q) > -1)
			.map(({ id, label, hint, href }) => ({
				id,
				label,
				hint,
				group: 'Go to',
				run: () => navigate(href)
			}));

		return [...userCommands, ...periodCommands, ...goCommands];
	});

	// A plain record rather than a Map: svelte/prefer-svelte-reactivity rejects a
	// mutable Map here, and this grouping is derived state that never mutates.
	const groups = $derived.by(() => {
		const order: string[] = [];
		const byGroup: Record<string, { command: Command; index: number }[]> = {};
		commands.forEach((command, index) => {
			if (!byGroup[command.group]) {
				byGroup[command.group] = [];
				order.push(command.group);
			}
			byGroup[command.group].push({ command, index });
		});
		return order.map((name) => ({ name, items: byGroup[name] }));
	});

	/* Keep the cursor inside the result set as it shrinks under typing. */
	$effect(() => {
		if (activeIndex >= commands.length) activeIndex = Math.max(0, commands.length - 1);
	});

	function move(delta: number) {
		if (commands.length === 0) return;
		activeIndex = (activeIndex + delta + commands.length) % commands.length;
		document
			.getElementById(commands[activeIndex].id)
			?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			commands[activeIndex]?.run();
		}
	}

	/* ⌘K / Ctrl-K is global — the palette is a navigation element, not a bonus. */
	$effect(() => {
		function onWindowKeydown(event: KeyboardEvent) {
			if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				if (dialog?.open) close();
				else open();
			}
		}
		window.addEventListener('keydown', onWindowKeydown);
		return () => window.removeEventListener('keydown', onWindowKeydown);
	});
</script>

<!--
	A native <dialog> gives focus trapping and Esc for free, and opens with no
	animation: this is keyboard-initiated, and a keyboard action that waits on a
	transition is the one thing this style will not tolerate.
	The backdrop click is a convenience; Esc is the documented, keyboard-reachable
	dismissal that <dialog> provides for free.
-->
<dialog
	bind:this={dialog}
	class="term-palette m-0 w-[calc(100%-1.5rem)] max-w-xl border border-border-control bg-popover p-0 text-foreground sm:w-full"
	aria-label="Command palette"
	onclose={handleClose}
	onclick={(event) => {
		if (event.target === event.currentTarget) close();
	}}
>
	<div class="flex items-center gap-2 border-b border-border px-3">
		<span aria-hidden="true" class="text-primary">&gt;</span>
		<input
			bind:this={input}
			bind:value={query}
			onkeydown={handleKeydown}
			type="text"
			role="combobox"
			aria-expanded="true"
			aria-controls="command-list"
			aria-activedescendant={commands[activeIndex]?.id}
			aria-label="Search developers and commands"
			autocomplete="off"
			spellcheck="false"
			placeholder="Search developers, periods, pages…"
			class="h-10 w-full border-0 bg-transparent text-sm text-foreground placeholder:text-subtle-foreground"
		/>
		<Kbd key="Esc" />
	</div>

	<ul id="command-list" role="listbox" aria-label="Results" class="max-h-72 overflow-y-auto py-1">
		{#each groups as group (group.name)}
			<li role="presentation">
				<p class="term-label px-3 pt-2 pb-1">{group.name}</p>
				<ul role="group" aria-label={group.name}>
					{#each group.items as { command, index } (command.id)}
						<li
							id={command.id}
							role="option"
							aria-selected={index === activeIndex}
							class="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-foreground"
							onpointerdown={(event) => {
								event.preventDefault();
								command.run();
							}}
							onpointerenter={() => (activeIndex = index)}
						>
							<span
								aria-hidden="true"
								class="w-2 shrink-0 {index === activeIndex ? 'text-primary' : 'text-transparent'}"
								>▍</span
							>
							<span class="truncate">{command.label}</span>
							<span class="ml-auto truncate pl-3 text-2xs text-subtle-foreground">
								{command.hint}
							</span>
							{#if index === activeIndex}
								<span aria-hidden="true" class="text-2xs text-primary">↵</span>
							{/if}
						</li>
					{/each}
				</ul>
			</li>
		{/each}

		{#if commands.length === 0}
			<li role="presentation" class="px-3 py-6 text-center text-sm text-subtle-foreground">
				{#if indexState === 'loading'}
					Loading index…
				{:else if indexState === 'error'}
					Index unavailable. <span class="text-destructive">Try again shortly.</span>
				{:else}
					No match for <span class="text-foreground">{query}</span>
				{/if}
			</li>
		{/if}
	</ul>

	<div
		class="flex items-center gap-3 border-t border-border px-3 py-1.5 text-2xs text-subtle-foreground"
	>
		<span class="flex items-center gap-1"><Kbd key="↑" /><Kbd key="↓" /> navigate</span>
		<span class="flex items-center gap-1"><Kbd key="↵" /> open</span>
		<span class="ml-auto flex items-center gap-1"><Kbd key="⌘K" /> toggle</span>
	</div>
</dialog>

<style>
	/* Centred, because a modal is not anchored to a trigger. */
	.term-palette {
		position: fixed;
		top: 18vh;
		left: 50%;
		translate: -50% 0;
		border-radius: var(--radius);
		box-shadow: var(--shadow-overlay);
	}
</style>
