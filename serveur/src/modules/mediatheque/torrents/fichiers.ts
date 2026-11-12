// Règles pures sur un torrent : validation des liens magnet, vidéos et sous-titres, choix par défaut.
import path from 'node:path';
import { TAILLE_MAX_SOUS_TITRES, type FichierTorrent } from '@canape/partage';
import { requeteInvalide } from '../../../commun/erreurs.ts';

export const EXTENSIONS_VIDEO_TORRENT = ['mkv', 'mp4', 'm4v', 'mov', 'avi', 'webm', 'ts', 'm2ts', 'wmv', 'mpg', 'mpeg', 'flv', 'ogv'];
const RE_VIDEO = new RegExp(`\\.(${EXTENSIONS_VIDEO_TORRENT.join('|')})$`, 'i');
const RE_SOUS_TITRES = /\.(srt|vtt)$/i;
const RE_ECHANTILLON = /(^|[\s._\-[(])(sample|echantillon|échantillon)([\s._\-\])]|$)/i;
const DOSSIERS_SOUS_TITRES = /^(subs?|subtitles?|sous-?titres?|st)$/i;
/** Plus de fichiers que ça : le torrent est refusé (la liste est gardée en base). */
export const FICHIERS_MAX = 2000;

export const estVideo = (chemin: string): boolean => RE_VIDEO.test(chemin);
export const estSousTitres = (chemin: string): boolean => RE_SOUS_TITRES.test(chemin);

/** Échantillon (`sample.mkv`, `Sample/film.mkv`, `Film.sample.mkv`) : jamais choisi par défaut. */
export function estEchantillon(chemin: string): boolean {
  return chemin.split('/').some((morceau) => RE_ECHANTILLON.test(morceau.replace(RE_VIDEO, '')));
}

const dossierDe = (chemin: string): string => path.posix.dirname(chemin);

/** Un sous-titre « appartient » à une vidéo : même dossier, ou sous-dossier `Subs`… de ce dossier. */
export function dansLeDossierDe(chemin: string, video: string): boolean {
  const dv = dossierDe(video);
  const ds = dossierDe(chemin);
  if (ds === dv) return true;
  return path.posix.dirname(ds) === dv && DOSSIERS_SOUS_TITRES.test(path.posix.basename(ds));
}

export type FichierBrut = Omit<FichierTorrent, 'choisi' | 'video' | 'sousTitres'>;

/** Complète les fichiers (vidéo ? sous-titres ?) sans rien choisir. */
export function decrire(brut: FichierBrut[]): FichierTorrent[] {
  return brut.map((f) => ({ ...f, video: estVideo(f.chemin), sousTitres: estSousTitres(f.chemin), choisi: false }));
}

/** Choix par défaut : la plus grosse vidéo (hors échantillons) et ses sous-titres. Aucune vidéo : liste vide. */
export function choixParDefaut(fichiers: FichierTorrent[]): number[] {
  let meilleur: FichierTorrent | null = null;
  for (const f of fichiers) {
    if (!f.video || estEchantillon(f.chemin)) continue;
    if (!meilleur || f.taille > meilleur.taille) meilleur = f;
  }
  if (!meilleur) return [];
  const choix = [meilleur.index];
  for (const f of fichiers) {
    if (f.sousTitres && f.taille <= TAILLE_MAX_SOUS_TITRES && dansLeDossierDe(f.chemin, meilleur.chemin)) choix.push(f.index);
  }
  return choix;
}

export function appliquerChoix(fichiers: FichierTorrent[], choix: number[]): FichierTorrent[] {
  const s = new Set(choix);
  return fichiers.map((f) => ({ ...f, choisi: s.has(f.index) }));
}

/** Sous-titres choisis → films : le seul film du dossier, sinon ceux dont le nom commence comme le sous-titre. */
export function associerSousTitres(videos: FichierTorrent[], sousTitres: FichierTorrent[]): Map<number, FichierTorrent[]> {
  const r = new Map<number, FichierTorrent[]>();
  for (const v of videos) r.set(v.index, []);
  const base = (c: string): string => path.posix.basename(c).replace(/\.[^.]+$/, '').toLowerCase();
  for (const s of sousTitres) {
    const voisines = videos.filter((v) => dansLeDossierDe(s.chemin, v.chemin));
    const cibles = voisines.length === 1
      ? voisines
      : voisines.filter((v) => base(s.chemin).startsWith(base(v.chemin)));
    for (const v of cibles) r.get(v.index)?.push(s);
  }
  return r;
}

// ----- Liens magnet -----

const HEX = /^[0-9a-f]{40}$/i;
const BASE32 = /^[a-z2-7]{32}$/i;
const ALPHABET32 = 'abcdefghijklmnopqrstuvwxyz234567';

function base32VersHex(s: string): string {
  let bits = 0;
  let valeur = 0;
  let hex = '';
  for (const c of s.toLowerCase()) {
    valeur = (valeur << 5) | ALPHABET32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      hex += ((valeur >> bits) & 0xff).toString(16).padStart(2, '0');
    }
  }
  return hex;
}

export interface MagnetValide {
  infoHash: string;
  /** Lien reconstruit : seulement `xt`, `dn`, `tr` (udp/http/https) et `x.pe`. */
  magnet: string;
  nom: string | null;
}

/**
 * Valide un lien magnet (`magnet:?xt=urn:btih:` + hex de 40 caractères ou base32 de 32) et le reconstruit sans les
 * paramètres qui feraient télécharger une adresse par le serveur (`xs`, `as`, `ws`).
 */
export function analyserMagnet(texte: unknown): MagnetValide {
  const invalide = () => requeteInvalide("Ce lien magnet n'est pas valide (il doit commencer par magnet:?xt=urn:btih:).");
  if (typeof texte !== 'string') throw invalide();
  const brut = texte.trim();
  if (brut.length > 4000 || !/^magnet:\?/i.test(brut)) throw invalide();
  let params: URLSearchParams;
  try { params = new URL(brut).searchParams; } catch { throw invalide(); }
  let infoHash: string | null = null;
  for (const xt of params.getAll('xt')) {
    const m = /^urn:btih:(.+)$/i.exec(xt);
    const h = m?.[1] ?? '';
    if (HEX.test(h)) { infoHash = h.toLowerCase(); break; }
    if (BASE32.test(h)) { infoHash = base32VersHex(h); break; }
  }
  if (!infoHash) throw invalide();
  const nom = (params.get('dn') ?? '').trim().slice(0, 300) || null;
  const sortie: Array<[string, string]> = [['xt', `urn:btih:${infoHash}`]];
  if (nom) sortie.push(['dn', nom]);
  for (const tr of params.getAll('tr').slice(0, 20)) {
    if (/^(udp|https?):\/\/[^\s]{3,500}$/i.test(tr)) sortie.push(['tr', tr]);
  }
  for (const pe of params.getAll('x.pe').slice(0, 10)) {
    if (/^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\]):\d{1,5}$/i.test(pe)) sortie.push(['x.pe', pe]);
  }
  return { infoHash, magnet: `magnet:?${sortie.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`, nom };
}
