import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { COOKIE_SESSION, type Role, type Utilisateur } from '@canape/partage';
import type { Config } from '../config.ts';
import type { Base } from '../db/index.ts';
import { interdit, nonConnecte } from './erreurs.ts';
import { jetonAleatoire, maintenantIso, sha256Hex } from './identifiants.ts';

export const SESSION_JOURS = 30;
const MS_JOUR = 86_400_000;
/** La date de vue n'est réécrite (et le cookie renouvelé) qu'au bout de ce délai. */
const RENOUVELLEMENT_MS = 10 * 60_000;

/** L'utilisateur connecté, tel que posé sur `request.utilisateur`. */
export interface UtilisateurConnecte extends Utilisateur {
  /** Identifiant de session (SHA-256 du jeton du cookie). */
  sessionId: string;
}

export interface LigneUtilisateur {
  id: number;
  prenom: string;
  identifiant: string;
  role: Role;
  peut_televerser: number;
  quota_octets: number | null;
  actif: number;
  couleur: string | null;
  cree_le: string;
  derniere_connexion: string | null;
}

/** Ligne SQL `utilisateurs` → `Utilisateur` (sans le mot de passe). */
export function versUtilisateur(l: LigneUtilisateur): Utilisateur {
  return {
    id: l.id,
    prenom: l.prenom,
    identifiant: l.identifiant,
    role: l.role,
    peutTeleverser: l.peut_televerser === 1,
    quotaOctets: l.quota_octets,
    couleur: l.couleur,
    creeLe: l.cree_le,
    derniereConnexion: l.derniere_connexion,
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Renseigné après `app.exigerConnexion` / `app.exigerAdmin` (ou `app.utilisateurOptionnel`). */
    utilisateur: UtilisateurConnecte;
  }
  interface FastifyInstance {
    config: Config;
    db: Base;
    /** `preHandler` : 401 sans session valide ; pose `request.utilisateur`. */
    exigerConnexion: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** `preHandler` : 401 sans session, 403 si le compte n'est pas admin. */
    exigerAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Utilisateur de la session si le cookie est valide, sinon `null` (ne lève jamais). Pose `request.utilisateur`. */
    utilisateurOptionnel: (req: FastifyRequest, reply?: FastifyReply) => UtilisateurConnecte | null;
  }
}

export function optionsCookieSession(config: Config, expire: Date) {
  return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: config.https, expires: expire };
}

/**
 * Crée une session pour `utilisateurId` et rend le jeton en clair (seul son SHA-256 est stocké).
 * Si `reply` est fourni, pose le cookie `canape_session`.
 */
export function creerSession(
  utilisateurId: number,
  req: FastifyRequest,
  reply?: FastifyReply,
): { jeton: string; expireLe: string } {
  const { db, config } = req.server;
  const jeton = jetonAleatoire();
  const maintenant = new Date();
  const expire = new Date(maintenant.getTime() + SESSION_JOURS * MS_JOUR);
  db.prepare(
    'INSERT INTO sessions (id, utilisateur_id, cree_le, expire_le, vu_le, agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    sha256Hex(jeton), utilisateurId, maintenantIso(maintenant), maintenantIso(expire), maintenantIso(maintenant),
    (req.headers['user-agent'] ?? '').slice(0, 300) || null, req.ip || null,
  );
  reply?.setCookie(COOKIE_SESSION, jeton, optionsCookieSession(config, expire));
  return { jeton, expireLe: maintenantIso(expire) };
}

/** Supprime la session du cookie de la requête et, si `reply` est fourni, efface le cookie. */
export function supprimerSession(req: FastifyRequest, reply?: FastifyReply): void {
  const jeton = req.cookies?.[COOKIE_SESSION];
  if (jeton) req.server.db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256Hex(jeton));
  reply?.clearCookie(COOKIE_SESSION, { path: '/' });
}

/** Supprime toutes les sessions d'un compte (désactivation, changement de mot de passe, réinitialisation). */
export function supprimerSessionsUtilisateur(db: Base, utilisateurId: number, sauf?: string): void {
  if (sauf) db.prepare('DELETE FROM sessions WHERE utilisateur_id = ? AND id <> ?').run(utilisateurId, sauf);
  else db.prepare('DELETE FROM sessions WHERE utilisateur_id = ?').run(utilisateurId);
}

function chercherSession(app: FastifyInstance, req: FastifyRequest, reply?: FastifyReply): UtilisateurConnecte | null {
  const jeton = req.cookies?.[COOKIE_SESSION];
  if (!jeton || typeof jeton !== 'string') return null;
  const id = sha256Hex(jeton);
  const ligne = app.db
    .prepare(
      `SELECT u.*, s.expire_le AS s_expire, s.vu_le AS s_vu
         FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur_id
        WHERE s.id = ? AND u.actif = 1`,
    )
    .get(id) as (LigneUtilisateur & { s_expire: string; s_vu: string }) | undefined;
  if (!ligne) return null;
  const maintenant = Date.now();
  if (Date.parse(ligne.s_expire) <= maintenant) {
    app.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  // Expiration glissante : 30 jours à partir de la dernière activité.
  if (maintenant - Date.parse(ligne.s_vu) > RENOUVELLEMENT_MS) {
    const expire = new Date(maintenant + SESSION_JOURS * MS_JOUR);
    app.db.prepare('UPDATE sessions SET vu_le = ?, expire_le = ? WHERE id = ?').run(maintenantIso(), maintenantIso(expire), id);
    reply?.setCookie(COOKIE_SESSION, jeton, optionsCookieSession(app.config, expire));
  }
  const u: UtilisateurConnecte = { ...versUtilisateur(ligne), sessionId: id };
  req.utilisateur = u;
  return u;
}

/** Enregistre `app.exigerConnexion`, `app.exigerAdmin`, `app.utilisateurOptionnel`, `request.utilisateur`. */
export function installerAuth(app: FastifyInstance): void {
  app.decorateRequest('utilisateur', undefined as unknown as UtilisateurConnecte);
  app.decorate('utilisateurOptionnel', (req: FastifyRequest, reply?: FastifyReply) => chercherSession(app, req, reply));
  app.decorate('exigerConnexion', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!chercherSession(app, req, reply)) throw nonConnecte();
  });
  app.decorate('exigerAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    const u = chercherSession(app, req, reply);
    if (!u) throw nonConnecte();
    if (u.role !== 'admin') throw interdit('Réservé aux administrateurs.');
  });
}
