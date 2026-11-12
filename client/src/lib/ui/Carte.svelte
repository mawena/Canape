<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    titre?: string;
    /** Bordure dorée (carte mise en avant). */
    doree?: boolean;
    children?: Snippet;
    pied?: Snippet;
  }
  let { titre, doree = false, children, pied, class: classe = '', ...reste }: Props = $props();
</script>

<section class="carte {classe}" class:doree {...reste}>
  {#if titre}<h2>{titre}</h2>{/if}
  {@render children?.()}
  {#if pied}<footer>{@render pied()}</footer>{/if}
</section>

<style>
  .carte {
    background: rgba(23, 16, 15, 0.88); border: 1px solid var(--bordure); border-radius: var(--rayon-l);
    padding: var(--espace-5); display: grid; gap: var(--espace-4); box-shadow: var(--ombre);
  }
  .doree { border-color: rgba(233, 184, 114, 0.35); }
  h2 { font-size: 1.3rem; }
  footer { display: flex; gap: var(--espace-3); justify-content: flex-end; flex-wrap: wrap; }
</style>
