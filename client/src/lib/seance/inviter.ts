// Logique pure de l'invitation « en séance » : qui peut inviter, quel texte partager.
import type { Seance } from '@canape/partage';
import { messageInvitation } from './dates.ts';

/** L'hôte (ou un administrateur) voit l'option, et seulement tant que la séance n'est pas terminée. */
export function peutInviter(seance: Pick<Seance, 'hoteId' | 'termineeLe'> | null | undefined, moiId: number | null | undefined, admin = false): boolean {
  return peutGererSeance(seance, moiId, admin) && seance!.termineeLe === null;
}

/** Modifier ou supprimer une séance : son hôte, ou un administrateur (qui peut tout faire). */
export function peutGererSeance(seance: Pick<Seance, 'hoteId'> | null | undefined, moiId: number | null | undefined, admin = false): boolean {
  return !!seance && moiId != null && (admin || seance.hoteId === moiId);
}

/** Texte envoyé par « Partager… » : le message d'invitation habituel, avec le titre de la séance à défaut de celui du film. */
export function texteDePartage(seance: Pick<Seance, 'titre' | 'filmTitre' | 'prevueLe'>, lien: string): string {
  return messageInvitation(seance.filmTitre ?? seance.titre ?? 'un film', seance.prevueLe, lien);
}
