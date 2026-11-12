// Routes REST du module séances.
import type { FastifyInstance } from 'fastify';
import type { ListeSeances, ReponseIce, ReponseLienSeance, Seance } from '@canape/partage';
import { ErreurHttp, introuvable, requeteInvalide } from '../../commun/erreurs.ts';
import { idBase32, jetonAleatoire, maintenantIso, sha256Hex } from '../../commun/identifiants.ts';
import { transaction } from '../../db/index.ts';
import { accesSeance, ligneSeance, messagesDe, progressions, versSeance, type LigneSeance } from './depot.ts';
import type { Salles } from './salles.ts';
import { serveursIce } from './turn.ts';

type Corps = Record<string, unknown>;

function corps(req: { body: unknown }): Corps {
  if (req.body === undefined || req.body === null) return {};
  if (typeof req.body !== 'object' || Array.isArray(req.body)) throw requeteInvalide();
  return req.body as Corps;
}

function titreValide(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw requeteInvalide('Titre invalide.');
  const t = v.trim();
  if (t.length > 120) throw requeteInvalide('Titre trop long (120 caractères au plus).');
  return t === '' ? null : t;
}

function dateValide(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw requeteInvalide('Date invalide.');
  return new Date(v).toISOString();
}

function listeIds(v: unknown): number[] {
  if (!Array.isArray(v) || v.length > 50 || !v.every((x) => Number.isInteger(x) && x > 0)) throw requeteInvalide('Liste d\'invités invalide.');
  return [...new Set(v as number[])];
}

const SIX_HEURES = 6 * 3_600_000;

export function enregistrerRoutes(app: FastifyInstance, salles: Salles): void {
  const db = app.db;
  const pre = { preHandler: app.exigerConnexion };

  function verifierInvites(ids: number[], hoteId: number): number[] {
    const sains = ids.filter((i) => i !== hoteId);
    for (const i of sains) {
      if (!db.prepare('SELECT 1 AS x FROM utilisateurs WHERE id = ? AND actif = 1').get(i)) throw requeteInvalide('Invité inconnu.');
    }
    return sains;
  }

  function remplacerInvites(seanceId: string, ids: number[]): void {
    db.prepare('DELETE FROM seances_participants WHERE seance_id = ?').run(seanceId);
    const ins = db.prepare('INSERT INTO seances_participants (seance_id, utilisateur_id) VALUES (?, ?)');
    for (const i of ids) ins.run(seanceId, i);
  }

  const sortie = (l: LigneSeance): Seance => versSeance(app, l, salles.presents(l.id));

  // ---- Liste ----
  app.get('/api/seances', pre, async (req): Promise<ListeSeances> => {
    const u = req.utilisateur;
    const lignes = db.prepare(
      `SELECT s.id FROM seances s WHERE s.hote_id = ? OR EXISTS
         (SELECT 1 FROM seances_participants p WHERE p.seance_id = s.id AND p.utilisateur_id = ?)
       ORDER BY s.cree_le DESC`,
    ).all(u.id, u.id) as Array<{ id: string }>;
    const toutes = lignes.map((l) => ligneSeance(app, l.id)).filter((l): l is LigneSeance => l !== null);
    const maintenant = Date.now();
    const aVenir: Seance[] = []; const enCours: Seance[] = []; const recentes: Seance[] = [];
    for (const l of toutes) {
      const s = sortie(l);
      if (l.terminee_le === null && s.presents > 0) enCours.push(s);
      else if (l.terminee_le === null && l.position === 0 && (l.prevue_le === null || Date.parse(l.prevue_le) >= maintenant - SIX_HEURES)) aVenir.push(s);
      else recentes.push(s);
    }
    aVenir.sort((a, b) => (a.prevueLe ?? '9999').localeCompare(b.prevueLe ?? '9999') || b.creeLe.localeCompare(a.creeLe));
    return { aVenir, enCours, recentes: recentes.slice(0, 20) };
  });

  // ---- Création ----
  app.post('/api/seances', pre, async (req, reply): Promise<Seance> => {
    const u = req.utilisateur;
    const c = corps(req);
    if (typeof c['filmId'] !== 'string') throw requeteInvalide('Film requis.');
    const film = app.mediatheque.obtenir(c['filmId']);
    if (!film || !app.mediatheque.peutVoir(u, film.id)) throw introuvable('Film introuvable.');
    const titre = c['titre'] === undefined ? null : titreValide(c['titre']);
    const prevueLe = c['prevueLe'] === undefined ? null : dateValide(c['prevueLe']);
    const invites = verifierInvites(c['invites'] === undefined ? [] : listeIds(c['invites']), u.id);
    const id = idBase32();
    transaction(db, () => {
      db.prepare('INSERT INTO seances (id, hote_id, film_id, titre, prevue_le, position, cree_le) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .run(id, u.id, film.id, titre, prevueLe, maintenantIso());
      remplacerInvites(id, invites);
    });
    reply.status(201);
    return sortie(ligneSeance(app, id)!);
  });

  // ---- Détail, modification, suppression ----
  app.get<{ Params: { id: string } }>('/api/seances/:id', pre, async (req) => sortie(accesSeance(app, req.params.id, req.utilisateur).ligne));

  function exigerHote(role: string): void {
    if (role !== 'hote' && role !== 'admin') throw new ErreurHttp(403, 'interdit', "Seul l'hôte peut faire cela.");
  }

  app.patch<{ Params: { id: string } }>('/api/seances/:id', pre, async (req) => {
    const u = req.utilisateur;
    const { ligne, role } = accesSeance(app, req.params.id, u);
    exigerHote(role);
    const c = corps(req);
    let filmId: string | undefined;
    if (c['filmId'] !== undefined) {
      if (typeof c['filmId'] !== 'string') throw requeteInvalide('Film invalide.');
      const film = app.mediatheque.obtenir(c['filmId']);
      if (!film || !app.mediatheque.peutVoir(u, film.id)) throw introuvable('Film introuvable.');
      filmId = film.id;
    }
    const titre = c['titre'] === undefined ? undefined : titreValide(c['titre']);
    const prevueLe = c['prevueLe'] === undefined ? undefined : dateValide(c['prevueLe']);
    const invites = c['invites'] === undefined ? undefined : verifierInvites(listeIds(c['invites']), ligne.hote_id);
    if (c['terminee'] !== undefined && typeof c['terminee'] !== 'boolean') throw requeteInvalide();
    transaction(db, () => {
      if (titre !== undefined) db.prepare('UPDATE seances SET titre = ? WHERE id = ?').run(titre, ligne.id);
      if (prevueLe !== undefined) db.prepare('UPDATE seances SET prevue_le = ? WHERE id = ?').run(prevueLe, ligne.id);
      if (invites !== undefined) remplacerInvites(ligne.id, invites);
      if (typeof c['terminee'] === 'boolean') {
        db.prepare('UPDATE seances SET terminee_le = ? WHERE id = ?').run(c['terminee'] ? maintenantIso() : null, ligne.id);
      }
      if (filmId !== undefined && filmId !== ligne.film_id) {
        db.prepare('UPDATE seances SET film_id = ?, position = 0, piste_audio = NULL, sous_titres = NULL WHERE id = ?').run(filmId, ligne.id);
      }
    });
    if (filmId !== undefined && filmId !== ligne.film_id) salles.changerFilm(ligne.id, filmId);
    return sortie(ligneSeance(app, ligne.id)!);
  });

  app.delete<{ Params: { id: string } }>('/api/seances/:id', pre, async (req, reply) => {
    const { ligne, role } = accesSeance(app, req.params.id, req.utilisateur);
    exigerHote(role);
    db.prepare('DELETE FROM seances WHERE id = ?').run(ligne.id);
    salles.fermerSeance(ligne.id);
    return reply.status(204).send();
  });

  // ---- Lien ----
  app.post<{ Params: { id: string } }>('/api/seances/:id/lien', pre, async (req, reply): Promise<ReponseLienSeance> => {
    const { ligne, role } = accesSeance(app, req.params.id, req.utilisateur);
    exigerHote(role);
    // Lien stable : un lien existant est redonné (il a peut-être déjà été envoyé) ; sinon il est créé.
    const existant = db.prepare('SELECT lien_jeton FROM seances WHERE id = ? AND lien_hash IS NOT NULL').get(ligne.id) as { lien_jeton: string | null } | undefined;
    let jeton = existant?.lien_jeton ?? null;
    if (jeton) {
      reply.status(200);
    } else {
      jeton = jetonAleatoire();
      db.prepare('UPDATE seances SET lien_hash = ?, lien_jeton = ? WHERE id = ?').run(sha256Hex(jeton), jeton, ligne.id);
      reply.status(201);
    }
    return { lien: `${app.config.urlPublique}/rejoindre/${jeton}` };
  });

  app.delete<{ Params: { id: string } }>('/api/seances/:id/lien', pre, async (req, reply) => {
    const { ligne, role } = accesSeance(app, req.params.id, req.utilisateur);
    exigerHote(role);
    db.prepare('UPDATE seances SET lien_hash = NULL, lien_jeton = NULL WHERE id = ?').run(ligne.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { jeton: string } }>(
    '/api/rejoindre/:jeton',
    { ...pre, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const jeton = req.params.jeton;
      const l = typeof jeton === 'string' && jeton.length <= 200
        ? (db.prepare('SELECT id, hote_id FROM seances WHERE lien_hash = ? AND terminee_le IS NULL').get(sha256Hex(jeton)) as { id: string; hote_id: number } | undefined)
        : undefined;
      if (!l) throw introuvable('Ce lien ne fonctionne plus.');
      if (l.hote_id !== req.utilisateur.id) {
        db.prepare('INSERT OR IGNORE INTO seances_participants (seance_id, utilisateur_id) VALUES (?, ?)').run(l.id, req.utilisateur.id);
      }
      return { seanceId: l.id };
    },
  );

  // ---- Messages ----
  app.get<{ Params: { id: string }; Querystring: { avant?: string; limite?: string } }>('/api/seances/:id/messages', pre, async (req) => {
    const { ligne } = accesSeance(app, req.params.id, req.utilisateur);
    const avant = req.query.avant === undefined ? null : Number(req.query.avant);
    if (avant !== null && (!Number.isInteger(avant) || avant < 1)) throw requeteInvalide();
    const limite = req.query.limite === undefined ? 50 : Number(req.query.limite);
    if (!Number.isInteger(limite) || limite < 1) throw requeteInvalide();
    return messagesDe(app, ligne.id, avant, Math.min(limite, 100));
  });

  // ---- Reprise, historique ----
  app.get('/api/reprendre', pre, async (req) => progressions(app, req.utilisateur, 'reprise', 20));
  app.get('/api/historique', pre, async (req) => progressions(app, req.utilisateur, 'historique', 100));

  // ---- ICE ----
  app.get('/api/ice', pre, async (): Promise<ReponseIce> => ({ iceServers: serveursIce(app.config) }));
}
