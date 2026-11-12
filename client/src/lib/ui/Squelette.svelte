<script lang="ts">
  /**
   * <Squelette forme="affiche" /> · <Squelette forme="ligne" largeur="70%" /> · <Squelette forme="rond" taille={36} />
   * Placeholder de même forme que le contenu (pas de roue pour un contenu qui a une forme). Dégradé qui glisse 1,6 s ;
   * statique en mouvement réduit. `forme="carte-affiche"` : affiche 2:3 + titre + détail (comme `AfficheFilm`).
   * Décoratif (`aria-hidden`) : annoncer le chargement par ailleurs (`aria-busy` sur le conteneur).
   */
  interface Props {
    forme?: 'affiche' | 'ligne' | 'rond' | 'bloc' | 'carte-affiche';
    largeur?: string;
    hauteur?: string;
    taille?: number;
  }
  let { forme = 'ligne', largeur, hauteur, taille = 36 }: Props = $props();
</script>

{#if forme === 'carte-affiche'}
  <div class="carte" aria-hidden="true">
    <span class="sq affiche"></span>
    <span class="sq ligne" style:width="70%"></span>
    <span class="sq detail" style:width="40%"></span>
  </div>
{:else}
  <span
    class="sq {forme}" aria-hidden="true"
    style:width={forme === 'rond' ? `${taille}px` : largeur}
    style:height={forme === 'rond' ? `${taille}px` : hauteur}
  ></span>
{/if}

<style>
  .sq {
    display: block; background: linear-gradient(100deg, var(--s2) 30%, var(--s3) 50%, var(--s2) 70%);
    background-size: 200% 100%; animation: glisse 1.6s linear infinite; border-radius: var(--r-s);
  }
  .affiche { aspect-ratio: 2 / 3; border-radius: var(--r-affiche); width: 100%; }
  .ligne { height: 14px; width: 100%; }
  .detail { height: 12px; }
  .rond { border-radius: 50%; }
  .bloc { width: 100%; height: 120px; border-radius: var(--r-m); }
  .carte { display: grid; gap: 10px; min-width: 0; }
  @keyframes glisse { to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .sq { animation: none; } }
</style>
