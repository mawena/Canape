// Sous-titres : extraction des pistes texte en WebVTT (à la demande, mis en cache).
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { argsSousTitres } from './commandes.ts';
import { Processus } from './processus.ts';

const enCours = new Map<string, Promise<void>>();

/** Extrait la piste `index` de `entree` vers `sortie` (une seule extraction à la fois par fichier). */
export function extraireSousTitres(entree: string, index: number, sortie: string, nice: number): Promise<void> {
  if (existsSync(sortie)) return Promise.resolve();
  let p = enCours.get(sortie);
  if (!p) {
    p = (async () => {
      mkdirSync(path.dirname(sortie), { recursive: true });
      const tmp = `${sortie}.tmp.vtt`;
      const proc = new Processus('ffmpeg', argsSousTitres(entree, index, tmp), { nice });
      const fin = await proc.fini;
      if (fin.code !== 0 || !existsSync(tmp)) {
        rmSync(tmp, { force: true });
        throw new Error(fin.erreur || 'extraction impossible');
      }
      renameSync(tmp, sortie);
    })().finally(() => enCours.delete(sortie));
    enCours.set(sortie, p);
  }
  return p;
}
