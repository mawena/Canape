import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ContexteCli } from '../comptes/cli.ts';
import { Mediatheque } from './mediatheque.ts';
import { extensionVideoPlausible } from './noms.ts';

const journalConsole = { info: () => {}, warn: (...a: unknown[]) => console.error('Attention :', ...a), error: (...a: unknown[]) => console.error('Erreur :', ...a) };

async function lister(dossier: string, recursif: boolean): Promise<string[]> {
  const r: string[] = [];
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) { if (recursif) r.push(...(await lister(p, true))); }
    else if (extensionVideoPlausible(e.name)) r.push(p);
  }
  return r.sort();
}

/**
 * `canape films importer <dossier> --proprietaire <identifiant> [--copier]` : chaque vidéo du dossier (de ses
 * sous-dossiers aussi s'il n'y en a pas à la racine) devient un film du propriétaire, avec ses `.srt`/`.vtt`
 * voisins en sous-titres externes, puis analyse. Rend le nombre de films importés.
 */
export async function importerFilmsCli(
  ctx: ContexteCli,
  options: { dossier: string; proprietaire: string; copier?: boolean },
): Promise<number> {
  const racine = path.resolve(options.dossier);
  if (!(await stat(racine).catch(() => null))?.isDirectory()) throw new Error(`« ${options.dossier} » n'est pas un dossier.`);
  const u = ctx.db.prepare('SELECT id FROM utilisateurs WHERE identifiant = ?').get(options.proprietaire) as { id: number } | undefined;
  if (!u) throw new Error(`Aucun compte « ${options.proprietaire} ».`);
  let videos = await lister(racine, false);
  if (videos.length === 0) videos = await lister(racine, true);
  const med = new Mediatheque(ctx.db, ctx.config, journalConsole);
  let n = 0;
  for (const v of videos) {
    const id = await med.creerFilm({ proprietaireId: u.id, nomOrigine: path.basename(v), source: v, copier: options.copier ?? false, analyser: false });
    const base = path.basename(v).replace(/\.[^.]+$/, '').toLowerCase();
    for (const f of await readdir(path.dirname(v))) {
      if (!/\.(srt|vtt)$/i.test(f) || !f.toLowerCase().startsWith(base)) continue;
      try { await med.ajouterSousTitre(id, await readFile(path.join(path.dirname(v), f)), f); }
      catch (e) { console.error(`Sous-titres ignorés (${f}) : ${(e as Error).message}`); }
    }
    await med.planifier(id);
    n++;
  }
  return n;
}
