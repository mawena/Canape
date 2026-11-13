<script lang="ts">
  // Écran de fin : « C'était bien. », le temps passé ensemble, qui était là, la note d'un mot de chacun.
  // Il s'ouvre à la fin du film (ou quand l'hôte termine la séance), se ferme d'un geste et ne revient pas tout seul.
  import { Avatar, Bouton } from '$lib/ui/index.ts';
  import SelecteurNote from './SelecteurNote.svelte';
  import { emojiNote, libelleNote, maNote, phraseTemps, presents } from './souvenir.ts';
  import type { Salle } from './salle.svelte.ts';

  let { salle, surQuitter }: { salle: Salle; surQuitter: () => void } = $props();

  const moiId = $derived(salle.moi?.utilisateur.id ?? null);
  const s = $derived(salle.souvenir);
  const personnes = $derived(s ? presents(s) : []);
</script>

<div class="voile fin" role="dialog" aria-modal="false" aria-labelledby="titre-fin" data-test="fin-seance">
  <div class="contenu">
    <h2 id="titre-fin">C’était bien.</h2>
    <p class="temps" data-test="temps-ensemble" aria-live="polite">{s ? phraseTemps(s) : ' '}</p>

    {#if personnes.length > 1}
      <ul class="presents" aria-label="Qui était là">
        {#each personnes as p (p.utilisateur.id)}
          <li data-test="present-fin" data-note={p.note ?? ''}>
            <span class="rond">
              <Avatar prenom={p.utilisateur.prenom} couleur={p.utilisateur.couleur} taille={56} decoratif />
              {#if p.note && p.utilisateur.id !== moiId}
                <span class="pastille" data-test="note-autre" role="img" aria-label="{p.utilisateur.prenom} : {libelleNote(p.note)}">{emojiNote(p.note)}</span>
              {/if}
            </span>
            <span class="prenom">{p.utilisateur.id === moiId ? 'Toi' : p.utilisateur.prenom}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="note-bloc">
      <p class="invite" id="invite-note">Un mot sur ce film ?</p>
      <SelecteurNote note={s ? maNote(s, moiId) : null} surChoisir={(n) => void salle.noter(n)} libelle="Ta note" />
    </div>

    <div class="actions">
      <Bouton variante="secondaire" onclick={() => salle.fermerFin()} data-test="revoir-fin">Revoir la fin</Bouton>
      <Bouton onclick={surQuitter} data-test="quitter-fin">Quitter la salle</Bouton>
    </div>
  </div>
</div>

<style>
  .voile { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 24px; overflow-y: auto; background: rgba(8, 11, 20, 0.94); color: #fff; text-align: center; }
  .contenu { display: grid; justify-items: center; gap: var(--e-5); max-width: 560px; animation: apparition var(--d-3) var(--ease); }
  h2 { margin: 0; font: 400 clamp(2.6rem, 8vw, 4rem) / 1 var(--titre); letter-spacing: -0.01em; }
  .temps { margin: 0; min-height: 1.5em; font: 500 1.25rem / 1.3 var(--texte-police); color: var(--doux, #c0bacb); }
  .presents { list-style: none; margin: 0; padding: 0; display: flex; gap: var(--e-5); flex-wrap: wrap; justify-content: center; }
  .presents li { display: grid; justify-items: center; gap: 6px; }
  .rond { position: relative; display: inline-flex; }
  .pastille { position: absolute; right: -10px; top: -8px; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--s2); border: 2px solid var(--fond); font-size: 16px; animation: pop var(--d-3) var(--ressort); }
  .prenom { font: 600 14px / 1 var(--texte-police); color: var(--doux, #c0bacb); }
  .note-bloc { display: grid; gap: var(--e-3); justify-items: center; }
  .invite { margin: 0; font: 600 15px / 1.2 var(--texte-police); color: var(--doux, #c0bacb); }
  .actions { display: flex; gap: var(--e-3); flex-wrap: wrap; justify-content: center; margin-top: var(--e-2); }
  @keyframes apparition { from { opacity: 0; transform: translateY(8px); } }
  @keyframes pop { from { opacity: 0; transform: scale(0.4); } }
  @media (prefers-reduced-motion: reduce) { .contenu, .pastille { animation: none; } }
  @media (max-height: 560px) { .contenu { gap: var(--e-3); } h2 { font-size: 2.2rem; } }
</style>
