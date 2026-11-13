// Types du module séances (contrat : docs/CONCEPTION.md, « Séances »).
import type { UtilisateurPublic } from './comptes.ts';
import type { Film } from './films.ts';

/** Un film du programme d'une soirée. `rang` ordonne le programme (il peut y avoir des trous) ; le film en cours est celui de `Seance.rangCourant`. */
export interface FilmProgramme {
  rang: number;
  filmId: string;
  titre: string;
  annee: number | null;
  aAffiche: boolean;
  versionImages: number;
  couleur: string | null;
}

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
  /** Les films de la soirée, dans l'ordre (un seul pour une séance ordinaire). */
  programme: FilmProgramme[];
  /** `rang` du film en cours dans `programme`. */
  rangCourant: number;
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
  /** Un seul film (séance ordinaire). Ignoré si `filmIds` est donné. */
  filmId?: string;
  /** Les films de la soirée, dans l'ordre (de 1 à `MAX_FILMS_PROGRAMME`) : le premier est lancé d'abord. */
  filmIds?: string[];
  titre?: string;
  prevueLe?: string;
  invites?: number[];
}

/** `PUT /api/seances/:id/programme` (hôte) : remplace les films **à venir** (après le film en cours). */
export interface CorpsProgramme {
  filmIds: string[];
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

/** Note d'un mot, par personne et par séance. */
export const NOTES_SEANCE = ['coeur', 'bien', 'bof'] as const;
export type NoteSeance = (typeof NOTES_SEANCE)[number];

/** Une personne du souvenir : elle est entrée dans la salle, ou elle a noté la séance après coup. */
export interface PresentSouvenir {
  utilisateur: UtilisateurPublic;
  /** `true` si elle est entrée au moins une fois dans la salle. */
  present: boolean;
  note: NoteSeance | null;
}

/** Ce qu'on garde d'une séance : qui était là, combien de temps ensemble, ce que chacun en a pensé. */
export interface Souvenir {
  seanceId: string;
  filmId: string | null;
  filmTitre: string | null;
  titre: string | null;
  creeLe: string;
  termineeLe: string | null;
  /** Durée pendant laquelle au moins deux personnes étaient dans la salle en même temps. */
  secondesEnsemble: number;
  /** Films de la soirée déjà lancés (au moins 1 s'il y a un film ; plus d'un : une soirée). */
  nbFilms: number;
  personnes: PresentSouvenir[];
}

/** `PUT /api/seances/:id/note` : `note: null` efface la note. */
export interface CorpsNoterSeance {
  note: NoteSeance | null;
}

export interface ProgressionFilm {
  film: Film;
  position: number;
  duree: number | null;
  seanceId: string | null;
  termine: boolean;
  vuLe: string;
  /** Souvenir de la séance (historique seulement ; `null` si la séance n'existe plus ou n'est plus accessible). */
  souvenir?: Souvenir | null;
}

/** `GET /api/ice` */
export interface ReponseIce {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}

export interface ReponseLienSeance {
  lien: string;
}
