<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
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
	<link rel="canonical" href="https://commitrank.dev/join" />
	<title>Join - CommitRank</title>
	<meta name="description" content="Join the CommitRank leaderboard and see where you rank." />
</svelte:head>

<!-- Prose measure, not full bleed: a form is the one thing on this site that
     should not stretch to the viewport. -->
<div class="mx-auto w-full max-w-md px-3 py-6">
	<a
		href={resolve('/')}
		class="term-transition inline-flex h-6 items-center gap-1 text-sm text-subtle-foreground hover:text-primary"
	>
		<span aria-hidden="true">←</span>
		Back to Leaderboard
	</a>

	<div class="mt-6 mb-5 flex flex-col gap-1.5">
		<p class="text-sm text-subtle-foreground">
			<span aria-hidden="true" class="text-primary">$</span> commitrank join
		</p>
		<h1 class="text-lg font-medium text-foreground">Join the CommitRank Leaderboard</h1>
		<p class="text-sm text-muted-foreground">Enter your GitHub username to see where you rank.</p>
	</div>

	{#if form?.error}
		<div
			class="mb-4 border border-destructive bg-destructive/10 px-3 py-2"
			role="alert"
			id="form-error"
		>
			<p class="text-sm font-medium text-destructive">
				<span aria-hidden="true">✗</span> Registration Failed
			</p>
			<p class="mt-0.5 text-sm text-muted-foreground">{form.message}</p>
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			if (!handleSubmit()) {
				return;
			}
			isSubmitting = true;
			return async ({ update, result }) => {
				await update();
				// Reset loading state on error (success redirects, so this only runs on errors)
				if (result.type === 'failure' || result.type === 'error') {
					isSubmitting = false;
				}
			};
		}}
		class="flex flex-col gap-4"
	>
		<div class="flex flex-col gap-1.5">
			<label for="github_username" class="term-label flex items-center gap-1">
				GitHub Username
				<span aria-hidden="true" class="text-destructive">*</span>
			</label>
			<Input
				type="text"
				id="github_username"
				name="github_username"
				prompt=">"
				placeholder="octocat"
				bind:value={github_username}
				onblur={handleGitHubBlur}
				aria-invalid={!!githubError || !!form?.error}
				aria-describedby={githubError
					? 'github_username-error'
					: form?.error
						? 'form-error'
						: undefined}
				disabled={isSubmitting}
				required
			/>
			{#if githubError}
				<p id="github_username-error" class="text-xs text-destructive">{githubError}</p>
			{/if}
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="twitter_handle" class="term-label flex items-center gap-1">
				Twitter / X Handle
				<span class="text-subtle-foreground normal-case">(optional)</span>
			</label>
			<Input
				type="text"
				id="twitter_handle"
				name="twitter_handle"
				prompt="@"
				placeholder="username"
				bind:value={twitter_handle}
				onblur={handleTwitterBlur}
				aria-invalid={!!twitterError || form?.error === 'INVALID_TWITTER'}
				aria-describedby={twitterError ? 'twitter_handle-error' : undefined}
				disabled={isSubmitting}
			/>
			{#if twitterError}
				<p id="twitter_handle-error" class="text-xs text-destructive">{twitterError}</p>
			{/if}
		</div>

		<Button type="submit" size="lg" class="mt-1 w-full" disabled={isSubmitting} kbd="↵">
			{#if isSubmitting}
				<span aria-hidden="true" class="term-cursor"></span>
				Joining…
			{:else}
				Join Leaderboard
			{/if}
		</Button>
		<span class="sr-only" aria-live="polite">{isSubmitting ? 'Joining…' : ''}</span>
	</form>

	<p class="mt-6 text-xs leading-relaxed text-subtle-foreground">
		By joining, you agree to have your public GitHub contribution data displayed on the leaderboard.
		All data shown is publicly available information from GitHub.
	</p>
</div>
