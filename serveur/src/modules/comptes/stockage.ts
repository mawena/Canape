import { statfs, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import type { Stockage } from '@canape/partage';
import type { Config } from '../../config.ts';
import type { Base } from '../../db/index.ts';
import { octetsParProprietaire } from './service.ts';

/** Taille cumulée d'un dossier (parcours itératif ; les entrées illisibles sont ignorées). */
export async function tailleDossier(racine: string): Promise<number> {
  let total = 0;
  const aVisiter = [racine];
  while (aVisiter.length) {
    const dossier = aVisiter.pop() as string;
    let entrees;
    try {
      entrees = await readdir(dossier, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entrees) {
      const chemin = path.join(dossier, e.name);
      if (e.isDirectory()) aVisiter.push(chemin);
      else if (e.isFile()) {
        try { total += (await lstat(chemin)).size; } catch { /* disparu entre-temps */ }
      }
    }
  }
  return total;
}

export const DUREE_CACHE_MS = 60_000;

/** Calcule `GET /api/admin/stockage` ; la taille du cache n'est recalculée que toutes les 60 s. */
export function creerCalculStockage(config: Config, db: Base, maintenant: () => number = Date.now) {
  let cache: { valeur: number; le: number } | null = null;
  return async (): Promise<Stockage> => {
    const s = await statfs(config.films);
    if (!cache || maintenant() - cache.le > DUREE_CACHE_MS) cache = { valeur: await tailleDossier(config.cache), le: maintenant() };
    const parProprietaire = octetsParProprietaire(db);
    const comptes = db.prepare('SELECT id, prenom, quota_octets FROM utilisateurs ORDER BY id').all() as Array<{ id: number; prenom: string; quota_octets: number | null }>;
    let films = 0;
    for (const n of parProprietaire.values()) films += n;
    return {
      disque: { total: Number(s.bsize) * Number(s.blocks), libre: Number(s.bsize) * Number(s.bavail) },
      films,
      cache: cache.valeur,
      cacheMax: config.cacheMax,
      parUtilisateur: comptes.map((c) => ({ utilisateurId: c.id, prenom: c.prenom, octets: parProprietaire.get(c.id) ?? 0, quotaOctets: c.quota_octets })),
    };
  };
}
