// Aides des tests de la lecture : faux service médiathèque, films fabriqués par ffmpeg, mesures ffprobe.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Analyse } from '@canape/partage';
import type { UtilisateurConnecte } from '../../src/commun/auth.ts';
import { maintenantIso } from '../../src/commun/identifiants.ts';
import type { FilmService, RegleAcces, ServiceMediatheque } from '../../src/commun/services.ts';
import type { Config } from '../../src/config.ts';
import type { Base } from '../../src/db/index.ts';
import { construireAnalyse } from '../../src/modules/mediatheque/analyse.ts';

export interface FauxMediatheque extends ServiceMediatheque {
  films: Map<string, FilmService>;
  declencherPret(id: string): void;
  declencherSupprime(id: string): void;
}

export function fauxMediatheque(): FauxMediatheque {
  const films = new Map<string, FilmService>();
  const prets: Array<(id: string) => void> = [];
  const supprimes: Array<(id: string) => void> = [];
  const regles: RegleAcces[] = [];
  return {
    films,
    obtenir: (id) => films.get(id) ?? null,
    peutVoir: (u: UtilisateurConnecte, id) => {
      const f = films.get(id);
      return !!f && (u.role === 'admin' || f.proprietaireId === u.id || f.visibilite === 'tous' || regles.some((r) => r(u, id)));
    },
    peutModifier: (u, id) => {
      const f = films.get(id);
      return !!f && (u.role === 'admin' || f.proprietaireId === u.id);
    },
    ajouterRegleAcces: (r) => void regles.push(r),
    surFilmPret: (cb) => void prets.push(cb),
    surFilmSupprime: (cb) => void supprimes.push(cb),
    declencherPret: (id) => prets.forEach((cb) => cb(id)),
    declencherSupprime: (id) => supprimes.forEach((cb) => cb(id)),
  };
}

/** À passer dans `creerAppTest({ avantPret })` : installe le faux service (la vraie médiathèque est déjà décorée sur `develop`). */
export function installerFaux(app: FastifyInstance, faux: FauxMediatheque): void {
  if (app.hasDecorator('mediatheque')) app.mediatheque = faux;
  else app.decorate('mediatheque', faux);
}

/** Dossier temporaire partagé par les films fabriqués. */
export function dossierMedias(): string {
  return mkdtempSync(path.join(tmpdir(), 'canape-lecture-medias-'));
}

export function ffmpegSync(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-nostdin', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg a échoué : ${r.stderr}`);
}

const SINUS = (d: number) => ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${d}`];
const MIRE = (d: number, taille = '160x90') => ['-f', 'lavfi', '-i', `testsrc2=size=${taille}:rate=25:duration=${d}`];

/** MP4 lisible directement (H.264 + AAC). */
export function fabriquerMp4(chemin: string, duree = 5): void {
  ffmpegSync([...MIRE(duree), ...SINUS(duree), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', chemin]);
}

/** MKV H.264 8 bits + AC3 (son seul à convertir) ; images clés irrégulières ; sous-titres SRT intégrés si `srt`. */
export function fabriquerMkvH264(chemin: string, duree = 26, srt?: string): void {
  const entrees = [...MIRE(duree), ...SINUS(duree)];
  if (srt) entrees.push('-i', srt);
  ffmpegSync([
    ...entrees, '-map', '0:v', '-map', '1:a', ...(srt ? ['-map', '2:s'] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-bf', '0', '-g', '9999', '-sc_threshold', '0', '-force_key_frames', '0,4,9,13,20', '-c:a', 'ac3', ...(srt ? ['-c:s', 'srt'] : []), chemin,
  ]);
}

/** MKV MPEG-4 + AAC (image à convertir). */
export function fabriquerMkvMpeg4(chemin: string, duree = 30): void {
  ffmpegSync([...MIRE(duree), ...SINUS(duree), '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'aac', '-shortest', chemin]);
}

export function ffprobeSync(chemin: string): ReturnType<typeof JSON.parse> {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', chemin], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

export function analyserSync(chemin: string): Analyse {
  return construireAnalyse(ffprobeSync(chemin));
}

/** Instants (pts, dts, durée) des paquets d'un fichier par flux : `video` et `audio`. */
export function paquets(chemin: string): { video: Array<{ pts: number; dts: number; duree: number }>; audio: Array<{ pts: number; dts: number; duree: number }> } {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'packet=codec_type,pts_time,dts_time,duration_time', '-of', 'csv=p=0', chemin], { encoding: 'utf8' });
  const sortie = { video: [] as Array<{ pts: number; dts: number; duree: number }>, audio: [] as Array<{ pts: number; dts: number; duree: number }> };
  for (const l of r.stdout.split('\n')) {
    const [type, pts, dts, duree] = l.split(',');
    if (type !== 'video' && type !== 'audio') continue;
    sortie[type].push({ pts: Number(pts), dts: Number(dts), duree: Number(duree) || 0 });
  }
  return sortie;
}

export interface FilmDeTest {
  id: string;
  service: FilmService;
}

let compteurFilms = 0;

/** Place un fichier source dans `CANAPE_FILMS/<id>/original.<ext>`, insère la ligne `films` et l'inscrit dans le faux service. */
export function creerFilmDeTest(
  t: { db: Base; config: Config }, faux: FauxMediatheque, proprietaireId: number, source: string,
  options: { analyse?: Analyse; visibilite?: 'prive' | 'partage' | 'tous'; etat?: 'analyse' | 'pret' | 'erreur'; contenu?: Buffer } = {},
): FilmDeTest {
  const id = `film${String(++compteurFilms).padStart(8, '0')}`;
  const ext = path.extname(source) || '.mp4';
  const dossier = path.join(t.config.films, id);
  mkdirSync(dossier, { recursive: true });
  const fichier = `${id}/original${ext}`;
  const absolu = path.join(t.config.films, fichier);
  if (options.contenu) writeFileSync(absolu, options.contenu);
  else copyFileSync(source, absolu);
  const analyse = options.analyse ?? (existsSync(source) && !options.contenu ? analyserSync(absolu) : null);
  const etat = options.etat ?? 'pret';
  t.db.prepare(
    `INSERT INTO films (id, proprietaire_id, titre, fichier, nom_origine, taille, duree, analyse, etat, visibilite, ajoute_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, proprietaireId, `Film ${id}`, fichier, path.basename(source), 1, analyse?.duree ?? null, analyse ? JSON.stringify(analyse) : null, etat, options.visibilite ?? 'prive', maintenantIso());
  const service: FilmService = {
    id, proprietaireId, titre: `Film ${id}`, annee: null, duree: analyse?.duree ?? null, fichier, cheminAbsolu: absolu,
    visibilite: options.visibilite ?? 'prive', etat, analyse,
  };
  faux.films.set(id, service);
  return { id, service };
}

export function nettoyer(dossier: string): void {
  rmSync(dossier, { recursive: true, force: true });
}

export const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Attend qu'une condition devienne vraie (délai en ms). */
export async function attendreQue(cond: () => boolean | Promise<boolean>, delai = 30_000, pas = 100): Promise<void> {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    if (await cond()) return;
    await attendre(pas);
  }
  throw new Error(`condition non remplie après ${delai} ms`);
}
