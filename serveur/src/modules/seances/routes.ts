// Routes REST du module séances.
import type { FastifyInstance } from 'fastify';
import { MAX_FILMS_PROGRAMME, construireIcs, nomFichierAgenda, type ListeSeances, type ReponseIce, type ReponseLienSeance, type Seance, type Souvenir } from '@canape/partage';
import { ErreurHttp, introuvable, requeteInvalide } from '../../commun/erreurs.ts';
import { idBase32, jetonAleatoire, maintenantIso, sha256Hex } from '../../commun/identifiants.ts';
import { transaction } from '../../db/index.ts';
import { comptesCiblables } from '../comptes/connus.ts';
import { accesSeance, ligneSeance, messagesDe, poserFilmCourant, progressions, remplacerAVenir, versSeance, type LigneSeance } from './depot.ts';
import type { Salles } from './salles.ts';
import { estNote, estParticipant, poserNote, souvenirDe } from './souvenirs.ts';
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

/** Liste d'identifiants de films (1 à `MAX_FILMS_PROGRAMME` ; `vide` : une liste vide est permise), sans doublon, dans l'ordre. */
function listeFilms(v: unknown, vide: boolean): string[] {
  if (!Array.isArray(v) || v.length > MAX_FILMS_PROGRAMME || (!vide && v.length === 0) || !v.every((x) => typeof x === 'string')) {
    throw requeteInvalide(`Liste de films invalide (${vide ? '0' : '1'} à ${MAX_FILMS_PROGRAMME} films).`);
  }
  return [...new Set(v as string[])];
}

const SIX_HEURES = 6 * 3_600_000;

export function enregistrerRoutes(app: FastifyInstance, salles: Salles): void {
  const db = app.db;
  const pre = { preHandler: app.exigerConnexion };

  function verifierInvites(ids: number[], hoteId: number, agent: { id: number; role: string }): number[] {
    const sains = ids.filter((i) => i !== hoteId);
    // Même réponse pour un compte absent et pour un compte qu'on n'a pas le droit de viser (pas d'énumération).
    const permis = comptesCiblables(db, agent);
    for (const i of sains) {
      if (!permis.has(i)) throw requeteInvalide('Invité inconnu.');
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
    // `filmIds` : le programme d'une soirée (le premier film est lancé d'abord) ; `filmId` : une séance d'un seul film.
    let filmIds: string[];
    if (c['filmIds'] !== undefined) filmIds = listeFilms(c['filmIds'], false);
    else if (typeof c['filmId'] === 'string') filmIds = [c['filmId']];
    else throw requeteInvalide('Film requis.');
    for (const fid of filmIds) {
      const f = app.mediatheque.obtenir(fid);
      if (!f || !app.mediatheque.peutVoir(u, f.id)) throw introuvable('Film introuvable.');
    }
    const premier = filmIds[0] as string;
    const titre = c['titre'] === undefined ? null : titreValide(c['titre']);
    const prevueLe = c['prevueLe'] === undefined ? null : dateValide(c['prevueLe']);
    const invites = verifierInvites(c['invites'] === undefined ? [] : listeIds(c['invites']), u.id, u);
    const id = idBase32();
    transaction(db, () => {
      db.prepare('INSERT INTO seances (id, hote_id, film_id, titre, prevue_le, position, cree_le) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .run(id, u.id, premier, titre, prevueLe, maintenantIso());
      const prog = db.prepare('INSERT INTO seances_programme (seance_id, rang, film_id) VALUES (?, ?, ?)');
      filmIds.forEach((fid, i) => prog.run(id, i, fid));
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
    const invites = c['invites'] === undefined ? undefined : verifierInvites(listeIds(c['invites']), ligne.hote_id, u);
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
        poserFilmCourant(app, ligne.id, filmId);
      }
    });
    if (filmId !== undefined && filmId !== ligne.film_id) salles.changerFilm(ligne.id, filmId);
    // L'hôte termine la séance : l'écran de fin s'ouvre dans la salle.
    if (c['terminee'] === true && ligne.terminee_le === null) salles.diffuserSouvenir(ligne.id, true);
    return sortie(ligneSeance(app, ligne.id)!);
  });

  // ---- Programme de la soirée : l'hôte remplace les films à venir (après le film en cours) ----
  app.put<{ Params: { id: string } }>('/api/seances/:id/programme', pre, async (req): Promise<Seance> => {
    const u = req.utilisateur;
    const { ligne, role } = accesSeance(app, req.params.id, u);
    exigerHote(role);
    const filmIds = listeFilms(corps(req)['filmIds'], true);
    for (const fid of filmIds) {
      const f = app.mediatheque.obtenir(fid);
      if (!f || !app.mediatheque.peutVoir(u, f.id)) throw introuvable('Film introuvable.');
    }
    // Le film en cours compte dans la limite.
    if (filmIds.length + 1 > MAX_FILMS_PROGRAMME) throw requeteInvalide(`Une soirée compte ${MAX_FILMS_PROGRAMME} films au plus.`);
    transaction(db, () => remplacerAVenir(app, ligne.id, filmIds));
    salles.diffuserProgramme(ligne.id);
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

  // ---- Souvenir et note d'un mot (réservés à l'hôte et aux personnes invitées) ----
  function exigerParticipant(id: string, u: { id: number }): void {
    // Même réponse qu'une séance inconnue : pas d'indice d'existence.
    if (!/^[a-z2-7]{12}$/.test(id) || !estParticipant(app, id, u.id)) throw introuvable('Séance introuvable.');
  }

  app.get<{ Params: { id: string } }>('/api/seances/:id/souvenir', pre, async (req): Promise<Souvenir> => {
    exigerParticipant(req.params.id, req.utilisateur);
    salles.enregistrerSeance(req.params.id);
    const s = souvenirDe(app, req.params.id);
    if (!s) throw introuvable('Séance introuvable.');
    return s;
  });

  app.put<{ Params: { id: string } }>('/api/seances/:id/note', pre, async (req): Promise<Souvenir> => {
    exigerParticipant(req.params.id, req.utilisateur);
    const c = corps(req);
    const note = c['note'];
    if (note !== null && !estNote(note)) throw requeteInvalide('Note invalide (coeur, bien ou bof).');
    poserNote(app, req.params.id, req.utilisateur.id, note, maintenantIso());
    salles.diffuserSouvenir(req.params.id, false);
    return souvenirDe(app, req.params.id)!;
  });

  // ---- Agenda (.ics) : hôte et personnes invitées, séance avec une date prévue ----
  app.get<{ Params: { id: string } }>('/api/seances/:id/agenda.ics', pre, async (req, reply) => {
    exigerParticipant(req.params.id, req.utilisateur);
    const l = ligneSeance(app, req.params.id);
    if (!l || l.prevue_le === null) throw introuvable('Cette séance n\'a pas de date prévue.');
    const film = l.film_id ? app.mediatheque.obtenir(l.film_id) : null;
    const texte = construireIcs({
      seanceId: l.id, hoteUid: new URL(app.config.urlPublique).host, titre: l.titre, filmTitre: l.film_titre,
      prevueLe: l.prevue_le, dureeSecondes: film?.duree ?? null, url: `${app.config.urlPublique}/seances/${l.id}`, maintenant: new Date(),
    });
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${nomFichierAgenda(l.id)}"`)
      .header('Cache-Control', 'private, no-store')
      .send(texte);
  });

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
