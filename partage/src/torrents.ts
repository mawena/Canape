// Types du téléchargement de films par torrent (contrat : docs/CONCEPTION.md, « Torrents »).

/**
 * - `metadonnees` : on récupère la liste des fichiers du torrent (lien magnet) ;
 * - `telechargement` : les fichiers choisis se téléchargent ;
 * - `pause` : arrêté par son propriétaire ;
 * - `import` : téléchargement fini, les films sont créés dans la galerie ;
 * - `termine` : les films sont dans la galerie (`filmIds`) ;
 * - `erreur` : voir `erreur` (pas de vidéo, quota dépassé, torrent illisible…) ;
 * - `annule` : retiré par son propriétaire (les données partielles sont effacées).
 */
/** Moteur de téléchargement. */
export type MoteurTorrent = 'transmission' | 'webtorrent';

export type EtatTorrent = 'metadonnees' | 'telechargement' | 'pause' | 'import' | 'termine' | 'erreur' | 'annule';

export interface FichierTorrent {
  /** Index du fichier dans le torrent. */
  index: number;
  /** Chemin dans le torrent (`Dossier/Film.mkv`). */
  chemin: string;
  taille: number;
  /** Fichier vidéo (d'après son extension) : chaque vidéo choisie devient un film. */
  video: boolean;
  /** Sous-titres `.srt`/`.vtt` : ajoutés au film de la vidéo du même dossier. */
  sousTitres: boolean;
  choisi: boolean;
}

/** Un téléchargement par torrent (ligne de `GET /api/torrents`). */
export interface Telechargement {
  id: string;
  proprietaireId: number;
  proprietairePrenom: string;
  /** Nom du torrent, ou `null` tant que ses informations ne sont pas reçues. */
  nom: string | null;
  infoHash: string;
  etat: EtatTorrent;
  /** 0 à 1, sur les fichiers choisis. */
  progression: number;
  octetsRecus: number;
  /** Taille des fichiers choisis, `null` tant que les informations ne sont pas reçues. */
  octetsTotal: number | null;
  /** Octets par seconde reçus (0 hors téléchargement). */
  debit: number;
  /** Octets par seconde envoyés. */
  debitEnvoi: number;
  /** Nombre de pairs connectés. */
  pairs: number;
  /** Estimation du temps restant (s), `null` si inconnue. */
  resteSecondes: number | null;
  /** Vide tant que les informations du torrent ne sont pas reçues. */
  fichiers: FichierTorrent[];
  /** Films créés à la fin (`termine`). */
  filmIds: string[];
  /** Message en français si `etat === 'erreur'`. */
  erreur: string | null;
  /** Torrent privé (drapeau `private` : ni DHT ni échange de pairs, seulement ses trackers). */
  prive: boolean;
  /** Le fichier est encore partagé (après `termine`) ; « Retirer » arrête le partage, le film reste. */
  enPartage: boolean;
  /** Ratio envoyé / reçu, `null` si inconnu. */
  ratio: number | null;
  /** Dernière réponse des trackers quand elle explique un problème (refus, erreur), en clair ; sinon `null`. */
  messageTracker: string | null;
  /** Moteur qui télécharge : Transmission sur le serveur, ou WebTorrent intégré (secours). */
  moteur: MoteurTorrent;
  creeLe: string;
  termineLe: string | null;
}

/** `GET /api/torrents` */
export interface ListeTelechargements {
  /** Les torrents sont activés sur ce serveur (`CANAPE_TORRENTS`) et l'utilisateur a le droit d'en ajouter. */
  peutAjouter: boolean;
  /** Les siens ; l'admin voit ceux de tout le monde. Les plus récents d'abord. */
  telechargements: Telechargement[];
}

/** `POST /api/torrents` en JSON (ou multipart avec un fichier `.torrent`). */
export interface CorpsAjoutTorrent {
  magnet: string;
}

/** `PATCH /api/torrents/:id` */
export interface CorpsModifTorrent {
  /** Index des fichiers à télécharger (au moins une vidéo). */
  fichiers?: number[];
  /** `true` met en pause, `false` reprend. */
  pause?: boolean;
}

/** Taille maximale d'un fichier `.torrent` envoyé. */
export const TAILLE_MAX_FICHIER_TORRENT = 1024 * 1024;
/** Rafraîchissement conseillé de la liste côté client pendant un téléchargement (ms). */
export const INTERVALLE_SUIVI_TORRENTS = 2000;
