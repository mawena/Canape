// Souvenir d'une séance : textes et petites fonctions pures (durée « 1 h 52 », notes, qui était là).
import type { NoteSeance, PresentSouvenir, Souvenir } from '@canape/partage';

/** « 1 h 52 », « 1 h 05 », « 2 h », « 45 min », « moins d'une minute ». */
export function formaterTempsEnsemble(secondes: number): string {
  if (!Number.isFinite(secondes) || secondes < 60) return 'moins d’une minute';
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Les trois notes d'un mot, dans l'ordre d'affichage. */
export const NOTES: ReadonlyArray<{ valeur: NoteSeance; libelle: string; emoji: string }> = [
  { valeur: 'coeur', libelle: 'Coup de cœur', emoji: '❤️' },
  { valeur: 'bien', libelle: 'Bien', emoji: '👍' },
  { valeur: 'bof', libelle: 'Bof', emoji: '😴' },
];

export function libelleNote(n: NoteSeance): string {
  return NOTES.find((x) => x.valeur === n)?.libelle ?? n;
}
export function emojiNote(n: NoteSeance): string {
  return NOTES.find((x) => x.valeur === n)?.emoji ?? '';
}

/** Personnes qui sont entrées dans la salle. */
export function presents(s: Pick<Souvenir, 'personnes'>): PresentSouvenir[] {
  return s.personnes.filter((p) => p.present);
}

/** Vu sans personne d'autre : une seule personne (ou aucune) est entrée dans la salle. */
export function estSeul(s: Pick<Souvenir, 'personnes'>): boolean {
  return presents(s).length < 2;
}

/** « 1 h 52 ensemble » ou « Tu as regardé seul·e ». */
export function phraseTemps(s: Pick<Souvenir, 'personnes' | 'secondesEnsemble'>): string {
  return estSeul(s) ? 'Tu as regardé seul·e' : `${formaterTempsEnsemble(s.secondesEnsemble)} ensemble`;
}

/** Ma note, ou `null`. */
export function maNote(s: Pick<Souvenir, 'personnes'>, moiId: number | null | undefined): NoteSeance | null {
  if (moiId == null) return null;
  return s.personnes.find((p) => p.utilisateur.id === moiId)?.note ?? null;
}

/** Les notes des autres, « Léa : Coup de cœur ». */
export function notesDesAutres(s: Pick<Souvenir, 'personnes'>, moiId: number | null | undefined): Array<{ prenom: string; note: NoteSeance }> {
  return s.personnes
    .filter((p) => p.utilisateur.id !== moiId && p.note !== null)
    .map((p) => ({ prenom: p.utilisateur.prenom, note: p.note as NoteSeance }));
}
