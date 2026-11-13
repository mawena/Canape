// Programme d'une soirée (plusieurs films d'affilée) : fonctions pures, communes au serveur et au client.
import type { FilmProgramme } from './seances.ts';

/** Films d'une soirée, au plus. */
export const MAX_FILMS_PROGRAMME = 20;

/** L'entracte ne dépasse jamais cette durée à partir de maintenant, même rallongé (secondes). */
export const ENTRACTE_MAX_SECONDES = 3600;

/** Programme trié par `rang` (copie). */
export function programmeTrie(programme: readonly FilmProgramme[]): FilmProgramme[] {
  return [...programme].sort((a, b) => a.rang - b.rang);
}

/** Films qui restent à voir après le film en cours, dans l'ordre. */
export function filmsAVenir(programme: readonly FilmProgramme[], rangCourant: number): FilmProgramme[] {
  return programmeTrie(programme).filter((f) => f.rang > rangCourant);
}

/** Le film d'après, ou `null` si le film en cours est le dernier. */
export function filmSuivant(programme: readonly FilmProgramme[], rangCourant: number): FilmProgramme | null {
  return filmsAVenir(programme, rangCourant)[0] ?? null;
}

/** Le film en cours, ou `null`. */
export function filmEnCours(programme: readonly FilmProgramme[], rangCourant: number): FilmProgramme | null {
  return programme.find((f) => f.rang === rangCourant) ?? null;
}

/** Une soirée : plus d'un film au programme. */
export function estSoiree(programme: readonly unknown[]): boolean {
  return programme.length > 1;
}

/** Déplace l'élément `de` vers `vers` (indices dans la liste) ; une copie, la liste d'origine est intacte. */
export function deplacer<T>(liste: readonly T[], de: number, vers: number): T[] {
  const copie = [...liste];
  if (de === vers || de < 0 || vers < 0 || de >= copie.length || vers >= copie.length) return copie;
  const [x] = copie.splice(de, 1);
  copie.splice(vers, 0, x as T);
  return copie;
}

/** Secondes restantes d'un entracte (arrondies au-dessus, jamais négatives) ; `null` s'il n'y en a pas. */
export function tempsRestantEntracte(fin: number | null, maintenant: number): number | null {
  if (fin === null) return null;
  return Math.max(0, Math.ceil((fin - maintenant) / 1000));
}

/** « 4:59 », « 0:07 », « 12:00 ». */
export function formaterMinuteur(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** « 3 films : A, B, C » ; `null` pour un seul film (rien à ajouter à l'écran). Au-delà de 3 titres : « … et 2 autres ». */
export function phraseProgramme(titres: readonly string[]): string | null {
  if (titres.length < 2) return null;
  const vus = titres.slice(0, 3).join(', ');
  const reste = titres.length - 3;
  return `${titres.length} films : ${vus}${reste > 0 ? ` et ${reste} ${reste === 1 ? 'autre' : 'autres'}` : ''}`;
}

/** « Film 2 sur 3 » ; `null` pour un seul film. */
export function positionDansProgramme(programme: readonly FilmProgramme[], rangCourant: number): string | null {
  if (programme.length < 2) return null;
  const tri = programmeTrie(programme);
  const i = tri.findIndex((f) => f.rang === rangCourant);
  return i < 0 ? null : `Film ${i + 1} sur ${tri.length}`;
}

/** « 2 films » (singulier : « 1 film »). */
export function phraseNbFilms(n: number): string {
  return `${n} ${n > 1 ? 'films' : 'film'}`;
}
