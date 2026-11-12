// Logique pure de l'invitation « en séance » : qui peut inviter, quel texte partager.
import type { Seance } from '@canape/partage';
import { messageInvitation } from './dates.ts';

/** Seul l'hôte voit l'option, et seulement tant que la séance n'est pas terminée. */
export function peutInviter(seance: Pick<Seance, 'hoteId' | 'termineeLe'> | null | undefined, moiId: number | null | undefined): boolean {
  return !!seance && moiId != null && seance.hoteId === moiId && seance.termineeLe === null;
}

/** Texte envoyé par « Partager… » : le message d'invitation habituel, avec le titre de la séance à défaut de celui du film. */
export function texteDePartage(seance: Pick<Seance, 'titre' | 'filmTitre' | 'prevueLe'>, lien: string): string {
  return messageInvitation(seance.filmTitre ?? seance.titre ?? 'un film', seance.prevueLe, lien);
}
