<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Kbd from './kbd.svelte';
	import type { ContributionDayData, UserProfile } from '$lib/types';

	interface Props {
		profile: UserProfile;
		dailyContributions: ContributionDayData[];
	}

	let { profile, dailyContributions }: Props = $props();

	type Status = 'idle' | 'busy' | 'success' | 'error';

	let dialog: HTMLDialogElement | null = $state(null);
	let canvas: HTMLCanvasElement | null = $state(null);
	let renderState: 'idle' | 'rendering' | 'ready' | 'error' = $state('idle');
	let downloadState: Status = $state('idle');
	let copyState: Status = $state('idle');
	let announcement = $state('');
	/* Restored on close so the dialog never strands the keyboard user. */
	let lastFocused: HTMLElement | null = null;
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	/*
	 * `navigator.share` with files is the only path that reaches a native share
	 * sheet, which is where a phone user actually posts. Resolved once on mount
	 * rather than per render — the answer cannot change mid-session.
	 */
	let canShareFiles = $state(false);

	const shareText = $derived(buildShareText());

	function buildShareText(): string {
		const year = profile.contributions.find((c) => c.period === 'year');
		const total = new Intl.NumberFormat('en-US').format(year?.contributions ?? 0);
		return year?.rank
			? `I'm ranked #${year.rank} on CommitRank with ${total} contributions this year.`
			: `${total} contributions this year on CommitRank.`;
	}

	function flash(set: (status: Status) => void, status: Status, message: string) {
		set(status);
		announcement = message;
		if (resetTimer) clearTimeout(resetTimer);
		resetTimer = setTimeout(() => {
			set('idle');
			announcement = '';
		}, 2500);
	}

	/*
	 * The renderer is pulled in on first open, never on page load. A profile
	 * visitor who does not share pays nothing for the card.
	 */
	async function render() {
		if (!canvas) return;
		renderState = 'rendering';
		try {
			const { drawShareCard, loadAvatar } = await import('$lib/share-card');
			const avatar = await loadAvatar(`/api/avatar/${profile.github_username}?size=160`);
			if (!canvas) return;
			drawShareCard(canvas, { profile, dailyContributions, avatar });
			renderState = 'ready';
			announcement = 'Share card ready';
		} catch {
			renderState = 'error';
			announcement = 'Could not render the share card';
		}
	}

	async function toBlob(): Promise<Blob | null> {
		if (!canvas || renderState !== 'ready') return null;
		const { canvasToBlob } = await import('$lib/share-card');
		return canvasToBlob(canvas);
	}

	async function filename(): Promise<string> {
		const { shareCardFilename } = await import('$lib/card-layout');
		return shareCardFilename(profile.github_username);
	}

	export function open() {
		lastFocused = document.activeElement as HTMLElement | null;
		dialog?.showModal();
		canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
		if (renderState === 'idle' || renderState === 'error') void render();
	}

	function close() {
		if (dialog?.open) dialog.close();
	}

	function handleClose() {
		lastFocused?.focus();
		lastFocused = null;
	}

	async function download() {
		downloadState = 'busy';
		try {
			const blob = await toBlob();
			if (!blob) throw new Error('not rendered');

			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = await filename();
			link.click();
			// Revoked on the next frame: revoking synchronously races the download
			// in Safari, which has not read the blob yet when click() returns.
			requestAnimationFrame(() => URL.revokeObjectURL(url));

			flash((s) => (downloadState = s), 'success', 'Image saved');
		} catch {
			flash((s) => (downloadState = s), 'error', 'Could not save the image');
		}
	}

	async function copyImage() {
		copyState = 'busy';
		try {
			const blobPromise = toBlob().then((blob) => {
				if (!blob) throw new Error('not rendered');
				return blob;
			});
			/*
			 * The ClipboardItem is constructed with the promise, synchronously
			 * inside the click handler: Safari revokes clipboard permission the
			 * moment the write is awaited out of the user gesture.
			 */
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
			flash((s) => (copyState = s), 'success', 'Image copied to clipboard');
		} catch {
			flash((s) => (copyState = s), 'error', 'Could not copy the image');
		}
	}

	async function shareImage() {
		try {
			const blob = await toBlob();
			if (!blob) return;

			const file = new File([blob], await filename(), { type: 'image/png' });
			if (!navigator.canShare?.({ files: [file] })) {
				flash((s) => (downloadState = s), 'error', 'Sharing images is not supported here');
				return;
			}
			await navigator.share({ files: [file], text: shareText });
		} catch {
			// An aborted share sheet is a normal outcome, not a failure worth reporting.
		}
	}

	$effect(() => {
		return () => {
			if (resetTimer) clearTimeout(resetTimer);
		};
	});
</script>

<!--
	A native <dialog> gives focus trapping and Esc for free, matching the command
	palette. The canvas is the preview: rendering it to an <img> would need a
	blob: or data: source, and this project's CSP img-src allows neither by
	default — the canvas element sidesteps the question entirely.
-->
<dialog
	bind:this={dialog}
	class="term-share m-0 w-[calc(100%-1.5rem)] max-w-3xl border border-border-control bg-popover p-0 text-foreground sm:w-full"
	aria-label="Share card"
	onclose={handleClose}
	onclick={(event) => {
		if (event.target === event.currentTarget) close();
	}}
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<span aria-hidden="true" class="text-primary">&gt;</span>
		<h2 class="text-sm font-medium">share card</h2>
		<span class="text-2xs text-subtle-foreground">1080 × 1080</span>
		<span class="ml-auto flex items-center gap-1.5">
			<Kbd key="Esc" />
			<Button variant="ghost" size="icon-sm" onclick={close} aria-label="Close share card">✕</Button
			>
		</span>
	</div>

	<div class="p-3">
		<!-- Hugs the card rather than the dialog, so the frame reads as the image's
		     own edge instead of a letterboxed container. -->
		<div class="relative mx-auto w-fit max-w-full border border-border bg-surface-sunken">
			<!--
				Reserves the card's exact ratio so opening the dialog does not reflow.
				<canvas> takes no ARIA role of its own, so the description lives in a
				visually-hidden sibling rather than on an element that cannot expose it.
			-->
			<canvas bind:this={canvas} class="block aspect-square w-[520px] max-w-full" aria-hidden="true"
			></canvas>
			<p class="sr-only">Share card for {profile.github_username}. {shareText}</p>

			{#if renderState !== 'ready'}
				<div
					class="absolute inset-0 flex items-center justify-center text-sm text-subtle-foreground"
				>
					{#if renderState === 'error'}
						<span class="text-destructive">Could not render the card.</span>
					{:else}
						<span>Rendering<span class="term-cursor ml-1 align-middle"></span></span>
					{/if}
				</div>
			{/if}
		</div>

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<Button size="sm" onclick={download} disabled={renderState !== 'ready'}>
				{downloadState === 'success'
					? '✓ Saved'
					: downloadState === 'error'
						? '✗ Failed'
						: '↓ Save PNG'}
			</Button>
			<Button variant="outline" size="sm" onclick={copyImage} disabled={renderState !== 'ready'}>
				{copyState === 'success' ? '✓ Copied' : copyState === 'error' ? '✗ Failed' : 'Copy Image'}
			</Button>
			{#if canShareFiles}
				<Button variant="outline" size="sm" onclick={shareImage} disabled={renderState !== 'ready'}>
					Share ↗
				</Button>
			{/if}
			<p class="ml-auto text-2xs text-subtle-foreground">
				Paste straight into a post, or save and attach.
			</p>
		</div>

		<span class="sr-only" aria-live="polite">{announcement}</span>
	</div>
</dialog>

<style>
	/* Centred, because a modal is not anchored to a trigger. */
	.term-share {
		position: fixed;
		top: 50%;
		left: 50%;
		translate: -50% -50%;
	}
</style>
