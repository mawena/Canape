// Appels de l'API des torrents (contrat : docs/CONCEPTION.md, « Torrents (1.1) »).
import type { CorpsAjoutTorrent, CorpsModifTorrent, ListeTelechargements, Telechargement } from '@canape/partage';
import { api } from '$lib/api/client.ts';

export const listerTelechargements = (signal?: AbortSignal) =>
  api.get<ListeTelechargements>('/api/torrents', signal ? { signal } : undefined);

export const ajouterParMagnet = (magnet: string) => api.post<Telechargement>('/api/torrents', { magnet } satisfies CorpsAjoutTorrent);

export function ajouterParFichier(fichier: File): Promise<Telechargement> {
  const f = new FormData();
  f.append('fichier', fichier);
  return api.post<Telechargement>('/api/torrents', f);
}

export const modifierTelechargement = (id: string, corps: CorpsModifTorrent) => api.patch<Telechargement>(`/api/torrents/${id}`, corps);
export const supprimerTelechargement = (id: string) => api.supprimer(`/api/torrents/${id}`);
