// Logique pure des films « à voir ensemble » (phase 23) : phrases, invités de la séance, mise à jour locale d'une envie.
import type { EtatEnvie, FilmAVoir, UtilisateurEnvie } from '@canape/partage';
import { listerNoms } from '../ui/format.ts';

/** Les autres personnes qui ont envie du film (sans moi) : ce sont elles qu'on invite. */
export function autresEnvieux(item: Pick<FilmAVoir, 'personnes'>, moiId: number): UtilisateurEnvie[] {
  return item.personnes.filter((p) => p.id !== moiId);
}

/** Vrai quand plusieurs personnes en ont envie : le film à mettre en avant. */
export function estPlebiscite(item: Pick<FilmAVoir, 'personnes'>): boolean {
  return item.personnes.length >= 2;
}

/** Phrase sous un film : « Tu as envie de le voir. », « Toi et Ben, vous avez envie de le voir. », « Ana a envie de le voir. »… */
export function phraseEnvies(item: Pick<FilmAVoir, 'personnes'>, moiId: number): string {
  const autres = autresEnvieux(item, moiId).map((p) => p.prenom);
  const moi = item.personnes.some((p) => p.id === moiId);
  if (moi && autres.length === 0) return 'Tu as envie de le voir.';
  if (moi) return `Toi et ${listerNoms(autres)}, vous avez envie de le voir.`;
  if (autres.length === 1) return `${autres[0]} a envie de le voir.`;
  return `${listerNoms(autres)} ont envie de le voir.`;
}

/** « 1 envie » / « 3 envies ». */
export function libelleNombreEnvies(n: number): string {
  return n === 1 ? '1 envie' : `${n} envies`;
}

/** Après un `PUT`/`DELETE` : met à jour la liste locale (retire le film si plus personne n'en a envie). */
export function appliquerEtat(liste: FilmAVoir[], etat: EtatEnvie, moi: UtilisateurEnvie): FilmAVoir[] {
  return liste.flatMap((item) => {
    if (item.film.id !== etat.filmId) return [item];
    const sans = item.personnes.filter((p) => p.id !== moi.id);
    const personnes = etat.moi ? [...sans, moi] : sans;
    if (personnes.length === 0) return [];
    return [{ ...item, personnes, moi: etat.moi, film: { ...item.film, envie: etat.moi, nbEnvies: etat.nombre } }];
  });
}

/** Ordre de l'accueil : le plus d'envies d'abord ; à égalité, on garde l'ordre du serveur (le plus récent d'abord). */
export function trierEnvies(liste: FilmAVoir[]): FilmAVoir[] {
  return liste.map((x, i) => ({ x, i })).sort((a, b) => b.x.personnes.length - a.x.personnes.length || a.i - b.i).map((e) => e.x);
}

/** Identifiants d'invités lus dans `?invites=2,5` (sans doublon, entiers positifs, hors `moiId`). */
export function lireInvites(param: string | null, moiId?: number): number[] {
  if (!param) return [];
  const ids = param.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0 && n !== moiId);
  return [...new Set(ids)];
}
