<script lang="ts">
  /**
   * Les trois notes d'un mot : « Coup de cœur », « Bien », « Bof ». La note choisie est en évidence ;
   * la choisir une seconde fois l'efface (c'est `surChoisir` qui décide). `data-test` : `note-coeur`, `note-bien`, `note-bof`.
   */
  import type { NoteSeance } from '@canape/partage';
  import { NOTES } from './souvenir.ts';

  interface Props {
    note: NoteSeance | null;
    surChoisir: (n: NoteSeance) => void;
    libelle?: string;
    compact?: boolean;
  }
  let { note, surChoisir, libelle = 'Ta note', compact = false }: Props = $props();
</script>

<div class="notes" class:compact role="group" aria-label={libelle}>
  {#each NOTES as n (n.valeur)}
    <button type="button" class="note" class:choisie={note === n.valeur} aria-pressed={note === n.valeur}
      data-test={`note-${n.valeur}`} onclick={() => surChoisir(n.valeur)}>
      <span class="emoji" aria-hidden="true">{n.emoji}</span>
      <span class="mot">{n.libelle}</span>
    </button>
  {/each}
</div>

<style>
  .notes { display: flex; gap: var(--e-3); flex-wrap: wrap; justify-content: center; }
  .notes:not(.compact) { flex-wrap: nowrap; width: min(100%, 372px); }
  .notes:not(.compact) .note { flex: 1 1 0; min-width: 0; padding: 12px 6px; }
  .note {
    display: inline-flex; flex-direction: column; align-items: center; gap: 4px; min-width: 104px; padding: 12px 16px;
    border-radius: var(--r-l); border: 1.5px solid var(--bord-champ); background: transparent; color: var(--texte); cursor: pointer;
    font: 600 14px / 1.2 var(--texte-police);
    transition: transform var(--d-2) var(--ressort), background var(--d-1), border-color var(--d-1);
  }
  .note:hover { background: var(--lampe-fond); }
  .note:focus-visible { outline: 3px solid var(--lampe-vive); outline-offset: 2px; }
  .note.choisie { background: var(--lampe-fond); border: 2px solid var(--lampe); padding: calc(12px - 0.5px) calc(16px - 0.5px); transform: translateY(-2px) scale(1.04); }
  .emoji { font-size: 28px; line-height: 1; }
  .compact .note { flex-direction: row; min-width: 0; padding: 6px 12px; gap: 6px; border-radius: var(--r-pill); font-size: 13px; }
  .compact .emoji { font-size: 16px; }
  @media (prefers-reduced-motion: reduce) { .note { transition: none; } .note.choisie { transform: none; } }
</style>
