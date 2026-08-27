<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong');

	// Every error screen answers "what happened" and "how do I get out".
	// Before this route existed, both fell through to SvelteKit's default.
	const guidance = $derived.by(() => {
		if (status === 404) return "That developer isn't on CommitRank yet.";
		if (status === 429) return 'Too many requests. Wait a moment and try again.';
		if (status >= 500) return 'The leaderboard is having trouble. This is on our side.';
		return 'The page could not be loaded.';
	});
</script>

<svelte:head>
	<title>{status} - CommitRank</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto w-full max-w-md px-3 py-16">
	<p class="text-sm text-subtle-foreground">
		<span aria-hidden="true" class="text-primary">$</span> commitrank
	</p>

	<h1 class="mt-4 flex items-baseline gap-2 text-xl">
		<span class="text-destructive">ERR {status}</span>
		<span class="text-foreground">{message}</span>
	</h1>

	<p class="mt-2 text-sm text-muted-foreground">{guidance}</p>

	<div class="mt-6 flex flex-wrap items-center gap-2">
		<Button href={resolve('/')} size="sm">Back to leaderboard</Button>
		{#if status === 404}
			<Button href={resolve('/join')} variant="outline" size="sm">Join CommitRank</Button>
		{/if}
	</div>
</div>
