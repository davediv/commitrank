<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import CommandPalette from '$lib/components/command-palette.svelte';
	import StatusBar from '$lib/components/status-bar.svelte';

	let { children } = $props();

	let palette: ReturnType<typeof CommandPalette> | null = $state(null);

	function openPalette() {
		palette?.open();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="term-scanlines flex min-h-screen flex-col" data-sveltekit-preload-data="hover">
	<a
		href="#main"
		class="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:border focus-visible:border-primary focus-visible:bg-card focus-visible:px-2 focus-visible:py-1 focus-visible:text-sm focus-visible:text-primary"
	>
		Skip to content
	</a>

	<header
		class="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
	>
		<div class="flex h-[var(--shell-header)] items-center gap-3 px-3">
			<a
				href={resolve('/')}
				class="term-transition flex h-6 items-center gap-1.5 font-medium text-foreground hover:text-primary"
			>
				<span aria-hidden="true" class="term-cursor"></span>
				<span>commitrank</span>
			</a>

			<div class="ml-auto flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					onclick={openPalette}
					kbd="⌘K"
					class="hidden sm:inline-flex"
				>
					Search
				</Button>
				<Button href={resolve('/join')} size="sm">Join</Button>
			</div>
		</div>
	</header>

	<main id="main" class="flex-1">
		{@render children()}
	</main>

	<StatusBar stats={page.data.stats ?? null} path={page.url.pathname} onOpenPalette={openPalette} />
</div>

<CommandPalette bind:this={palette} />
