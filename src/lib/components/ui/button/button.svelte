<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';

	export type ButtonVariant =
		| 'default'
		| 'destructive'
		| 'outline'
		| 'secondary'
		| 'ghost'
		| 'link';
	export type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';

	/*
	 * A bordered rectangle with a mono label — never a pill, never a shadow.
	 * Press inverts instantly (transition-duration 0 on :active, which fires on
	 * pointer-down); release fades back over 80ms. That inversion is this
	 * style's equivalent of a scale-down press: a flat 1px box shimmers when
	 * scaled, and a terminal key inverts.
	 */
	const BASE =
		'group/btn inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-sm font-medium term-transition disabled:pointer-events-none disabled:border-border disabled:text-disabled aria-disabled:pointer-events-none aria-disabled:border-border aria-disabled:text-disabled aria-invalid:border-destructive aria-invalid:text-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3.5';

	const VARIANTS: Record<ButtonVariant, string> = {
		default:
			'border-primary bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary active:text-primary-foreground',
		destructive:
			'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive active:text-background',
		outline:
			'border-border-control bg-transparent text-foreground hover:border-primary hover:text-primary active:bg-primary active:text-primary-foreground',
		secondary: 'border-border bg-card text-foreground hover:border-border-control active:bg-accent',
		ghost:
			'border-transparent bg-transparent text-muted-foreground hover:text-foreground active:bg-accent',
		link: 'border-transparent bg-transparent text-primary underline-offset-4 hover:underline active:opacity-70'
	};

	/* Tight — 24/28/32/36px. Terminal UIs run small. */
	const SIZES: Record<ButtonSize, string> = {
		xs: 'h-6 gap-1 px-2 text-2xs',
		sm: 'h-7 px-2.5 text-xs',
		default: 'h-8 px-3',
		lg: 'h-9 px-4',
		icon: 'size-8',
		'icon-sm': 'size-7',
		'icon-lg': 'size-9'
	};

	export function buttonVariants(
		options: {
			variant?: ButtonVariant;
			size?: ButtonSize;
			class?: ClassValue;
		} = {}
	): string {
		return cn(
			BASE,
			VARIANTS[options.variant ?? 'default'],
			SIZES[options.size ?? 'default'],
			options.class
		);
	}

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			/** Keyboard hint rendered on the right, e.g. `↵` or `⌘K`. */
			kbd?: string;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		kbd,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#snippet label()}
	{@render children?.()}
	{#if kbd}
		<span
			aria-hidden="true"
			class="ml-1 border border-current px-1 text-2xs leading-none opacity-60"
		>
			{kbd}
		</span>
	{/if}
{/snippet}

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={buttonVariants({ variant, size, class: className })}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render label()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={buttonVariants({ variant, size, class: className })}
		{type}
		{disabled}
		{...restProps}
	>
		{@render label()}
	</button>
{/if}
