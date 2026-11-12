<script lang="ts">
  // Tout ce qui se pose sur le film : compte à rebours, attente mutuelle, lecture bloquée, reprise, fin, erreurs.
  import { Bouton } from '$lib/ui/index.ts';
  import { formaterDuree } from './synchro.ts';
  import type { Salle } from './salle.svelte.ts';

  let { salle, surQuitter, surChoisir }: { salle: Salle; surQuitter: () => void; surChoisir: () => void } = $props();

  const regarde = $derived(formaterDuree(salle.secondesRegardees || salle.temps));
</script>

{#if salle.compte !== null}
  <div class="voile compte" data-test="compte-a-rebours">
    <p class="auteur">{salle.compteAuteur ?? 'Le compte à rebours est lancé.'}</p>
    <p class="chiffre" aria-live="assertive" role="status">{salle.compte}</p>
    <Bouton variante="secondaire" onclick={() => salle.annulerCompteARebours()}>Annuler</Bouton>
  </div>
{:else if salle.etat?.filmId && (salle.etat.attente.length || salle.chargement) && !salle.fini}
  <div class="voile attente" role="status" data-test="attente">
    <span class="anneau" aria-hidden="true"></span>
    {#if salle.jeSuisEnAttente || (!salle.etat.attente.length && salle.chargement)}
      <p class="grand">Ton film charge…</p>
      <p class="petit">Ça reprend dès que tout le monde est prêt.</p>
    {:else}
      <p class="grand">{salle.phraseAttente}</p>
      <p class="petit">Son film charge encore. Ça reprend dès qu’il est prêt.</p>
      {#each salle.enAttente.filter((p) => !p.soi) as p (p.cid)}
        <Bouton variante="secondaire" taille="s" onclick={() => salle.ignorerAttente(p.cid)} data-test="ne-plus-attendre">Ne plus attendre {p.utilisateur.prenom}</Bouton>
      {/each}
    {/if}
  </div>
{/if}

{#if salle.erreurPlan}
  <div class="voile erreur" role="alert" data-test="erreur-lecture">
    <p class="grand">Le film ne démarre pas.</p>
    <p class="petit">{salle.erreurPlan}</p>
  </div>
{/if}

{#if !salle.etat?.filmId && salle.etat}
  <div class="voile" data-test="sans-film">
    <p class="grand">Aucun film dans cette séance.</p>
    <Bouton onclick={surChoisir}>Choisir un film</Bouton>
  </div>
{/if}

{#if salle.reprise && salle.compte === null && !salle.fini}
  <div class="voile carte" data-test="reprise">
    <h2>Reprendre ici ?</h2>
    <p>Tu t’étais arrêté·e à {formaterDuree(salle.reprise.position)}{salle.reprise.avec.length ? ` avec ${salle.reprise.avec.join(', ')}` : ''}.</p>
    <div class="actions">
      <Bouton onclick={() => { salle.reprise = null; }} data-test="reprendre-position">Reprendre à {formaterDuree(salle.reprise.position)}</Bouton>
      <Bouton variante="secondaire" onclick={() => salle.depuisLeDebut()} data-test="depuis-le-debut">Depuis le début</Bouton>
    </div>
  </div>
{/if}

{#if salle.bloque}
  <div class="voile carte" data-test="lecture-bloquee">
    <h2>La lecture attend ton geste</h2>
    <p>Ton navigateur demande un clic avant de lancer le film.</p>
    <Bouton onclick={() => salle.reprendreIci()} data-test="reprendre-ici">Reprendre ici</Bouton>
  </div>
{/if}

{#if salle.fini}
  <div class="voile fin" data-test="fin-seance">
    <h2>C’était bien.</h2>
    <p class="grand">{regarde} passées ensemble.</p>
    <p class="petit">{salle.tallyReactions} réaction{salle.tallyReactions > 1 ? 's' : ''} échangée{salle.tallyReactions > 1 ? 's' : ''}.</p>
    <div class="actions">
      <Bouton onclick={surChoisir}>Choisir le prochain</Bouton>
      <Bouton variante="secondaire" href="/historique">Voir l’historique</Bouton>
      <Bouton variante="discret" onclick={() => { salle.fini = false; }}>Rester ici</Bouton>
      <Bouton variante="discret" onclick={surQuitter} data-test="quitter-fin">Quitter</Bouton>
    </div>
  </div>
{/if}

<style>
  .voile { position: absolute; inset: 0; z-index: 4; display: grid; place-content: center; justify-items: center; gap: 10px; text-align: center; padding: 24px; background: rgba(13, 12, 18, 0.55); color: #fff; }
  .voile.carte { inset: auto; left: 50%; top: 50%; transform: translate(-50%, -50%); background: var(--fond-verre); backdrop-filter: var(--flou-verre); -webkit-backdrop-filter: var(--flou-verre); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--r-xl, 28px); padding: 28px 32px; z-index: 7; box-shadow: var(--ombre-4); max-width: min(440px, 90vw); }
  .voile.compte { background: rgba(6, 5, 10, 0.4); backdrop-filter: blur(2px); z-index: 7; }
  .voile.fin { background: rgba(13, 12, 18, 0.88); z-index: 8; }
  h2, .grand { font: 700 1.5rem / 1.25 var(--texte-police); letter-spacing: -0.02em; margin: 0; }
  .voile.fin h2 { font: 400 3.5rem / 1 var(--titre); }
  .chiffre { font: 400 104px/1 var(--titre); margin: 0; animation: fondu 200ms; }
  .auteur, .petit { margin: 0; color: var(--doux, #c0bacb); }
  p { margin: 0; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
  .anneau { width: 56px; height: 56px; border-radius: 50%; border: 4px solid rgba(255, 255, 255, 0.15); border-top-color: var(--lampe, #ffb347); animation: tour 1.1s linear infinite; }
  .voile.attente { pointer-events: none; }
  .voile.attente :global(button) { pointer-events: auto; }
  @keyframes tour { to { transform: rotate(360deg); } }
  @keyframes fondu { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .anneau, .chiffre { animation: none; } }
</style>
