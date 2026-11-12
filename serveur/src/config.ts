import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';

export interface ServeurIce {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface Config {
  hote: string;
  port: number;
  urlPublique: string;
  /** Origine (schéma + hôte + port) de `urlPublique`, utilisée pour le contrôle d'`Origin`. */
  origine: string;
  /** `true` si l'adresse publique est en HTTPS (cookie Secure, HSTS). */
  https: boolean;
  derriereProxy: boolean;
  donnees: string;
  films: string;
  cache: string;
  televersements: string;
  /** Torrents activés (`CANAPE_TORRENTS`). */
  torrents: boolean;
  /** Données des torrents en cours (`<id>/…`) et `.torrent` gardés (`.torrents/`). */
  telechargements: string;
  /** Téléchargements actifs en même temps. */
  torrentSimultanes: number;
  /** Octets/s reçus au plus (0 = sans limite). */
  torrentDebitMax: number;
  /** Octets/s envoyés au plus (0 = sans limite). */
  torrentEnvoiMax: number;
  /** Ratio de partage après la fin (0 = on arrête dès la fin). */
  torrentPartage: number;
  /** Port d'écoute des pairs (0 = au hasard). */
  torrentPort: number;
  /** Interne (essais) : ni DHT, ni trackers publics, ni UPnP/NAT-PMP, ni découverte locale ; suivi plus rapide. */
  torrentIsole: boolean;
  /** Octets. */
  televersementMax: number;
  quotaDefaut: number;
  cacheMax: number;
  transcodageFils: number;
  transcodagePriorite: number;
  preparationAuto: boolean;
  tmdbCle: string;
  ice: ServeurIce[];
  turnUrls: string[];
  turnSecret: string;
  tlsCert: string;
  tlsCle: string;
}

export const ICE_DEFAUT: ServeurIce[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const UNITES: Record<string, number> = {
  '': 1, B: 1,
  K: 1024, KB: 1024, KO: 1024, KIB: 1024,
  M: 1024 ** 2, MB: 1024 ** 2, MO: 1024 ** 2, MIB: 1024 ** 2,
  G: 1024 ** 3, GB: 1024 ** 3, GO: 1024 ** 3, GIB: 1024 ** 3,
  T: 1024 ** 4, TB: 1024 ** 4, TO: 1024 ** 4, TIB: 1024 ** 4,
};

/** « 100G », « 512M », « 1.5 Go », « 1024 » → octets. */
export function analyserTaille(valeur: string, nom = 'taille'): number {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)\s*$/.exec(valeur);
  const facteur = m ? UNITES[(m[2] ?? '').toUpperCase()] : undefined;
  if (!m || facteur === undefined) throw new Error(`${nom} : taille invalide (« ${valeur} », attendu par exemple 100G ou 512M).`);
  return Math.floor(Number((m[1] ?? '0').replace(',', '.')) * facteur);
}

/** Lit un fichier `CLÉ=valeur` (lignes vides et `#` ignorées, guillemets facultatifs). */
export function lireFichierConfig(chemin: string): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const brut of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const ligne = brut.trim();
    if (!ligne || ligne.startsWith('#')) continue;
    const i = ligne.indexOf('=');
    if (i < 1) continue;
    const cle = ligne.slice(0, i).trim();
    let val = ligne.slice(i + 1).trim();
    if (val.length >= 2 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
      val = val.slice(1, -1);
    }
    valeurs[cle] = val;
  }
  return valeurs;
}

function entier(v: string | undefined, defaut: number, nom: string, min: number, max: number): number {
  if (v === undefined || v === '') return defaut;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${nom} doit être un entier entre ${min} et ${max} (reçu « ${v} »).`);
  }
  return n;
}

function booleen(v: string | undefined, defaut: boolean): boolean {
  if (v === undefined || v === '') return defaut;
  return ['1', 'true', 'oui', 'yes', 'on'].includes(v.toLowerCase());
}

function decimal(v: string | undefined, defaut: number, nom: string, min: number, max: number): number {
  if (v === undefined || v === '') return defaut;
  const n = Number(v.replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${nom} doit être un nombre entre ${min} et ${max} (reçu « ${v} »).`);
  }
  return n;
}

function taille(v: string | undefined, defaut: string, nom: string): number {
  return analyserTaille(v === undefined || v === '' ? defaut : v, nom);
}

/**
 * Construit la configuration. `env` : variables d'environnement (prioritaires sur le fichier) ;
 * `fichier` : chemin d'un fichier `CLÉ=valeur` facultatif (sinon `CANAPE_CONFIG`).
 */
export function chargerConfig(env: Record<string, string | undefined> = process.env, fichier: string | null = null): Config {
  const chemin = fichier ?? env['CANAPE_CONFIG'] ?? null;
  const v: Record<string, string | undefined> = chemin ? lireFichierConfig(chemin) : {};
  for (const [k, val] of Object.entries(env)) if (k.startsWith('CANAPE_') && val !== undefined) v[k] = val;

  let ice = ICE_DEFAUT;
  if (v['CANAPE_ICE']) {
    try {
      const j: unknown = JSON.parse(v['CANAPE_ICE']);
      if (!Array.isArray(j)) throw new Error("ce n'est pas une liste");
      ice = j as ServeurIce[];
    } catch (e) {
      throw new Error(`CANAPE_ICE n'est pas du JSON valide (${(e as Error).message}).`);
    }
  }

  const urlPublique = (v['CANAPE_URL_PUBLIQUE'] || 'http://localhost:8080').replace(/\/+$/, '');
  let origine: string;
  try {
    origine = new URL(urlPublique).origin;
  } catch {
    throw new Error(`CANAPE_URL_PUBLIQUE n'est pas une adresse valide (« ${urlPublique} »).`);
  }
  const fils = Math.max(1, Math.floor(availableParallelism() / 2));

  return {
    hote: v['CANAPE_HOTE'] || '127.0.0.1',
    port: entier(v['CANAPE_PORT'], 8080, 'CANAPE_PORT', 0, 65535),
    urlPublique,
    origine,
    https: origine.startsWith('https:'),
    derriereProxy: booleen(v['CANAPE_DERRIERE_PROXY'], false),
    donnees: path.resolve(v['CANAPE_DONNEES'] || './donnees'),
    films: path.resolve(v['CANAPE_FILMS'] || './films'),
    cache: path.resolve(v['CANAPE_CACHE'] || './cache'),
    televersements: path.resolve(v['CANAPE_TELEVERSEMENTS'] || './televersements'),
    torrents: booleen(v['CANAPE_TORRENTS'], true),
    telechargements: path.resolve(v['CANAPE_TELECHARGEMENTS'] || './telechargements'),
    torrentSimultanes: entier(v['CANAPE_TORRENT_SIMULTANES'], 2, 'CANAPE_TORRENT_SIMULTANES', 1, 50),
    torrentDebitMax: taille(v['CANAPE_TORRENT_DEBIT_MAX'], '0', 'CANAPE_TORRENT_DEBIT_MAX'),
    torrentEnvoiMax: taille(v['CANAPE_TORRENT_ENVOI_MAX'], '1M', 'CANAPE_TORRENT_ENVOI_MAX'),
    torrentPartage: decimal(v['CANAPE_TORRENT_PARTAGE'], 0, 'CANAPE_TORRENT_PARTAGE', 0, 1000),
    torrentPort: entier(v['CANAPE_TORRENT_PORT'], 0, 'CANAPE_TORRENT_PORT', 0, 65535),
    torrentIsole: booleen(v['CANAPE_TORRENT_ISOLE'], false),
    televersementMax: taille(v['CANAPE_TELEVERSEMENT_MAX'], '100G', 'CANAPE_TELEVERSEMENT_MAX'),
    quotaDefaut: taille(v['CANAPE_QUOTA_DEFAUT'], '100G', 'CANAPE_QUOTA_DEFAUT'),
    cacheMax: taille(v['CANAPE_CACHE_MAX'], '20G', 'CANAPE_CACHE_MAX'),
    transcodageFils: entier(v['CANAPE_TRANSCODAGE_FILS'], fils, 'CANAPE_TRANSCODAGE_FILS', 1, 256),
    transcodagePriorite: entier(v['CANAPE_TRANSCODAGE_PRIORITE'], 10, 'CANAPE_TRANSCODAGE_PRIORITE', 0, 19),
    preparationAuto: booleen(v['CANAPE_PREPARATION_AUTO'], true),
    tmdbCle: v['CANAPE_TMDB_CLE'] || '',
    ice,
    turnUrls: (v['CANAPE_TURN_URLS'] || '').split(',').map((s) => s.trim()).filter(Boolean),
    turnSecret: v['CANAPE_TURN_SECRET'] || '',
    tlsCert: v['CANAPE_TLS_CERT'] || '',
    tlsCle: v['CANAPE_TLS_CLE'] || '',
  };
}
