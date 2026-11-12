<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Toasts } from '$lib/ui/index.ts';
  import '$lib/ui/jetons.css';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<Toasts />
