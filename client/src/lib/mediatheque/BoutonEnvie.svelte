<script lang="ts">
  /**
   * Bascule « J'ai envie de le voir » (phase 23). Bouton à bascule : `aria-pressed`, cœur plein quand c'est marqué.
   * - `filmId` : le film. `actif` : j'en ai envie. `nombre` : combien de personnes en ont envie (affiché si > 0).
   * - `surChangement(etat)` : appelé avec l'état rendu par le serveur.
   * - `compact` : version courte (accueil), sans le nombre.
   */
  import type { EtatEnvie } from '@canape/partage';
  import { ErreurApi } from '$lib/api/client.ts';
  import { Icone, toast } from '$lib/ui/index.ts';
  import { marquerEnvie, retirerEnvie } from './api.ts';

  interface Props { filmId: string; actif: boolean; nombre?: number; compact?: boolean; surChangement?: (e: EtatEnvie) => void }
  let { filmId, actif, nombre = 0, compact = false, surChangement }: Props = $props();
  let envoi = $state(false);

  async function basculer(): Promise<void> {
    if (envoi) return;
    envoi = true;
    try {
      const etat = actif ? await retirerEnvie(filmId) : await marquerEnvie(filmId);
      surChangement?.(etat);
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'Impossible de mettre à jour ton envie.');
    } finally {
      envoi = false;
    }
  }
</script>

<button
  type="button" class="envie" class:compact class:actif aria-pressed={actif} disabled={envoi} onclick={basculer} data-test="bouton-envie"
>
  <span class="coeur"><Icone nom="coeur" taille={compact ? 16 : 20} /></span>
  <span class="texte">{compact ? (actif ? 'Envie notée' : 'J’ai envie') : 'J’ai envie de le voir'}</span>
  {#if !compact && nombre > 0}<span class="nombre tn" aria-label="{nombre} {nombre > 1 ? 'personnes ont' : 'personne a'} envie de ce film">{nombre}</span>{/if}
</button>

<style>
  .envie {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: var(--r-m);
    background: var(--s2); border: 1px solid var(--bord-champ); color: var(--texte); font: 650 15px/20px var(--texte-police); cursor: pointer;
    transition: background var(--d-1) var(--ease), border-color var(--d-1) var(--ease), color var(--d-1) var(--ease), transform var(--d-1) var(--ease);
  }
  .envie:active:not(:disabled) { transform: scale(0.97); }
  .envie:disabled { opacity: 0.6; cursor: progress; }
  .envie:focus-visible { outline: 3px solid var(--lampe); outline-offset: 2px; }
  .coeur { display: inline-flex; }
  /* Marqué : fond teinté, bordure et cœur plein ; le texte reste lisible (jamais la couleur seule : texte + cœur plein) */
  .envie.actif { background: color-mix(in srgb, var(--lampe) 16%, var(--s1)); border-color: var(--lampe); }
  .envie.actif .coeur :global(svg) { fill: currentColor; color: var(--lampe); }
  .nombre {
    display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: var(--r-pill);
    background: var(--s3); color: var(--doux); font-size: 13px; font-weight: 700;
  }
  .compact { min-height: 36px; padding: 0 12px; font-size: 14px; border-radius: 10px; }
  @media (hover: hover) { .envie:hover:not(:disabled):not(.actif) { background: var(--s3); } }
</style>
