// Services que les modules s'offrent entre eux (contrat, fichier du socle).
// La médiathèque décore `app.mediatheque` ; la lecture et les séances s'en servent.
// Règle : n'utiliser `app.mediatheque` qu'à l'exécution (dans une requête) ou dans un hook `onReady`,
// jamais pendant l'enregistrement d'un plugin (l'ordre d'enregistrement ne doit pas compter).
import type { Analyse } from '@canape/partage';
import type { UtilisateurConnecte } from './auth.ts';

/** Vue d'un film utile aux autres modules (ligne `films` décodée). */
export interface FilmService {
  id: string;
  proprietaireId: number;
  titre: string;
  annee: number | null;
  duree: number | null;
  /** Chemin relatif à CANAPE_FILMS (`<id>/original.<ext>`). */
  fichier: string;
  /** Chemin absolu du fichier original. */
  cheminAbsolu: string;
  visibilite: 'prive' | 'partage' | 'tous';
  etat: 'analyse' | 'pret' | 'erreur';
  analyse: Analyse | null;
}

/** Règle d'accès supplémentaire : rend `true` si l'utilisateur peut voir ce film (ex. invité d'une séance). */
export type RegleAcces = (utilisateur: UtilisateurConnecte, filmId: string) => boolean;

export interface ServiceMediatheque {
  obtenir(filmId: string): FilmService | null;
  /** Admin, propriétaire, partage, visibilité « tous », ou une règle ajoutée (séances). */
  peutVoir(utilisateur: UtilisateurConnecte, filmId: string): boolean;
  /** Admin ou propriétaire. */
  peutModifier(utilisateur: UtilisateurConnecte, filmId: string): boolean;
  ajouterRegleAcces(regle: RegleAcces): void;
  /** Appelé quand un film passe à l'état « pret » (après analyse). */
  surFilmPret(cb: (filmId: string) => void): void;
  /** Appelé après la suppression d'un film (fichiers et ligne déjà retirés). */
  surFilmSupprime(cb: (filmId: string) => void): void;
}

declare module 'fastify' {
  interface FastifyInstance {
    mediatheque: ServiceMediatheque;
  }
}
