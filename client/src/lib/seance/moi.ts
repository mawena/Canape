// Session de l'utilisateur courant, lue par `GET /api/etat`. Provisoire : rebranché sur le magasin du module comptes.
import type { EtatApi, Utilisateur } from '@canape/partage';
import { api } from '$lib/api/client.ts';

export async function lireMoi(): Promise<Utilisateur | null> {
  const etat = await api.get<EtatApi>('/api/etat');
  return etat.utilisateur;
}

/** Adresse de retour vers la connexion : `/connexion?retour=/seances/abc`. */
export function urlConnexion(retour: string): string {
  return `/connexion?retour=${encodeURIComponent(retour)}`;
}
