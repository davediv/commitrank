<script lang="ts">
	interface Props {
		value: number;
		max: number;
		/** Describes what the meter measures, for assistive tech. */
		label: string;
		class?: string;
	}

	let { value, max, label, class: className = '' }: Props = $props();

	/*
	 * htop's meter: share of the leader. The sort order already says who is
	 * ahead — this says by how much. A floor of 1% keeps a non-zero value
	 * visible rather than rendering as an empty track.
	 */
	const percent = $derived(max > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0);
</script>

<span
	class="term-meter {className}"
	role="meter"
	aria-label={label}
	aria-valuenow={value}
	aria-valuemin={0}
	aria-valuemax={max}
>
	<span style="width: {percent}%"></span>
</span>
