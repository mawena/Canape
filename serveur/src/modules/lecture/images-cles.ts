// Index des images clés d'un fichier (mode « son seul converti » : découpage du HLS sur les images clés).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { DUREE_SEGMENT_HLS } from '@canape/partage';

export interface IndexImagesCles {
  version: 1;
  taille: number;
  /** Instants des images clés, relatifs à la première image vidéo (secondes), triés. */
  images: number[];
}

/** Lit tous les paquets vidéo d'un fichier avec ffprobe (sans décoder) et rend les instants des images clés. */
export function lireImagesCles(fichier: string, nice = 10): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const enfant = spawn('nice', ['-n', String(nice), 'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', fichier], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const cles: number[] = [];
    let min = Infinity;
    let erreur = '';
    enfant.stderr.setEncoding('utf8').on('data', (d: string) => {
      if (erreur.length < 500) erreur += d;
    });
    const lignes = createInterface({ input: enfant.stdout });
    lignes.on('line', (ligne) => {
      const [t, f] = ligne.split(',');
      const pts = Number(t);
      if (!Number.isFinite(pts)) return;
      if (pts < min) min = pts;
      if (f?.includes('K')) cles.push(pts);
    });
    enfant.on('error', reject);
    enfant.on('close', (code) => {
      if (code !== 0 || cles.length === 0) return reject(new Error(`ffprobe : images clés illisibles (${erreur.trim().split('\n')[0] ?? code})`));
      cles.sort((a, b) => a - b);
      resolve(cles.map((c) => Math.round((c - min) * 1e6) / 1e6));
    });
  });
}

const enCours = new Map<string, Promise<number[]>>();

/** Index mis en cache dans `<fichierCache>` (JSON), calculé une seule fois. */
export function imagesClesEnCache(fichier: string, fichierCache: string, nice = 10): Promise<number[]> {
  const taille = statSync(fichier).size;
  try {
    const j = JSON.parse(readFileSync(fichierCache, 'utf8')) as IndexImagesCles;
    if (j.version === 1 && j.taille === taille && j.images.length) return Promise.resolve(j.images);
  } catch {
    /* pas encore calculé */
  }
  let p = enCours.get(fichierCache);
  if (!p) {
    p = lireImagesCles(fichier, nice)
      .then((images) => {
        mkdirSync(path.dirname(fichierCache), { recursive: true });
        const tmp = `${fichierCache}.tmp`;
        writeFileSync(tmp, JSON.stringify({ version: 1, taille, images } satisfies IndexImagesCles));
        renameSync(tmp, fichierCache);
        return images;
      })
      .finally(() => enCours.delete(fichierCache));
    enCours.set(fichierCache, p);
  }
  return p;
}

/**
 * Début de chaque segment produit par le muxer HLS de ffmpeg en copie vidéo : il coupe à la première image clé
 * dont l'instant atteint `DUREE × (numéro du segment)` (règle vérifiée sur ffmpeg 6.1).
 */
export function debutsSegmentsCopie(images: number[], duree = DUREE_SEGMENT_HLS): number[] {
  const debuts = [0];
  let n = 1;
  for (const t of images.slice(1)) {
    if (t + 1e-6 >= duree * n) {
      debuts.push(t);
      n++;
    }
  }
  return debuts;
}

/** Durées des segments d'après leurs débuts et la durée totale. */
export function dureesDepuisDebuts(debuts: number[], total: number): number[] {
  return debuts.map((d, i) => Math.max(0.001, Math.round(((debuts[i + 1] ?? Math.max(total, d + 0.001)) - d) * 1e6) / 1e6));
}

/** Segments de durée fixe (mode « image convertie » : images clés forcées toutes les `duree` secondes). */
export function dureesFixes(total: number, duree = DUREE_SEGMENT_HLS): number[] {
  const n = Math.max(1, Math.ceil(total / duree - 1e-9));
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? duree : Math.max(0.001, Math.round((total - duree * (n - 1)) * 1e6) / 1e6)));
}

/** Liste de lecture VOD complète. */
export function listeDeLecture(durees: number[]): string {
  const cible = Math.max(1, Math.ceil(Math.max(...durees)));
  const lignes = [
    '#EXTM3U', '#EXT-X-VERSION:7', `#EXT-X-TARGETDURATION:${cible}`, '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD', '#EXT-X-INDEPENDENT-SEGMENTS', '#EXT-X-MAP:URI="init.mp4"',
  ];
  durees.forEach((d, i) => lignes.push(`#EXTINF:${d.toFixed(3)},`, `${i}.m4s`));
  lignes.push('#EXT-X-ENDLIST', '');
  return lignes.join('\n');
}
