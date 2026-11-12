<script lang="ts">
  /**
   * <Carte titre="…" doree>contenu{#snippet pied()}boutons{/snippet}</Carte>
   * Surface `--s1`, contour `--bord`, rayon 22. `titre` : Figtree 700. `doree` : contour lampe (carte mise
   * en avant). `pied` : rangée d'actions alignée à droite. Reste : attributs d'une `<section>`.
   */
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    titre?: string;
    /** Contour lampe (carte mise en avant). */
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
    background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-l); box-shadow: inset 0 1px 0 var(--reflet);
    padding: var(--e-6); display: grid; gap: var(--e-4); min-width: 0;
  }
  .doree { border-color: var(--lampe); }
  h2 { font: 700 1.25rem / 1.2 var(--texte-police); letter-spacing: -0.02em; }
  footer { display: flex; gap: var(--e-3); justify-content: flex-end; flex-wrap: wrap; }
</style>
