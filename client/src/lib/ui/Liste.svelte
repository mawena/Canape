<script lang="ts">
  /**
   * <Liste libelle="Séances vues"><LigneListe href="/…" titre="…" detail="…">{#snippet debut()}…{/snippet}{#snippet fin()}…{/snippet}</LigneListe></Liste>
   * Conteneur de lignes (`<ul>`), fond `--s1`, contour `--bord`, rayon 22, séparateurs `--bord`.
   */
  import type { Snippet } from 'svelte';
  interface Props { libelle?: string; children?: Snippet }
  let { libelle, children }: Props = $props();
</script>

<ul class="liste" aria-label={libelle}>{@render children?.()}</ul>

<style>
  .liste { list-style: none; margin: 0; padding: 0; background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-l); overflow: hidden; box-shadow: inset 0 1px 0 var(--reflet); }
  .liste > :global(li + li) { border-top: 1px solid var(--bord); }
</style>
