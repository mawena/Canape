<script lang="ts">
  /**
   * <MiniAffiche film={film} largeur={48} />  ou  <MiniAffiche titre="…" imageSrc="…" />
   * Vignette d'affiche 2:3 pour les lignes de liste (historique, séances). Sans image : dégradé dérivé du titre + initiale en
   * Instrument Serif. Décorative (`alt=""`) : le titre est écrit à côté.
   */
  import { teinteTitre } from './format.ts';

  interface Props {
    film?: { id: string; titre: string; aAffiche?: boolean };
    titre?: string;
    imageSrc?: string | null;
    largeur?: number;
  }
  let { film, titre, imageSrc, largeur = 48 }: Props = $props();
  const t = $derived(titre ?? film?.titre ?? '');
  const src = $derived(imageSrc !== undefined ? imageSrc : film?.aAffiche ? `/api/films/${film.id}/affiche` : null);
  let enErreur = $state(false);
  const teinte = $derived(teinteTitre(t));
</script>

<span class="mini" style:--l="{largeur}px" style:--h1="hsl({teinte} 38% 30%)" style:--h2="hsl({teinte} 38% 12%)" aria-hidden="true">
  {#if src && !enErreur}
    <img {src} alt="" loading="lazy" decoding="async" onerror={() => (enErreur = true)} />
  {:else}
    <span class="init">{(t.trim()[0] ?? '?').toUpperCase()}</span>
  {/if}
</span>

<style>
  .mini {
    display: inline-grid; place-items: center; flex: none; width: var(--l); aspect-ratio: 2 / 3; border-radius: 6px; overflow: hidden;
    background: linear-gradient(160deg, var(--h1), var(--h2)); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .init { font: 400 calc(var(--l) * 0.5) / 1 var(--titre); color: #fff; }
</style>
