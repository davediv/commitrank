<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Github, AtSign, Loader2, ArrowLeft } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { ActionData } from './$types';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();

	// Form state
	let isSubmitting = $state(false);
	let github_username = $state('');
	let twitter_handle = $state('');

	// Sync form values when form prop changes
	$effect(() => {
		if (form?.github_username !== undefined) {
			github_username = form.github_username ?? '';
		}
		if (form?.twitter_handle !== undefined) {
			twitter_handle = form.twitter_handle ?? '';
		}
	});

	// Client-side validation errors
	let githubError = $state('');
	let twitterError = $state('');

	// Validation patterns
	const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
	const TWITTER_HANDLE_REGEX = /^[a-zA-Z0-9_]{1,15}$/;

	function validateGitHub(value: string): boolean {
		if (!value) {
			githubError = 'Required';
			return false;
		}
		if (!GITHUB_USERNAME_REGEX.test(value)) {
			githubError = 'Invalid username format';
			return false;
		}
		githubError = '';
		return true;
	}

	function validateTwitter(value: string): boolean {
		if (value && !TWITTER_HANDLE_REGEX.test(value)) {
			twitterError = 'Invalid handle format';
			return false;
		}
		twitterError = '';
		return true;
	}

	function handleGitHubBlur() {
		validateGitHub(github_username);
	}

	function handleTwitterBlur() {
		validateTwitter(twitter_handle);
	}

	function handleSubmit() {
		const isGitHubValid = validateGitHub(github_username);
		const isTwitterValid = validateTwitter(twitter_handle);
		return isGitHubValid && isTwitterValid;
	}
</script>

<svelte:head>
	<title>Join - CommitRank</title>
	<meta name="description" content="Join the CommitRank leaderboard and see where you rank." />
</svelte:head>

<div class="mx-auto max-w-sm px-4 py-12">
	<!-- Back link -->
	<a
		href={resolve('/')}
		class="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft class="h-3 w-3" />
		Back to leaderboard
	</a>

	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-lg font-semibold">Join CommitRank</h1>
		<p class="mt-1 text-muted-foreground">
			Enter your GitHub username to see where you rank.
		</p>
	</div>

	<!-- Error message -->
	{#if form?.error}
		<div
			class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive"
		>
			{form.message}
		</div>
	{/if}

	<!-- Form -->
	<form
		method="POST"
		use:enhance={() => {
			if (!handleSubmit()) {
				return;
			}
			isSubmitting = true;
			return async ({ update }) => {
				isSubmitting = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		<!-- GitHub Username -->
		<div class="space-y-1.5">
			<label for="github_username" class="flex items-center gap-1.5 font-medium">
				<Github class="h-3.5 w-3.5" />
				GitHub Username
			</label>
			<Input
				type="text"
				id="github_username"
				name="github_username"
				placeholder="octocat"
				bind:value={github_username}
				onblur={handleGitHubBlur}
				aria-invalid={!!githubError || !!form?.error}
				class="h-9 {githubError || (form?.error && form?.error !== 'INVALID_TWITTER')
					? 'border-destructive focus-visible:ring-destructive'
					: ''}"
				disabled={isSubmitting}
				required
			/>
			{#if githubError}
				<p class="text-sm text-destructive">{githubError}</p>
			{/if}
		</div>

		<!-- Twitter Handle -->
		<div class="space-y-1.5">
			<label for="twitter_handle" class="flex items-center gap-1.5 font-medium">
				<AtSign class="h-3.5 w-3.5" />
				<span>X Handle</span>
				<span class="font-normal text-muted-foreground">(optional)</span>
			</label>
			<Input
				type="text"
				id="twitter_handle"
				name="twitter_handle"
				placeholder="username"
				bind:value={twitter_handle}
				onblur={handleTwitterBlur}
				class="h-9 {twitterError || form?.error === 'INVALID_TWITTER'
					? 'border-destructive focus-visible:ring-destructive'
					: ''}"
				disabled={isSubmitting}
			/>
			{#if twitterError}
				<p class="text-sm text-destructive">{twitterError}</p>
			{/if}
		</div>

		<!-- Submit Button -->
		<Button type="submit" class="h-9 w-full" disabled={isSubmitting}>
			{#if isSubmitting}
				<Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
				Joining...
			{:else}
				Join Leaderboard
			{/if}
		</Button>
	</form>

	<!-- Privacy Notice -->
	<p class="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
		By joining, you agree to have your public GitHub contribution data displayed on the leaderboard.
	</p>
</div>
