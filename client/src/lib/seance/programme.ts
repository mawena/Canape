// Soirée à plusieurs films, côté client : petites fonctions pures (qui gère, état d'un film, ordre, textes de l'entracte
// et de la fin). Les règles communes (film suivant, temps restant, « 3 films : … ») sont dans `@canape/partage`.
import { deplacer, filmEnCours, filmSuivant, filmsAVenir, formaterMinuteur, programmeTrie, type FilmProgramme, type Seance } from '@canape/partage';
import { formaterTempsEnsemble } from './souvenir.ts';

export { formaterMinuteur };

/** L'hôte (et lui seul, comme pour « Inviter ») gère le programme et l'entracte, tant que la séance n'est pas terminée. */
export function peutGererProgramme(seance: Pick<Seance, 'hoteId' | 'termineeLe'> | null | undefined, moiId: number | null | undefined): boolean {
  return !!seance && moiId != null && seance.hoteId === moiId && seance.termineeLe === null;
}

export type EtatFilmProgramme = 'vu' | 'en-cours' | 'a-venir';

/** Un film du programme : déjà vu, en cours ou à venir. */
export function etatFilm(f: Pick<FilmProgramme, 'rang'>, rangCourant: number): EtatFilmProgramme {
  return f.rang < rangCourant ? 'vu' : f.rang === rangCourant ? 'en-cours' : 'a-venir';
}

/** Identifiants des films à venir, dans l'ordre (ce que `PUT /api/seances/:id/programme` remplace). */
export function idsAVenir(programme: readonly FilmProgramme[], rangCourant: number): string[] {
  return filmsAVenir(programme, rangCourant).map((f) => f.filmId);
}

/** Monte (`-1`) ou descend (`+1`) le film `filmId` parmi `ids` ; même liste si le geste est impossible. */
export function deplacerFilm(ids: readonly string[], filmId: string, sens: -1 | 1): string[] {
  const i = ids.indexOf(filmId);
  return i < 0 ? [...ids] : deplacer(ids, i, i + sens);
}

/** Ajoute un film à la fin (une seule fois). */
export function ajouterFilm(ids: readonly string[], filmId: string): string[] {
  return ids.includes(filmId) ? [...ids] : [...ids, filmId];
}

/** Retire un film. */
export function retirerFilm(ids: readonly string[], filmId: string): string[] {
  return ids.filter((x) => x !== filmId);
}

/** Les films qu'on peut encore ajouter : prêts, ni en cours ni déjà à venir. */
export function filmsAjoutables<T extends { id: string; etat?: string }>(films: readonly T[], programme: readonly FilmProgramme[], rangCourant: number): T[] {
  const pris = new Set(programme.filter((f) => f.rang >= rangCourant).map((f) => f.filmId));
  return films.filter((f) => (f.etat === undefined || f.etat === 'pret') && !pris.has(f.id));
}

/** Le film qui vient de commencer est-il le suivant du programme (enchaînement, et non un changement de film à la main) ? */
export function estEnchainement(programme: readonly FilmProgramme[], rangCourantAvant: number, filmId: string | null): FilmProgramme | null {
  const s = filmSuivant(programme, rangCourantAvant);
  return s && s.filmId === filmId ? s : null;
}

/** Corps de `POST /api/seances` : `filmId` pour un seul film (comme avant), `filmIds` pour une soirée. */
export function filmsDuCorps(ids: readonly string[]): { filmId: string } | { filmIds: string[] } {
  return ids.length > 1 ? { filmIds: [...ids] } : { filmId: ids[0] ?? '' };
}

/** « Les Heures bleues », « A puis B », « A, B puis C » (message d'invitation). */
export function titresEnchaines(titres: readonly string[]): string {
  if (titres.length < 2) return titres[0] ?? '';
  return `${titres.slice(0, -1).join(', ')} puis ${titres.at(-1)}`;
}

/** « Film 2 sur 3 » à côté du titre du panneau, ou rien pour un seul film. */
export function libelleRang(programme: readonly FilmProgramme[], rangCourant: number): string | null {
  const tri = programmeTrie(programme);
  if (tri.length < 2) return null;
  const i = tri.findIndex((f) => f.rang === rangCourant);
  return i < 0 ? null : `Film ${i + 1} sur ${tri.length}`;
}

/** Films déjà lancés ce soir (le film en cours compris). */
export function filmsLances(programme: readonly FilmProgramme[], rangCourant: number): number {
  return programme.filter((f) => f.rang <= rangCourant).length;
}

/** Ce qu'entend un lecteur d'écran pendant l'entracte : une phrase par minute, puis les dernières secondes. */
export function phraseEntracte(secondes: number | null): string {
  if (secondes === null) return '';
  if (secondes <= 0) return 'Le film suivant commence.';
  if (secondes < 60) return `Le film suivant commence dans moins d’une minute.`;
  const m = Math.ceil(secondes / 60);
  return `Le film suivant commence dans ${m} ${m > 1 ? 'minutes' : 'minute'}.`;
}

/** Durée ajoutée à l'entracte, pour l'annonce : « 5 min », « 30 s ». */
export function dureeCourte(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  return s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`;
}

/** Question de l'écran de fin : la soirée entière s'il y a eu plusieurs films. */
export function invitationNote(nbFilms: number): string {
  return nbFilms > 1 ? 'Un mot sur cette soirée ?' : 'Un mot sur ce film ?';
}

/** Résumé de l'écran de fin : « 3 films, 4 h 12 ensemble » ; un seul film : `null` (la phrase habituelle suffit). */
export function phraseSoiree(nbFilms: number, secondesEnsemble: number, seul: boolean): string | null {
  if (nbFilms < 2) return null;
  return seul ? `${nbFilms} films, regardés seul·e` : `${nbFilms} films, ${formaterTempsEnsemble(secondesEnsemble)} ensemble`;
}

/** Le film en cours d'après le programme (titre à jour dans la salle après un enchaînement). */
export { filmEnCours, filmSuivant };
