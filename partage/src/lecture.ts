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
}

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
  conversionsALaVolee: Array<{ filmId: string; titre: string; pisteAudio: number; spectateurs: number; vitesse: number | null }>;
  preparations: Preparation[];
  charge: { cpu1min: number; coeurs: number };
  cache: { octets: number; max: number };
}

export const DUREE_SEGMENT_HLS = 6;
