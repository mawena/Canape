// Téléversement tus 1.0 sur /api/televersement, branché sur Fastify (@tus/server + @tus/file-store).
import { AsyncLocalStorage } from 'node:async_hooks';
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import { ErreurHttp, interdit, nonConnecte } from '../../commun/erreurs.ts';
import { idBase32, maintenantIso } from '../../commun/identifiants.ts';
import { extensionVideoPlausible } from './noms.ts';
import type { Mediatheque } from './mediatheque.ts';

const PREFIXE = '/api/televersement';
/** Utilisateur de la requête tus en cours (lu par les hooks de @tus/server, qui s'exécutent dans le même contexte). */
const contexte = new AsyncLocalStorage<number>();
const INACTIVITE_MS = 24 * 3600_000;

/** Décode l'en-tête `Upload-Metadata` (`clé base64,clé base64`). */
export function lireMetadonnees(brut: string | undefined): Record<string, string> {
  const r: Record<string, string> = {};
  for (const part of (brut ?? '').split(',')) {
    const [cle, valeur] = part.trim().split(/\s+/);
    if (!cle) continue;
    try { r[cle] = valeur ? Buffer.from(valeur, 'base64').toString('utf8') : ''; } catch { r[cle] = ''; }
  }
  return r;
}

/** Octets déjà pris par l'utilisateur : films + envois en cours + téléchargements par torrent en cours (hors le téléchargement `sauf`). */
export function octetsUtilises(app: FastifyInstance, utilisateurId: number, sauf = ''): number {
  const a = app.db.prepare('SELECT COALESCE(SUM(taille), 0) AS n FROM films WHERE proprietaire_id = ?').get(utilisateurId) as { n: number };
  const b = app.db.prepare('SELECT COALESCE(SUM(taille), 0) AS n FROM televersements WHERE utilisateur_id = ?').get(utilisateurId) as { n: number };
  // Un torrent compte dès que la taille de ses fichiers choisis est connue ; une fois importé, ce sont les films qui comptent.
  const c = app.db.prepare(
    "SELECT COALESCE(SUM(octets_total), 0) AS n FROM telechargements WHERE proprietaire_id = ? AND id <> ? AND etat IN ('metadonnees', 'telechargement', 'pause')",
  ).get(utilisateurId, sauf) as { n: number };
  return a.n + b.n + c.n;
}

function idDeUrl(url: string): string | null {
  const chemin = (url.split('?')[0] ?? '');
  if (!chemin.startsWith(`${PREFIXE}/`)) return null;
  const id = decodeURIComponent(chemin.slice(PREFIXE.length + 1)).replace(/\/+$/, '');
  return id && !id.includes('/') ? id : null;
}

export function installerTeleversement(app: FastifyInstance, med: Mediatheque): void {
  const { config, db } = app;
  const magasin = new FileStore({ directory: config.televersements });

  const tus = new Server({
    path: PREFIXE,
    datastore: magasin,
    relativeLocation: true,
    maxSize: config.televersementMax,
    namingFunction: () => idBase32(16),
    async onUploadCreate(_req, upload) {
      const utilisateurId = contexte.getStore() ?? 0;
      if (!Number.isInteger(utilisateurId) || utilisateurId <= 0) throw { status_code: 401, body: 'Connexion requise.\n' };
      db.prepare('INSERT INTO televersements (id, utilisateur_id, nom, taille, cree_le) VALUES (?, ?, ?, ?, ?)')
        .run(upload.id, utilisateurId, upload.metadata?.['filename'] ?? '', upload.size ?? 0, maintenantIso());
      return {};
    },
    async onUploadFinish(_req, upload) {
      await terminer(upload.id, upload.metadata?.['filename'] ?? '');
      return {};
    },
  });

  async function terminer(id: string, nom: string): Promise<void> {
    const ligne = db.prepare('SELECT utilisateur_id FROM televersements WHERE id = ?').get(id) as { utilisateur_id: number } | undefined;
    const fichier = path.join(config.televersements, id);
    if (!ligne) return;
    try {
      await med.creerFilm({ proprietaireId: ligne.utilisateur_id, nomOrigine: nom || id, source: fichier });
    } finally {
      db.prepare('DELETE FROM televersements WHERE id = ?').run(id);
      await rm(`${fichier}.json`, { force: true });
    }
  }

  // Le corps d'un PATCH tus (application/offset+octet-stream) est lu directement par tus sur le flux brut.
  app.addContentTypeParser('application/offset+octet-stream', (_req, _payload, done) => done(null));

  const gestionnaire = async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
    if (req.method === 'OPTIONS') {
      reply.hijack();
      await tus.handle(req.raw, reply.raw);
      return;
    }
    const u = app.utilisateurOptionnel(req, reply);
    if (!u) throw nonConnecte();
    const id = idDeUrl(req.url);
    if (req.method === 'POST' && !id) {
      if (!u.peutTeleverser && u.role !== 'admin') throw interdit("Tu n'as pas le droit de téléverser des films.");
      const longueur = req.headers['upload-length'];
      if (typeof longueur !== 'string' || !/^\d+$/.test(longueur)) {
        throw new ErreurHttp(400, 'requete_invalide', "L'en-tête Upload-Length est obligatoire.");
      }
      const taille = Number(longueur);
      if (taille <= 0) throw new ErreurHttp(400, 'requete_invalide', 'Le fichier est vide.');
      if (taille > config.televersementMax) {
        throw new ErreurHttp(413, 'trop_volumineux', 'Ce fichier dépasse la taille maximale autorisée par le serveur.');
      }
      const meta = lireMetadonnees(req.headers['upload-metadata'] as string | undefined);
      const nom = (meta['filename'] ?? '').trim();
      if (!nom) throw new ErreurHttp(400, 'requete_invalide', 'Le nom du fichier est obligatoire (filename).');
      if (!extensionVideoPlausible(nom)) {
        throw new ErreurHttp(415, 'type_non_pris_en_charge', "Ce fichier n'a pas l'air d'une vidéo (extension non reconnue).");
      }
      if (u.role !== 'admin' && u.quotaOctets !== null && octetsUtilises(app, u.id) + taille > u.quotaOctets) {
        throw new ErreurHttp(507, 'quota_depasse', "Ton espace est plein : ce fichier dépasse ton quota.");
      }
    } else if (id) {
      // Reprise, envoi, terminaison : seulement par l'auteur (sinon 404, sans indice).
      const ligne = db.prepare('SELECT utilisateur_id FROM televersements WHERE id = ?').get(id) as { utilisateur_id: number } | undefined;
      if (!ligne || ligne.utilisateur_id !== u.id) throw new ErreurHttp(404, 'introuvable', 'Envoi introuvable.');
      if (req.method === 'DELETE') {
        // résilié par tus ; la ligne est retirée après
        reply.raw.once('close', () => { db.prepare('DELETE FROM televersements WHERE id = ?').run(id); });
      }
    }
    reply.hijack();
    await contexte.run(u.id, () => tus.handle(req.raw, reply.raw));
  };

  for (const route of [PREFIXE, `${PREFIXE}/*`]) {
    app.route({ method: ['POST', 'PATCH', 'HEAD', 'DELETE', 'OPTIONS'], url: route, handler: gestionnaire });
  }

  /** Supprime les envois sans activité depuis plus de 24 h (et les fichiers orphelins). */
  async function nettoyer(): Promise<number> {
    let n = 0;
    const limite = Date.now() - INACTIVITE_MS;
    const lignes = db.prepare('SELECT id, cree_le FROM televersements').all() as Array<{ id: string; cree_le: string }>;
    const connus = new Set(lignes.map((l) => l.id));
    for (const l of lignes) {
      const f = path.join(config.televersements, l.id);
      const m = await stat(f).then((s) => s.mtimeMs, () => Date.parse(l.cree_le));
      if (m < limite) {
        await rm(f, { force: true });
        await rm(`${f}.json`, { force: true });
        db.prepare('DELETE FROM televersements WHERE id = ?').run(l.id);
        n++;
      }
    }
    for (const nom of await readdir(config.televersements).catch(() => [] as string[])) {
      const id = nom.replace(/\.json$/, '');
      if (connus.has(id)) continue;
      const m = await stat(path.join(config.televersements, nom)).then((s) => s.mtimeMs, () => Date.now());
      if (m < limite) { await rm(path.join(config.televersements, nom), { force: true }); n++; }
    }
    return n;
  }
  med.nettoyerTeleversements = nettoyer;

  const minuteur = setInterval(() => { nettoyer().catch((e) => app.log.warn({ err: e }, 'nettoyage des envois')); }, 3600_000);
  minuteur.unref();
  app.addHook('onClose', async () => clearInterval(minuteur));
}
