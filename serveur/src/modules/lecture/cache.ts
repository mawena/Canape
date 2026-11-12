// Taille du cache et purge des plus anciens (jamais ce qui sert encore).
import { readdirSync, rmSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export async function tailleDossier(dossier: string): Promise<number> {
  let total = 0;
  let entrees;
  try {
    entrees = await readdir(dossier, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entrees) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) total += await tailleDossier(p);
    else if (e.isFile()) total += (await stat(p).catch(() => null))?.size ?? 0;
  }
  return total;
}

/** Unités purgeables : `<cache>/<film>/hls/<audio>`. */
export function unitesDuCache(cache: string): Array<{ dossier: string; filmId: string; utiliseLe: number }> {
  const r: Array<{ dossier: string; filmId: string; utiliseLe: number }> = [];
  let films: string[] = [];
  try {
    films = readdirSync(cache);
  } catch {
    return r;
  }
  for (const f of films) {
    const hls = path.join(cache, f, 'hls');
    let audios: string[] = [];
    try {
      audios = readdirSync(hls);
    } catch {
      continue;
    }
    for (const a of audios) {
      const dossier = path.join(hls, a);
      let utilise = 0;
      try {
        utilise = statSync(dossier).mtimeMs;
        for (const n of readdirSync(dossier)) utilise = Math.max(utilise, statSync(path.join(dossier, n)).mtimeMs);
      } catch {
        /* en cours de suppression */
      }
      r.push({ dossier, filmId: f, utiliseLe: utilise });
    }
  }
  return r;
}

/** Supprime les unités les plus anciennes jusqu'à passer sous 90 % du maximum. Rend les octets restants. */
export async function purger(cache: string, max: number, protege: Set<string>): Promise<number> {
  let total = await tailleDossier(cache);
  if (total <= max) return total;
  const unites = unitesDuCache(cache).filter((u) => !protege.has(u.dossier)).sort((a, b) => a.utiliseLe - b.utiliseLe);
  for (const u of unites) {
    if (total <= max * 0.9) break;
    const t = await tailleDossier(u.dossier);
    rmSync(u.dossier, { recursive: true, force: true });
    total -= t;
  }
  return total;
}
