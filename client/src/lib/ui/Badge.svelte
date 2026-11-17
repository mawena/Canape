<script lang="ts">
  /**
   * <Badge ton="ok" icone="verifier">Prêt</Badge>
   * Puce de 28 px (texte 13 px). `ton` : `neutre` · `ok` · `alerte` · `mal` · `lampe` · `rose` (l'autre personne).
   * Toujours une icône ou un texte explicite : jamais la couleur seule. `sur-image` : fond sombre opaque (sur une affiche).
   */
  import type { Snippet } from 'svelte';
  import Icone, { type NomIcone } from './Icone.svelte';

  interface Props {
    ton?: 'neutre' | 'ok' | 'alerte' | 'mal' | 'lampe' | 'rose';
    icone?: NomIcone;
    surImage?: boolean;
    children?: Snippet;
  }
  let { ton = 'neutre', icone, surImage = false, children }: Props = $props();
</script>

<span class="badge {ton}" class:sur-image={surImage} data-theme={surImage ? 'sombre' : undefined}>
  {#if icone}<Icone nom={icone} taille={14} />{/if}
  {@render children?.()}
</span>

<style>
  .badge {
    display: inline-flex; align-items: center; gap: 6px; min-height: 24px; padding: 0 8px; border-radius: 2px;
    background: var(--s2); color: var(--doux); font: 650 11.5px/1 var(--texte-police); letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap;
  }
  .ok { background: var(--ok-fond); color: var(--ok); }
  .alerte { background: var(--alerte-fond); color: var(--alerte); }
  .mal { background: var(--mal-fond); color: var(--mal); }
  .lampe { background: var(--lampe-fond); color: var(--lampe); }
  .rose { background: var(--rose-fond); color: var(--rose); }
  .sur-image { background: rgba(20, 18, 16, 0.86); }
</style>
