<script lang="ts">
  /**
   * <EnTetePage titre="Films" surtitre="Vendredi 13 novembre" description="…" taille="titre1">{#snippet actions()}<Bouton>…</Bouton>{/snippet}</EnTetePage>
   * Titre de page en Instrument Serif (`titre1` 56 px, `affiche` 72 px, `titre2` 36 px) dans un <h1>, `surtitre` en `--doux`
   * au-dessus, `description` dessous, `actions` (boutons) à droite sur ordinateur, dessous sur téléphone.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    titre: string;
    surtitre?: string;
    description?: string;
    taille?: 'affiche' | 'titre1' | 'titre2';
    actions?: Snippet;
  }
  let { titre, surtitre, description, taille = 'titre1', actions }: Props = $props();
</script>

<header class="tete">
  <div class="textes">
    {#if surtitre}<p class="surtitre">{surtitre}</p>{/if}
    <h1 class="t-{taille}">{titre}</h1>
    {#if description}<p class="description">{description}</p>{/if}
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  .tete { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--e-5); flex-wrap: wrap; }
  .textes { display: grid; gap: var(--e-2); min-width: 0; max-width: 60rem; }
  .surtitre { color: var(--doux); font-size: 16px; }
  h1 { text-wrap: balance; }
  .description { color: var(--doux); max-width: 65ch; }
  .actions { display: flex; gap: var(--e-3); flex-wrap: wrap; }
</style>
