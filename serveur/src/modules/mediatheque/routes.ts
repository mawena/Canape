// Routes HTTP du module médiathèque (liste, fiche, modification, suppression, images, TMDB, sous-titres externes).
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CorpsModifierFilm, Film, VueFilms } from '@canape/partage';
import { EXTENSIONS_SOUS_TITRES } from '@canape/partage';
import { ErreurHttp, introuvable, requeteInvalide } from '../../commun/erreurs.ts';
import { type LigneFilm, type Mediatheque } from './mediatheque.ts';

const VUES = new Set<VueFilms>(['miens', 'partages', 'tous']);

export function installerRoutes(app: FastifyInstance, med: Mediatheque): void {
  const pre = { preHandler: app.exigerConnexion };

  /** Film visible par l'utilisateur, sinon 404 (pas d'indice d'existence). */
  function visible(req: FastifyRequest, id: string): LigneFilm {
    const l = med.ligne(id);
    if (!l || !med.peutVoir(req.utilisateur, id)) throw introuvable('Film introuvable.');
    return l;
  }
  function modifiable(req: FastifyRequest, id: string): LigneFilm {
    const l = visible(req, id);
    if (!med.peutModifier(req.utilisateur, id)) {
      // Un film que l'on voit mais que l'on ne possède pas : refus clair.
      throw new ErreurHttp(403, 'interdit', "Seul le propriétaire du film peut le modifier.");
    }
    return l;
  }

  app.get('/api/films', pre, async (req): Promise<Film[]> => {
    const q = req.query as { vue?: string; q?: string; tri?: string };
    const vue = (q.vue ?? 'tous') as VueFilms;
    if (!VUES.has(vue)) throw requeteInvalide('Vue inconnue (miens, partages ou tous).');
    const u = req.utilisateur;
    const recherche = (q.q ?? '').trim().toLowerCase();
    const tri = q.tri ?? 'recents';
    const lignes = app.db.prepare('SELECT * FROM films').all() as unknown as LigneFilm[];
    const retenues = lignes.filter((l) => {
      if (vue === 'miens') { if (l.proprietaire_id !== u.id) return false; }
      else if (!med.peutVoir(u, l.id)) return false;
      else if (vue === 'partages' && l.proprietaire_id === u.id) return false;
      if (recherche && !l.titre.toLowerCase().includes(recherche) && !l.nom_origine.toLowerCase().includes(recherche)) return false;
      return true;
    });
    retenues.sort((a, b) => {
      if (tri === 'titre') return a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base' });
      if (tri === 'annee') return (b.annee ?? 0) - (a.annee ?? 0) || a.titre.localeCompare(b.titre, 'fr');
      return b.ajoute_le.localeCompare(a.ajoute_le);
    });
    return retenues.map((l) => med.versFilm(l, u));
  });

  app.get('/api/films/:id', pre, async (req): Promise<Film> => {
    const l = visible(req, (req.params as { id: string }).id);
    return med.versFilm(l, req.utilisateur, true);
  });

  app.patch('/api/films/:id', pre, async (req): Promise<Film> => {
    const id = (req.params as { id: string }).id;
    modifiable(req, id);
    const c = (req.body ?? {}) as CorpsModifierFilm;
    const sets: string[] = [];
    const vals: Array<string | number | null> = [];
    if (c.titre !== undefined) {
      const t = String(c.titre).trim();
      if (!t || t.length > 300) throw requeteInvalide('Le titre doit faire entre 1 et 300 caractères.');
      sets.push('titre = ?'); vals.push(t);
    }
    if (c.annee !== undefined) {
      if (c.annee !== null && (!Number.isInteger(c.annee) || c.annee < 1880 || c.annee > 2100)) throw requeteInvalide("L'année n'est pas valide.");
      sets.push('annee = ?'); vals.push(c.annee);
    }
    if (c.resume !== undefined) {
      if (c.resume !== null && String(c.resume).length > 5000) throw requeteInvalide('Le résumé est trop long.');
      sets.push('resume = ?'); vals.push(c.resume === null || String(c.resume).trim() === '' ? null : String(c.resume).trim());
    }
    if (c.visibilite !== undefined) {
      if (!['prive', 'partage', 'tous'].includes(c.visibilite)) throw requeteInvalide('Visibilité inconnue.');
      sets.push('visibilite = ?'); vals.push(c.visibilite);
    }
    let partages: number[] | undefined;
    if (c.partages !== undefined) {
      if (!Array.isArray(c.partages) || c.partages.some((n) => !Number.isInteger(n))) throw requeteInvalide('Liste de partage invalide.');
      const proprietaire = med.ligne(id)!.proprietaire_id;
      partages = [...new Set(c.partages)].filter((n) => n !== proprietaire);
      const existants = new Set((app.db.prepare('SELECT id FROM utilisateurs WHERE actif = 1').all() as Array<{ id: number }>).map((r) => r.id));
      if (partages.some((n) => !existants.has(n))) throw requeteInvalide('Un des comptes choisis n’existe pas.');
    }
    if (sets.length) app.db.prepare(`UPDATE films SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    if (partages) med.definirPartages(id, partages);
    return med.versFilm(med.ligne(id)!, req.utilisateur, true);
  });

  app.delete('/api/films/:id', pre, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    modifiable(req, id);
    await med.supprimer(id);
    return reply.code(204).send();
  });

  // ----- Images -----
  async function image(req: FastifyRequest, reply: FastifyReply, quoi: 'affiche' | 'fond') {
    const l = visible(req, (req.params as { id: string }).id);
    const rel = l[quoi];
    if (!rel) throw introuvable('Pas d’image pour ce film.');
    const fichier = path.join(app.config.films, rel);
    const s = await stat(fichier).catch(() => null);
    if (!s) throw introuvable('Pas d’image pour ce film.');
    const versionne = typeof (req.query as { v?: string }).v === 'string';
    return reply
      .header('Cache-Control', versionne ? 'private, max-age=31536000, immutable' : 'private, no-cache')
      .header('Content-Length', s.size)
      .type('image/jpeg')
      .send(createReadStream(fichier));
  }
  app.get('/api/films/:id/affiche', pre, (req, reply) => image(req, reply, 'affiche'));
  app.get('/api/films/:id/fond', pre, (req, reply) => image(req, reply, 'fond'));

  // ----- TMDB -----
  function exigerTmdb(): void {
    if (!med.tmdb.actif) throw new ErreurHttp(409, 'tmdb_inactif', "TMDB n'est pas configuré sur ce serveur (CANAPE_TMDB_CLE).");
  }
  app.post('/api/films/:id/tmdb/recherche', pre, async (req) => {
    const l = modifiable(req, (req.params as { id: string }).id);
    exigerTmdb();
    const requete = String(((req.body ?? {}) as { requete?: string }).requete ?? l.titre).trim();
    if (!requete) throw requeteInvalide('La recherche est vide.');
    try { return await med.tmdb.rechercher(requete, null); } catch (e) { throw new ErreurHttp(502, 'tmdb_indisponible', `TMDB ne répond pas : ${(e as Error).message}`); }
  });
  app.post('/api/films/:id/tmdb', pre, async (req) => {
    const id = (req.params as { id: string }).id;
    modifiable(req, id);
    exigerTmdb();
    const tmdbId = Number(((req.body ?? {}) as { tmdbId?: number }).tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw requeteInvalide('Identifiant TMDB invalide.');
    try { await med.appliquerTmdb(id, tmdbId); } catch (e) { throw new ErreurHttp(502, 'tmdb_indisponible', `TMDB ne répond pas : ${(e as Error).message}`); }
    return med.versFilm(med.ligne(id)!, req.utilisateur, true);
  });

  // ----- Sous-titres externes -----
  app.post('/api/films/:id/sous-titres', pre, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    modifiable(req, id);
    if (!req.isMultipart()) throw new ErreurHttp(415, 'type_non_pris_en_charge', 'Envoie le fichier en multipart/form-data.');
    const fichier = await req.file();
    if (!fichier) throw requeteInvalide('Aucun fichier reçu.');
    const ext = path.extname(fichier.filename).toLowerCase();
    if (!(EXTENSIONS_SOUS_TITRES as readonly string[]).includes(ext)) throw new ErreurHttp(415, 'type_non_pris_en_charge', 'Seuls les fichiers .srt et .vtt sont acceptés.');
    let octets: Buffer;
    try { octets = await fichier.toBuffer(); } catch { throw new ErreurHttp(413, 'trop_volumineux', 'Ce fichier de sous-titres dépasse 5 Mo.'); }
    if (fichier.file.truncated) throw new ErreurHttp(413, 'trop_volumineux', 'Ce fichier de sous-titres dépasse 5 Mo.');
    const champ = (n: string): string | undefined => {
      const f = fichier.fields[n] as { value?: unknown } | undefined;
      return typeof f?.value === 'string' ? f.value : undefined;
    };
    let st;
    try { st = await med.ajouterSousTitre(id, octets, fichier.filename, champ('langue') || undefined, champ('libelle')); }
    catch (e) { throw requeteInvalide(`Sous-titres illisibles : ${(e as Error).message}`); }
    return reply.code(201).send(st);
  });
  app.delete('/api/films/:id/sous-titres/:sid', pre, async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    modifiable(req, id);
    if (!(await med.retirerSousTitre(id, Number(sid)))) throw introuvable('Sous-titres introuvables.');
    return reply.code(204).send();
  });
}
