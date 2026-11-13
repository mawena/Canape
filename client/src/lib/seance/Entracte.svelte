<script lang="ts">
  /**
   * Voile « Entracte » entre deux films d'une soirée, posé sur l'image (dans `.scene`) : les caméras, le chat, les réactions
   * et la barre de commandes restent utilisables autour. L'affiche du film suivant éclaire la pièce de sa couleur ; le
   * minuteur vient de l'heure de fin donnée par le serveur (le même temps chez tout le monde). L'hôte peut lancer tout de
   * suite ou rallonger de 5 minutes.
   * `data-test` : `entracte`, `entracte-film`, `entracte-temps` (attribut `data-secondes`), `entracte-lancer`, `entracte-prolonger`.
   */
  import { Bouton, MiniAffiche, couleurDuTitre, couleurValide } from '$lib/ui/index.ts';
  import { formaterMinuteur, phraseEntracte } from './programme.ts';
  import type { Salle } from './salle.svelte.ts';

  let { salle }: { salle: Salle } = $props();

  const suivant = $derived(salle.suivant);
  const restant = $derived(salle.entracteRestant ?? 0);
  const lueur = $derived(suivant ? (couleurValide(suivant.couleur) ?? couleurDuTitre(suivant.titre)) : null);
  const affiche = $derived(suivant?.aAffiche ? `/api/films/${encodeURIComponent(suivant.filmId)}/affiche?v=${suivant.versionImages}` : null);
  // Une phrase par minute pour les lecteurs d'écran (le minuteur visible, lui, change chaque seconde sans être lu).
  const phrase = $derived(phraseEntracte(restant >= 60 ? Math.ceil(restant / 60) * 60 : restant > 0 ? 59 : 0));
  const hote = $derived(salle.seance?.hotePrenom ?? 'L’hôte');
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="entracte" style:--lueur={lueur} aria-labelledby="titre-entracte" data-test="entracte"
  ondblclick={(e) => e.stopPropagation()}>
  <div class="halo" aria-hidden="true"></div>
  <div class="carte">
    {#if suivant}
      <div class="affiche"><MiniAffiche titre={suivant.titre} imageSrc={affiche} largeur={148} /></div>
    {/if}
    <div class="texte">
      <h2 id="titre-entracte">Entracte</h2>
      {#if suivant}
        <p class="ensuite">Ensuite <span class="titre-film" data-test="entracte-film">{suivant.titre}</span>{#if suivant.annee}<span class="annee">{suivant.annee}</span>{/if}</p>
      {/if}
      <p class="minuteur tn" role="timer" aria-label="Temps avant le film suivant : {formaterMinuteur(restant)}" data-test="entracte-temps" data-secondes={restant}>{formaterMinuteur(restant)}</p>
      <p class="lu" aria-live="polite">{phrase}</p>
      {#if salle.estHote}
        <div class="actions">
          <Bouton icone="lecture" onclick={() => salle.lancerFilmSuivant()} disabled={salle.liaison !== 'ouvert'} data-test="entracte-lancer">Lancer maintenant</Bouton>
          <Bouton variante="secondaire" onclick={() => salle.prolongerEntracte()} disabled={salle.liaison !== 'ouvert'}
            aria-label="Rallonger l’entracte de 5 minutes" data-test="entracte-prolonger">+5 min</Bouton>
        </div>
      {:else}
        <p class="note">Le film démarre tout seul. {hote} peut le lancer plus tôt.</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .entracte {
    position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 88px 24px 150px; overflow: hidden;
    background: rgba(8, 11, 20, 0.9); color: #fff; cursor: default; user-select: text;
  }
  /* La couleur du film suivant éclaire la pièce, du côté de son affiche ; aucun texte n'est posé sur elle sans fond. */
  .halo {
    position: absolute; inset: -20%; pointer-events: none; opacity: 0.55;
    background: radial-gradient(38% 46% at 38% 50%, var(--lueur, #1f5ce0), transparent 70%); filter: blur(48px);
    animation: allume 900ms var(--ease, ease-out);
  }
  .carte { position: relative; display: flex; align-items: center; gap: clamp(20px, 4vw, 44px); max-width: 720px; }
  .affiche { flex: none; filter: drop-shadow(0 18px 40px rgba(0, 0, 0, 0.55)); }
  .affiche :global(.mini) { border-radius: 10px; }
  .texte { display: grid; gap: 6px; min-width: 0; text-align: left; }
  h2 { margin: 0; font: 600 0.95rem / 1.2 var(--texte-police); color: var(--doux, #c0bacb); letter-spacing: 0.01em; }
  .ensuite { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; font: 500 1rem / 1.3 var(--texte-police); color: var(--doux, #c0bacb); }
  .titre-film { font: 400 clamp(1.75rem, 3.4vw, 2.5rem) / 1.05 var(--titre); color: #fff; letter-spacing: -0.005em; overflow-wrap: anywhere; }
  .annee { font-size: 0.95rem; color: var(--discret, #9f99ad); }
  .minuteur { margin: 6px 0 4px; font: 400 clamp(4.25rem, 9vw, 6.5rem) / 0.9 var(--titre); letter-spacing: 0.01em; font-variant-numeric: tabular-nums; }
  .lu { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
  .note { margin: 6px 0 0; color: var(--doux, #c0bacb); font-size: 0.95rem; max-width: 38ch; }
  @keyframes allume { from { opacity: 0; } }

  /* Téléphone en portrait : l'image est petite, l'entracte se range en une colonne compacte. */
  :global(.portrait) .entracte { padding: 16px; }
  :global(.portrait) .carte { gap: 16px; align-items: flex-start; }
  :global(.portrait) .affiche :global(.mini) { width: 92px; }
  :global(.portrait) .minuteur { font-size: 3.75rem; }
  :global(.portrait) .titre-film { font-size: 1.5rem; }
  :global(.portrait) .actions :global(.bouton) { flex: 1 1 auto; }
  /* Téléphone en paysage : peu de hauteur, l'affiche reste petite. */
  :global(.paysage) .entracte { padding: 48px 24px 84px; }
  :global(.paysage) .affiche :global(.mini) { width: 96px; }
  :global(.paysage) .minuteur { font-size: 3.5rem; }
  @media (prefers-reduced-motion: reduce) { .halo { animation: none; } }
</style>
