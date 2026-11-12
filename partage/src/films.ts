// Types du module médiathèque (contrat : docs/CONCEPTION.md, « Médiathèque »).

export type EtatFilm = 'analyse' | 'pret' | 'erreur';
export type Visibilite = 'prive' | 'partage' | 'tous';
export type VueFilms = 'miens' | 'partages' | 'tous';

/** Piste vidéo vue par ffprobe. */
export interface PisteVideoAnalysee {
  index: number;
  codec: string;
  profil: string | null;
  largeur: number;
  hauteur: number;
  /** Profondeur de couleur par composante (8, 10…). */
  profondeurBits: number;
  pixFmt: string | null;
  /** HDR (PQ / HLG, BT.2020). */
  hdr: boolean;
  fps: number | null;
  debit: number | null;
}

export interface PisteAudioAnalysee {
  index: number;
  codec: string;
  langue: string | null;
  titre: string | null;
  canaux: number;
  debit: number | null;
  parDefaut: boolean;
}

export interface PisteSousTitresAnalysee {
  index: number;
  codec: string;
  langue: string | null;
  titre: string | null;
  /** Piste texte (SRT, ASS, WebVTT, mov_text…) : extractible en WebVTT. Faux pour PGS, VobSub. */
  texte: boolean;
  force: boolean;
  sdh: boolean;
  parDefaut: boolean;
}

/** JSON stocké dans `films.analyse` (résultat de ffprobe, résumé). `index` = index ffprobe du flux. */
export interface Analyse {
  /** Noms de format ffprobe (« mov,mp4,m4a,3gp,3g2,mj2 », « matroska,webm »…). */
  conteneur: string;
  duree: number;
  debit: number | null;
  video: PisteVideoAnalysee | null;
  audio: PisteAudioAnalysee[];
  sousTitres: PisteSousTitresAnalysee[];
}

export interface SousTitreExterne {
  id: number;
  langue: string | null;
  libelle: string;
}

/** Film tel que renvoyé par l'API (`GET /api/films`, `GET /api/films/:id`). */
export interface Film {
  id: string;
  proprietaireId: number;
  proprietairePrenom: string;
  titre: string;
  annee: number | null;
  resume: string | null;
  genres: string[];
  tmdbId: number | null;
  nomOrigine: string;
  taille: number;
  duree: number | null;
  etat: EtatFilm;
  erreur: string | null;
  visibilite: Visibilite;
  /** Identifiants des comptes avec qui le film est partagé (renseigné pour le propriétaire et l'admin). */
  partages: number[];
  aAffiche: boolean;
  aFond: boolean;
  /** Analyse complète (seulement sur la fiche). */
  analyse?: Analyse | null;
  sousTitresExternes?: SousTitreExterne[];
  /** Droit de modifier, partager, supprimer. */
  modifiable: boolean;
  ajouteLe: string;
}

/** `PATCH /api/films/:id` */
export interface CorpsModifierFilm {
  titre?: string;
  annee?: number | null;
  resume?: string | null;
  visibilite?: Visibilite;
  partages?: number[];
}

export interface CandidatTmdb {
  tmdbId: number;
  titre: string;
  annee: number | null;
  resume: string | null;
  affiche: string | null;
}

export const EXTENSIONS_SOUS_TITRES = ['.srt', '.vtt'] as const;
export const TAILLE_MAX_SOUS_TITRES = 5 * 1024 * 1024;
/** Taille des morceaux de téléversement tus côté client. */
export const TAILLE_MORCEAU_TUS = 50 * 1024 * 1024;
