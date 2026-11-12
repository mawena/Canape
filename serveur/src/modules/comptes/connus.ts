// Vie privée entre inconnus : quels comptes un viewer peut-il voir ou viser (partage, invitation à une séance) ?
// L'admin voit tout le monde ; un viewer voit lui-même, les admins et les comptes « connus » (partage d'un film dans
// un sens ou dans l'autre, séances en commun, celui qui l'a invité ou ceux qu'il a invités). Un compte trouvé par une
// recherche exacte d'identifiant reste « ciblable » 24 h (pour le partager ou l'inviter) sans devenir listé.
import type { Base } from '../../db/index.ts';

const DUREE_TROUVE_MS = 24 * 3_600_000;
/** Mémoire du processus : viewer -> (compte trouvé -> expiration). Perdue au redémarrage, sans gravité. */
const trouves = new Map<number, Map<number, number>>();

export function noterTrouve(viewerId: number, trouveId: number, maintenant = Date.now()): void {
  let m = trouves.get(viewerId);
  if (!m) trouves.set(viewerId, (m = new Map()));
  m.set(trouveId, maintenant + DUREE_TROUVE_MS);
  if (m.size > 200) for (const [k, exp] of m) if (exp <= maintenant) m.delete(k);
  if (trouves.size > 5000) for (const [v, mm] of trouves) { for (const [k, exp] of mm) if (exp <= maintenant) mm.delete(k); if (!mm.size) trouves.delete(v); }
}

const REQUETE_CONNUS = `
  SELECT id FROM utilisateurs WHERE role = 'admin' OR id = :moi
  UNION SELECT fp.utilisateur_id FROM films_partages fp JOIN films f ON f.id = fp.film_id WHERE f.proprietaire_id = :moi
  UNION SELECT f.proprietaire_id FROM films_partages fp JOIN films f ON f.id = fp.film_id WHERE fp.utilisateur_id = :moi
  UNION SELECT s.hote_id FROM seances s JOIN seances_participants p ON p.seance_id = s.id WHERE p.utilisateur_id = :moi
  UNION SELECT p.utilisateur_id FROM seances_participants p JOIN seances s ON s.id = p.seance_id WHERE s.hote_id = :moi
  UNION SELECT p2.utilisateur_id FROM seances_participants p1 JOIN seances_participants p2 ON p2.seance_id = p1.seance_id WHERE p1.utilisateur_id = :moi
  UNION SELECT cree_par FROM invitations WHERE type = 'compte' AND utilisateur_id = :moi AND cree_par IS NOT NULL
  UNION SELECT utilisateur_id FROM invitations WHERE type = 'compte' AND cree_par = :moi AND utilisateur_id IS NOT NULL`;

/** Identifiants des comptes actifs « connus » de ce viewer (lui compris). */
export function comptesConnus(db: Base, moiId: number): Set<number> {
  const l = db.prepare(`SELECT u.id FROM utilisateurs u WHERE u.actif = 1 AND u.id IN (${REQUETE_CONNUS})`)
    .all({ moi: moiId }) as Array<{ id: number }>;
  return new Set(l.map((r) => r.id));
}

/** Comptes qu'on peut viser pour un partage ou une invitation : tous les comptes actifs pour l'admin ; sinon les connus et les trouvés. */
export function comptesCiblables(db: Base, agent: { id: number; role: string }): Set<number> {
  if (agent.role === 'admin') {
    return new Set((db.prepare('SELECT id FROM utilisateurs WHERE actif = 1').all() as Array<{ id: number }>).map((r) => r.id));
  }
  const s = comptesConnus(db, agent.id);
  const maintenant = Date.now();
  for (const [id, exp] of trouves.get(agent.id) ?? []) {
    if (exp <= maintenant) continue;
    if (db.prepare('SELECT 1 FROM utilisateurs WHERE id = ? AND actif = 1').get(id)) s.add(id);
  }
  return s;
}
