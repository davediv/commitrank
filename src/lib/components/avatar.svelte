<script lang="ts">
	interface Props {
		src: string;
		srcset?: string;
		sizes?: string;
		alt: string;
		initials: string;
		width: number;
		height: number;
		class?: string;
		fallbackClass?: string;
		loading?: 'eager' | 'lazy';
		decoding?: 'sync' | 'async' | 'auto';
		fetchpriority?: 'high' | 'low' | 'auto';
	}

	let {
		src,
		srcset,
		sizes,
		alt,
		initials,
		width,
		height,
		class: className = '',
		fallbackClass = '',
		loading = 'lazy',
		decoding = 'async',
		fetchpriority = 'auto'
	}: Props = $props();

	function hideBrokenImage(event: Event) {
		(event.currentTarget as HTMLImageElement).hidden = true;
	}
</script>

<span
	class="relative flex shrink-0 overflow-hidden rounded-full bg-muted {className}"
	style="width: {width}px; height: {height}px"
>
	<span
		aria-hidden="true"
		class="absolute inset-0 flex items-center justify-center rounded-full bg-muted {fallbackClass}"
	>
		{initials}
	</span>
	<img
		{src}
		{srcset}
		{sizes}
		{alt}
		{width}
		{height}
		{loading}
		{decoding}
		{fetchpriority}
		onerror={hideBrokenImage}
		class="absolute inset-0 aspect-square size-full object-cover"
	/>
</span>
