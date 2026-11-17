<script lang="ts">
  /**
   * <EtatVide icone="film" titre="Rien à l'affiche pour l'instant." texte="…">{#snippet actions()}<Bouton>…</Bouton>{/snippet}</EtatVide>
   * Bloc centré : icône lampe, titre en Instrument Serif, une phrase, un seul bouton primaire.
   * Fond `--s1`, contour pointillé 1,5 px, rayon 22.
   */
  import type { Snippet } from 'svelte';
  import Icone, { type NomIcone } from './Icone.svelte';

  interface Props {
    titre: string;
    texte?: string;
    icone?: NomIcone;
    actions?: Snippet;
  }
  let { titre, texte, icone = 'film', actions }: Props = $props();
</script>

<div class="vide">
  <span class="icone-vide"><Icone nom={icone} taille={24} /></span>
  <h3>{titre}</h3>
  {#if texte}<p>{texte}</p>{/if}
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
  .vide {
    display: grid; justify-items: center; gap: 10px; text-align: center; padding: var(--e-7) var(--e-5);
  }
  .icone-vide {
    display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 2px; color: var(--lampe);
  }
  h3 { font: 400 1.75rem / 1.1 var(--titre); letter-spacing: -0.005em; color: var(--texte); text-wrap: balance; }
  p { max-width: 40ch; color: var(--doux); }
  .actions { display: flex; gap: var(--e-3); flex-wrap: wrap; justify-content: center; margin-top: var(--e-2); }
</style>
