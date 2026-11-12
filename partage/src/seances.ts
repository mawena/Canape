// Types du module séances (contrat : docs/CONCEPTION.md, « Séances »).
import type { UtilisateurPublic } from './comptes.ts';
import type { Film } from './films.ts';

export interface Seance {
  id: string;
  hoteId: number;
  hotePrenom: string;
  filmId: string | null;
  filmTitre: string | null;
  titre: string | null;
  prevueLe: string | null;
  /** Il existe un lien pour rejoindre. */
  aUnLien: boolean;
  pisteAudio: number | null;
  sousTitres: string | null;
  position: number;
  creeLe: string;
  termineeLe: string | null;
  invites: UtilisateurPublic[];
  /** Nombre de connexions actuellement dans la salle. */
  presents: number;
}

/** `GET /api/seances` */
export interface ListeSeances {
  aVenir: Seance[];
  enCours: Seance[];
  recentes: Seance[];
}

/** `POST /api/seances` */
export interface CorpsCreerSeance {
  filmId: string;
  titre?: string;
  prevueLe?: string;
  invites?: number[];
}

/** `PATCH /api/seances/:id` */
export interface CorpsModifierSeance {
  filmId?: string;
  titre?: string | null;
  prevueLe?: string | null;
  invites?: number[];
  terminee?: boolean;
}

export interface MessageChat {
  id: number;
  seanceId: string;
  utilisateurId: number | null;
  prenom: string | null;
  texte: string;
  position: number | null;
  envoyeLe: string;
}

export interface ProgressionFilm {
  film: Film;
  position: number;
  duree: number | null;
  seanceId: string | null;
  termine: boolean;
  vuLe: string;
}

/** `GET /api/ice` */
export interface ReponseIce {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}

export interface ReponseLienSeance {
  lien: string;
}
