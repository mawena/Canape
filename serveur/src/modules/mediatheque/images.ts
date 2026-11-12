// Images tirées du film (affiche verticale, fond horizontal) et couleur dominante.
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Analyse } from '@canape/partage';
import { executer } from '../../commun/ffmpeg.ts';

const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,tonemap=tonemap=hable:desat=0,zscale=p=bt709:t=bt709:m=bt709:r=tv,format=yuv420p';

/** Luminance moyenne (0-255) de l'image à l'instant `t`, ou `null` si ffmpeg ne rend rien. */
async function luminance(fichier: string, t: number, nice: number, dossier: string): Promise<number | null> {
  const sortie = path.join(dossier, `lum-${Math.round(t * 1000)}.raw`);
  const r = await executer(
    'ffmpeg',
    ['-v', 'error', '-y', '-ss', t.toFixed(3), '-i', fichier, '-an', '-sn', '-frames:v', '1',
      '-vf', 'scale=32:18,format=gray', '-f', 'rawvideo', sortie],
    { nice },
  );
  if (r.code !== 0) return null;
  const octets = await readFile(sortie).catch(() => null);
  if (!octets || octets.length === 0) return null;
  let somme = 0;
  for (const o of octets) somme += o;
  return somme / octets.length;
}

/** Instants candidats (secondes) : vers 10-15 % de la durée, puis ailleurs si l'image est noire. */
export function instantsCandidats(duree: number): number[] {
  if (!(duree > 0)) return [0];
  const parts = duree < 4 ? [0.5, 0.25, 0.75] : [0.12, 0.15, 0.1, 0.2, 0.3, 0.45, 0.06];
  return parts.map((p) => Math.min(Math.max(duree * p, 0), Math.max(duree - 0.2, 0)));
}

export interface ImagesProduites {
  affiche: string;
  fond: string;
}

/** Écrit `affiche.jpg` (600×900) et `fond.jpg` (1280 px de large) dans `dossier`. */
export async function extraireImages(
  fichier: string, dossier: string, analyse: Analyse, nice: number,
): Promise<ImagesProduites | null> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'canape-img-'));
  try {
    let meilleur = { t: instantsCandidats(analyse.duree)[0] ?? 0, lum: -1 };
    for (const t of instantsCandidats(analyse.duree)) {
      const lum = await luminance(fichier, t, nice, tmp);
      if (lum === null) continue;
      if (lum > meilleur.lum) meilleur = { t, lum };
      if (lum >= 24) break;
    }
    const affiche = path.join(dossier, 'affiche.jpg');
    const fond = path.join(dossier, 'fond.jpg');
    const index = analyse.video?.index ?? 0;
    const hdr = analyse.video?.hdr === true;
    for (const avecTonemap of hdr ? [true, false] : [false]) {
      const prefixe = `scale=1280:-2${avecTonemap ? `,${TONEMAP}` : ''}`;
      const graphe =
        `[0:${index}]${prefixe},split=2[f][a];` +
        `[f]format=yuvj420p[o1];[a]crop=w='min(iw,ih*2/3)':h=ih,scale=600:900,format=yuvj420p[o2]`;
      const r = await executer(
        'ffmpeg',
        ['-v', 'error', '-y', '-ss', meilleur.t.toFixed(3), '-i', fichier, '-an', '-sn', '-frames:v', '1',
          '-filter_complex', graphe, '-map', '[o1]', '-q:v', '3', fond, '-map', '[o2]', '-q:v', '3', affiche],
        { nice },
      );
      if (r.code === 0 && (await stat(affiche).catch(() => null)) && (await stat(fond).catch(() => null))) {
        return { affiche, fond };
      }
    }
    return null;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function versHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

function versRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m].map((n) => Math.round(n * 255)) as [number, number, number];
}

/**
 * Couleur vive représentative d'une image RGB (3 octets par pixel) : les pixels sont répartis en 12 teintes,
 * pondérés par saturation × luminosité ; la teinte gagnante est moyennée puis éclaircie et saturée si besoin.
 * `null` pour une image grise ou noire.
 */
export function couleurDominante(rgb: Uint8Array): string | null {
  for (const [sMin, vMin] of [[0.3, 0.25], [0.15, 0.2]] as const) {
    const seaux = Array.from({ length: 12 }, () => ({ poids: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i + 2 < rgb.length; i += 3) {
      const r = rgb[i]!, g = rgb[i + 1]!, b = rgb[i + 2]!;
      const [h, s, v] = versHsv(r, g, b);
      if (s < sMin || v < vMin) continue;
      const poids = s * v;
      const seau = seaux[Math.floor(h / 30) % 12]!;
      seau.poids += poids; seau.r += r * poids; seau.g += g * poids; seau.b += b * poids;
    }
    const meilleur = seaux.reduce((a, b) => (b.poids > a.poids ? b : a));
    if (meilleur.poids <= 0) continue;
    const [h, s, v] = versHsv(meilleur.r / meilleur.poids, meilleur.g / meilleur.poids, meilleur.b / meilleur.poids);
    const [r, g, b] = versRgb(h, Math.max(s, 0.55), Math.min(1, Math.max(v, 0.8)));
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  return null;
}

/** Couleur dominante d'une image (affiche JPEG) : réduction par ffmpeg puis `couleurDominante`. */
export async function couleurDeImage(image: string, nice: number): Promise<string | null> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'canape-col-'));
  try {
    const sortie = path.join(tmp, 'p.raw');
    const r = await executer(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', image, '-vf', 'scale=24:36', '-pix_fmt', 'rgb24', '-f', 'rawvideo', sortie],
      { nice },
    );
    if (r.code !== 0) return null;
    return couleurDominante(await readFile(sortie));
  } catch {
    return null;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
