<script lang="ts">
	interface Props {
		/** The key or chord to display, e.g. `⌘K`, `/`, `Esc`. */
		key: string;
		class?: string;
	}

	let { key, class: className = '' }: Props = $props();
</script>

<kbd class="term-kbd {className}">{key}</kbd>
