// Messages entre le serveur (parent) et le processus enfant qui porte le client WebTorrent.
// Le parent garde la base et les règles ; l'enfant ne connaît que des identifiants et des dossiers.

/** Options passées à l'enfant au lancement (argument JSON). */
export interface OptionsEnfant {
  /** Priorité `nice` de l'enfant. */
  priorite: number;
  /** Port d'écoute des pairs (0 = au hasard). */
  port: number;
  /** Octets/s reçus au plus (0 = sans limite). */
  debitMax: number;
  /** Octets/s envoyés au plus (0 = sans limite). */
  envoiMax: number;
  /** Essais : ni DHT, ni trackers, ni découverte locale, ni UPnP/NAT-PMP. */
  isole: boolean;
  /** Essais : pairs `hôte:port` ajoutés à chaque torrent. */
  pairs: string[];
  /** Intervalle de l'état périodique (ms). */
  intervalleMs: number;
}

export interface FichierMeta {
  index: number;
  chemin: string;
  taille: number;
}

export interface EtatTorrentEnfant {
  id: string;
  /** Octets reçus sur les fichiers choisis. */
  octetsRecus: number;
  /** Taille des fichiers choisis (0 tant que le choix n'est pas fait). */
  octetsTotal: number;
  debit: number;
  debitEnvoi: number;
  pairs: number;
}

/** Parent → enfant. */
export type VersEnfant =
  | {
      t: 'ajouter';
      id: string;
      /** Lien magnet ou chemin absolu d'un fichier `.torrent`. */
      magnet?: string;
      fichier?: string;
      /** Dossier des données de ce torrent (`<telechargements>/<id>`). */
      dossier: string;
      /** Fichiers à télécharger, si le choix est déjà fait (reprise). */
      choix?: number[];
    }
  | { t: 'choisir'; id: string; fichiers: number[] }
  /** Garder le torrent partagé jusqu'à ce ratio, puis envoyer `partage_fini`. */
  | { t: 'partager'; id: string; ratio: number; delaiMs: number }
  /** Arrête le torrent ; `effacer` supprime aussi son dossier. Réponse : `retire`. */
  | { t: 'retirer'; id: string; effacer: boolean }
  | { t: 'arreter' };

/** Enfant → parent. */
export type DeEnfant =
  | { t: 'pret' }
  | { t: 'metadonnees'; id: string; infoHash: string; nom: string; fichiers: FichierMeta[] }
  | { t: 'etat'; torrents: EtatTorrentEnfant[] }
  /** Tous les fichiers choisis sont reçus (une seule fois par ajout). */
  | { t: 'termine'; id: string }
  | { t: 'partage_fini'; id: string }
  | { t: 'erreur'; id: string; message: string }
  | { t: 'retire'; id: string };
