<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Play, CheckCircle, XCircle, Loader2, Clock, Users, RefreshCw } from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import type { PageData, ActionData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let isRunning = $state(false);
</script>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title class="flex items-center gap-2 text-2xl">
						<RefreshCw class="h-6 w-6" />
						Cron Sync Test
					</Card.Title>
					<Card.Description class="mt-1">
						Manually trigger the scheduled sync to test cron functionality
					</Card.Description>
				</div>
				<Badge variant="outline" class="text-sm">
					{data.environment}
				</Badge>
			</div>
		</Card.Header>

		<Card.Content class="space-y-6">
			<!-- Trigger Button -->
			<form
				method="POST"
				action="?/sync"
				use:enhance={() => {
					isRunning = true;
					return async ({ update }) => {
						await update();
						isRunning = false;
					};
				}}
			>
				<Button type="submit" size="lg" disabled={isRunning} class="w-full sm:w-auto">
					{#if isRunning}
						<Loader2 class="mr-2 h-5 w-5 animate-spin" />
						Running Sync...
					{:else}
						<Play class="mr-2 h-5 w-5" />
						Trigger Cron Sync
					{/if}
				</Button>
			</form>

			<!-- Results -->
			{#if form}
				{#if form.success && form.summary}
					<Alert.Root>
						<CheckCircle class="h-4 w-4" />
						<Alert.Title>Sync Completed Successfully</Alert.Title>
						<Alert.Description>
							Completed at {new Date(form.timestamp).toLocaleString()}
						</Alert.Description>
					</Alert.Root>

					<!-- Summary Stats -->
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
						<Card.Root class="p-4">
							<div class="flex items-center gap-2">
								<Users class="h-4 w-4 text-muted-foreground" />
								<span class="text-sm text-muted-foreground">Total Users</span>
							</div>
							<p class="mt-1 text-2xl font-bold">{form.summary.totalUsersInDb}</p>
						</Card.Root>

						<Card.Root class="p-4">
							<div class="flex items-center gap-2">
								<RefreshCw class="h-4 w-4 text-muted-foreground" />
								<span class="text-sm text-muted-foreground">Synced</span>
							</div>
							<p class="mt-1 text-2xl font-bold">{form.summary.syncedCount}</p>
						</Card.Root>

						<Card.Root class="p-4">
							<div class="flex items-center gap-2">
								<CheckCircle class="h-4 w-4 text-green-500" />
								<span class="text-sm text-muted-foreground">Success</span>
							</div>
							<p class="mt-1 text-2xl font-bold text-green-600">{form.summary.successCount}</p>
						</Card.Root>

						<Card.Root class="p-4">
							<div class="flex items-center gap-2">
								<Clock class="h-4 w-4 text-muted-foreground" />
								<span class="text-sm text-muted-foreground">Duration</span>
							</div>
							<p class="mt-1 text-2xl font-bold">
								{(form.summary.durationMs / 1000).toFixed(1)}s
							</p>
						</Card.Root>
					</div>

					<!-- Per-user Results Table -->
					{#if form.summary.results && form.summary.results.length > 0}
						<div class="rounded-lg border">
							<Table.Root>
								<Table.Header>
									<Table.Row>
										<Table.Head>User</Table.Head>
										<Table.Head>Status</Table.Head>
										<Table.Head class="text-right">Contributions Updated</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each form.summary.results as result (result.username)}
										<Table.Row>
											<Table.Cell class="font-medium">{result.username}</Table.Cell>
											<Table.Cell>
												{#if result.success}
													<Badge variant="outline" class="bg-green-50 text-green-700">
														<CheckCircle class="mr-1 h-3 w-3" />
														Success
													</Badge>
												{:else}
													<Badge variant="destructive">
														<XCircle class="mr-1 h-3 w-3" />
														Failed
													</Badge>
													{#if result.error}
														<span class="ml-2 text-xs text-muted-foreground">{result.error}</span>
													{/if}
												{/if}
											</Table.Cell>
											<Table.Cell class="text-right">
												{result.contributionsUpdated ?? '-'}
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</div>
					{:else}
						<p class="text-center text-muted-foreground">No users to sync</p>
					{/if}
				{:else if form.error}
					<Alert.Root variant="destructive">
						<XCircle class="h-4 w-4" />
						<Alert.Title>Sync Failed</Alert.Title>
						<Alert.Description>{form.error}</Alert.Description>
					</Alert.Root>
				{/if}
			{/if}

			<!-- Info Box -->
			<Alert.Root>
				<Alert.Title>How this works</Alert.Title>
				<Alert.Description>
					<ul class="mt-2 list-inside list-disc space-y-1 text-sm">
						<li>This triggers the same sync function used by the Cloudflare cron job</li>
						<li>Syncs up to {250} users per run (batch size limit)</li>
						<li>Users are synced oldest-first based on last update time</li>
						<li>Only updates contributions from the last 7 days</li>
						<li>Invalidates leaderboard and stats caches after completion</li>
					</ul>
				</Alert.Description>
			</Alert.Root>
		</Card.Content>

		<Card.Footer class="justify-center">
			<a
				href={resolve('/')}
				class="text-sm text-muted-foreground hover:text-primary hover:underline"
			>
				&larr; Back to Leaderboard
			</a>
		</Card.Footer>
	</Card.Root>
</div>
