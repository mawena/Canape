// Appels de l'API médiathèque.
import type { CandidatTmdb, CorpsModifierFilm, EtatEnvie, Film, FilmAVoir, SousTitreExterne, UtilisateurPublic, VueFilms } from '@canape/partage';
import { api } from '$lib/api/client.ts';

export type TriFilms = 'recents' | 'titre' | 'annee';

export const listerFilms = (vue: VueFilms, q: string, tri: TriFilms, signal?: AbortSignal) => {
  const p = new URLSearchParams({ vue, tri });
  if (q.trim()) p.set('q', q.trim());
  return api.get<Film[]>(`/api/films?${p}`, signal ? { signal } : undefined);
};
export const obtenirFilm = (id: string) => api.get<Film>(`/api/films/${id}`);
export const modifierFilm = (id: string, corps: CorpsModifierFilm) => api.patch<Film>(`/api/films/${id}`, corps);
export const supprimerFilm = (id: string) => api.supprimer(`/api/films/${id}`);
export const listerComptes = () => api.get<UtilisateurPublic[]>('/api/utilisateurs');
export const rechercherTmdb = (id: string, requete: string) => api.post<CandidatTmdb[]>(`/api/films/${id}/tmdb/recherche`, { requete });
export const appliquerTmdb = (id: string, tmdbId: number) => api.post<Film>(`/api/films/${id}/tmdb`, { tmdbId });
export const retirerSousTitre = (id: string, sid: number) => api.supprimer(`/api/films/${id}/sous-titres/${sid}`);
export function ajouterSousTitre(id: string, fichier: File): Promise<SousTitreExterne> {
  const f = new FormData();
  f.append('fichier', fichier);
  return api.post<SousTitreExterne>(`/api/films/${id}/sous-titres`, f);
}

/** Adresse d'une image d'un film (le `?v=` change avec les images : cache HTTP long). */
export const urlImage = (f: Pick<Film, 'id' | 'versionImages'>, quoi: 'affiche' | 'fond') => `/api/films/${f.id}/${quoi}?v=${f.versionImages}`;

// ---- Films « à voir ensemble » ----
export const listerEnvies = () => api.get<FilmAVoir[]>('/api/envies');
export const marquerEnvie = (id: string) => api.put<EtatEnvie>(`/api/films/${id}/envie`);
export const retirerEnvie = (id: string) => api.supprimer<EtatEnvie>(`/api/films/${id}/envie`);
