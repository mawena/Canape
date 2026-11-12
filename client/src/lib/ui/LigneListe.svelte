<script lang="ts">
  /**
   * <LigneListe titre="Les Heures bleues" detail="vu avec Léa" href="/galerie/…" mise-en-avant>
   *   {#snippet debut()}<mini-affiche/>{/snippet}  {#snippet fin()}<Bouton>Revoir</Bouton>{/snippet}  contenu libre…
   * </LigneListe>
   * Ligne de liste (à mettre dans `<Liste>`). `titre` (Figtree 600) + `detail` (`--discret`). `debut` : vignette, avatar…
   * `fin` : actions. `href` : toute la ligne est un lien (les actions de `fin` restent des boutons à part : ne pas en
   * mettre quand `href` est renseigné ; utiliser `fin` pour de simples indications). `miseEnAvant` : filet lampe à gauche.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    titre: string;
    detail?: string;
    href?: string;
    miseEnAvant?: boolean;
    debut?: Snippet;
    fin?: Snippet;
    children?: Snippet;
  }
  let { titre, detail, href, miseEnAvant = false, debut, fin, children }: Props = $props();
</script>

<li class="ligne" class:mise={miseEnAvant}>
  {#if href}<a class="etendu" {href} aria-label={titre}></a>{/if}
  {#if debut}<div class="debut">{@render debut()}</div>{/if}
  <div class="corps">
    <p class="titre">{titre}</p>
    {#if detail}<p class="detail">{detail}</p>{/if}
    {@render children?.()}
  </div>
  {#if fin}<div class="fin">{@render fin()}</div>{/if}
</li>

<style>
  .ligne { position: relative; display: flex; align-items: center; gap: var(--e-4); padding: var(--e-4) var(--e-5); min-height: 72px; transition: background var(--d-1) var(--ease); }
  .mise { box-shadow: inset 3px 0 0 var(--lampe); }
  .etendu { position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
  .etendu:focus-visible { outline-offset: -3px; }
  @media (hover: hover) { .ligne:has(.etendu):hover { background: var(--s2); } }
  .debut { flex: none; display: flex; align-items: center; }
  .corps { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .titre { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { color: var(--discret); font-size: 14px; line-height: 20px; }
  .fin { flex: none; display: flex; align-items: center; gap: var(--e-3); position: relative; z-index: 2; color: var(--doux); font-size: 14px; }
</style>
