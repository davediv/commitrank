<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Github, Twitter, Loader2 } from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { ActionData } from './$types';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();

	// Form state
	let isSubmitting = $state(false);
	let github_username = $state(form?.github_username ?? '');
	let twitter_handle = $state(form?.twitter_handle ?? '');

	// Client-side validation errors
	let githubError = $state('');
	let twitterError = $state('');

	// Validation patterns
	const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
	const TWITTER_HANDLE_REGEX = /^[a-zA-Z0-9_]{1,15}$/;

	function validateGitHub(value: string): boolean {
		if (!value) {
			githubError = 'GitHub username is required';
			return false;
		}
		if (!GITHUB_USERNAME_REGEX.test(value)) {
			githubError = 'Invalid format. 1-39 chars, alphanumeric or hyphen';
			return false;
		}
		githubError = '';
		return true;
	}

	function validateTwitter(value: string): boolean {
		if (value && !TWITTER_HANDLE_REGEX.test(value)) {
			twitterError = 'Invalid format. 1-15 chars, alphanumeric or underscore';
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

<div class="container mx-auto px-4 py-8">
	<Card.Root class="mx-auto max-w-md">
		<Card.Header class="text-center">
			<Card.Title class="text-2xl">Join the CommitRank Leaderboard</Card.Title>
			<Card.Description>
				Enter your GitHub username to see where you rank among developers.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<!-- Error Alert -->
			{#if form?.error}
				<Alert.Root variant="destructive" class="mb-6">
					<Alert.Title>Registration Failed</Alert.Title>
					<Alert.Description>{form.message}</Alert.Description>
				</Alert.Root>
			{/if}

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
			>
				<div class="space-y-4">
					<!-- GitHub Username -->
					<div class="space-y-2">
						<label for="github_username" class="text-sm leading-none font-medium">
							<span class="flex items-center gap-2">
								<Github class="h-4 w-4" />
								GitHub Username
								<span class="text-destructive">*</span>
							</span>
						</label>
						<Input
							type="text"
							id="github_username"
							name="github_username"
							placeholder="octocat"
							bind:value={github_username}
							onblur={handleGitHubBlur}
							aria-invalid={!!githubError || !!form?.error}
							class={githubError || (form?.error && form?.error !== 'INVALID_TWITTER')
								? 'border-destructive'
								: ''}
							disabled={isSubmitting}
							required
						/>
						{#if githubError}
							<p class="text-sm text-destructive">{githubError}</p>
						{/if}
					</div>

					<!-- Twitter Handle -->
					<div class="space-y-2">
						<label for="twitter_handle" class="text-sm leading-none font-medium">
							<span class="flex items-center gap-2">
								<Twitter class="h-4 w-4" />
								Twitter/X Handle
								<span class="text-muted-foreground">(optional)</span>
							</span>
						</label>
						<div class="relative">
							<span class="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">@</span>
							<Input
								type="text"
								id="twitter_handle"
								name="twitter_handle"
								placeholder="username"
								bind:value={twitter_handle}
								onblur={handleTwitterBlur}
								class={twitterError || form?.error === 'INVALID_TWITTER'
									? 'border-destructive pl-7'
									: 'pl-7'}
								disabled={isSubmitting}
							/>
						</div>
						{#if twitterError}
							<p class="text-sm text-destructive">{twitterError}</p>
						{/if}
					</div>

					<!-- Submit Button -->
					<Button type="submit" class="w-full" disabled={isSubmitting}>
						{#if isSubmitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Joining...
						{:else}
							Join Leaderboard
						{/if}
					</Button>
				</div>
			</form>

			<!-- Privacy Notice -->
			<p class="mt-6 text-center text-xs text-muted-foreground">
				By joining, you agree to have your public GitHub contribution data displayed on our
				leaderboard. We only access publicly available information.
			</p>
		</Card.Content>
		<Card.Footer class="justify-center">
			<a
				href={resolve('/')}
				class="text-sm text-muted-foreground hover:text-primary hover:underline"
			>
				← Back to Leaderboard
			</a>
		</Card.Footer>
	</Card.Root>
</div>
