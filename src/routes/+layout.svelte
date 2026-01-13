<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Button } from '$lib/components/ui/button';
	import { Trophy } from '@lucide/svelte';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col">
	<header
		class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
	>
		<div class="container mx-auto flex h-14 items-center justify-between px-4">
			<a href={resolve('/')} class="flex items-center gap-2 font-semibold">
				<Trophy class="h-5 w-5" />
				<span>CommitRank</span>
			</a>
			<Button href={resolve('/join')}>Join Leaderboard</Button>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="border-t py-6">
		<div class="container mx-auto px-4 text-center text-sm text-muted-foreground">
			<p>Built with SvelteKit and Cloudflare Workers</p>
		</div>
	</footer>
</div>
