// Types du module lecture (contrat : docs/CONCEPTION.md, « Lecture » et « Lecture universelle »).

export type ModeLecture = 'direct' | 'hls';

export interface PisteAudioPlan {
  index: number;
  langue: string | null;
  libelle: string;
  canaux: number;
  parDefaut: boolean;
}

export interface SousTitresPlan {
  /** `p<index>` piste intégrée, `e<id>` externe. */
  cle: string;
  langue: string | null;
  /** Libellé affichable : langue, « forcés », « SDH ». */
  libelle: string;
  force: boolean;
  sdh: boolean;
  url: string;
}

export type EtatPreparation = 'attente' | 'encours' | 'prete' | 'erreur';

export interface ResumePreparation {
  etat: EtatPreparation;
  progression: number;
}

/** `GET /api/films/:id/lecture?audio=<index>` */
export interface PlanDeLecture {
  mode: ModeLecture;
  url: string;
  duree: number;
  pistesAudio: PisteAudioPlan[];
  sousTitres: SousTitresPlan[];
  /** Pourquoi ce mode, en français (« Conversion du son seul », « Vidéo HEVC convertie »…). */
  raison: string;
  preparation: ResumePreparation | null;
  /** Ajout : sous-titres image (PGS, VobSub) que le navigateur ne sait pas afficher. */
  sousTitresImage?: SousTitresIgnores[];
}

/** Piste de sous-titres exclue du plan (image : non affichable). */
export interface SousTitresIgnores {
  langue: string | null;
  libelle: string;
}

/** Valeur de `:audio` dans les adresses `/media/:id/hls/:audio/…` quand le film n'a aucune piste audio. */
export const AUDIO_SANS = 'sans';

/** Ligne de `GET /api/films/:id/preparations`. */
export interface Preparation {
  filmId: string;
  pisteAudio: number;
  etat: EtatPreparation;
  progression: number;
  taille: number | null;
  creeLe: string;
  termineLe: string | null;
  erreur: string | null;
}

/** `GET /api/admin/lecture` */
export interface EtatLectureAdmin {
  conversionsALaVolee: Array<{
    filmId: string;
    titre: string;
    pisteAudio: number;
    spectateurs: number;
    vitesse: number | null;
    /** Ajouts : `copie` (son seul) ou `conversion` (image), préréglage x264 en cours. */
    mode?: 'copie' | 'conversion';
    preset?: string;
  }>;
  preparations: Preparation[];
  charge: { cpu1min: number; coeurs: number };
  cache: { octets: number; max: number };
}

export const DUREE_SEGMENT_HLS = 6;
