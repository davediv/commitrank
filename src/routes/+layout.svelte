<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Button } from '$lib/components/ui/button';
	import { Github } from '@lucide/svelte';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<!-- Minimal header -->
	<header
		class="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
	>
		<div class="mx-auto flex h-12 max-w-3xl items-center justify-between px-4">
			<a href={resolve('/')} class="flex items-center gap-2 font-medium text-foreground">
				<Github class="h-5 w-5" />
				<span>CommitRank</span>
			</a>
			<Button href={resolve('/join')} size="sm" class="h-7 px-3">Join</Button>
		</div>
	</header>

	<!-- Main content -->
	<main class="flex-1">
		{@render children()}
	</main>

	<!-- Minimal footer -->
	<footer class="border-t border-border/50 py-4">
		<div class="mx-auto max-w-3xl px-4">
			<p class="text-center text-xs text-muted-foreground">GitHub Commit Leaderboard</p>
		</div>
	</footer>
</div>
