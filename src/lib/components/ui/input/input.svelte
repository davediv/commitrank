<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';
	import type { WithElementRef } from '$lib/utils.js';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	> & {
		/** Prompt glyph rendered before the value, e.g. `>` or `$`. */
		prompt?: string;
	};

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		prompt,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();

	/*
	 * The spec asks for a border on focus only, but an unbordered field is
	 * identified purely by its fill — #08080A against #0C0C0D is 1.06:1, well
	 * under WCAG 1.4.11's 3:1 for control boundaries. So the box is always
	 * drawn, in --border-control (3.24:1), and focus turns it phosphor.
	 */
	const FIELD =
		'h-8 w-full min-w-0 rounded-md border border-input bg-surface-sunken text-sm text-foreground term-transition selection:bg-primary selection:text-primary-foreground placeholder:text-subtle-foreground focus-visible:border-primary disabled:cursor-not-allowed disabled:border-border disabled:text-disabled aria-invalid:border-destructive';
</script>

<div class="relative flex w-full items-center {className || ''}">
	{#if prompt}
		<span
			aria-hidden="true"
			class="pointer-events-none absolute left-2 text-sm leading-none text-primary select-none"
		>
			{prompt}
		</span>
	{/if}
	{#if type === 'file'}
		<input
			bind:this={ref}
			data-slot={dataSlot}
			class="{FIELD} py-1 pr-2 {prompt
				? 'pl-6'
				: 'pl-2'} file:mr-2 file:border-0 file:bg-transparent file:text-sm file:text-primary"
			type="file"
			bind:files
			bind:value
			{...restProps}
		/>
	{:else}
		<input
			bind:this={ref}
			data-slot={dataSlot}
			class="{FIELD} py-1 pr-2 {prompt ? 'pl-6' : 'pl-2'}"
			{type}
			bind:value
			{...restProps}
		/>
	{/if}
</div>
