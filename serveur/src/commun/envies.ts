// Envies de films (phase 23) : accès à la table `envies`, partagé par la médiathèque (routes) et les séances (retrait une fois le film vu).
import type { EtatEnvie } from '@canape/partage';
import type { Base } from '../db/index.ts';

/** Nombre d'envies d'un film et si `utilisateurId` en fait partie. */
export function etatEnvie(db: Base, filmId: string, utilisateurId: number): EtatEnvie {
  const l = db.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(utilisateur_id = ?), 0) AS moi FROM envies WHERE film_id = ?',
  ).get(utilisateurId, filmId) as { n: number; moi: number };
  return { filmId, moi: l.moi > 0, nombre: l.n };
}

/** Retire l'envie de ces personnes pour ce film (ils l'ont vu). Rend le nombre d'envies retirées. */
export function retirerEnvies(db: Base, filmId: string, utilisateurIds: number[]): number {
  let n = 0;
  const q = db.prepare('DELETE FROM envies WHERE film_id = ? AND utilisateur_id = ?');
  for (const id of utilisateurIds) n += Number(q.run(filmId, id).changes);
  return n;
}

/** Fin d'une séance : les personnes présentes qui ont vu le film jusqu'au bout n'ont plus envie de le voir. */
export function retirerEnviesDeSeance(db: Base, seanceId: string): number {
  const films = db.prepare(
    `SELECT DISTINCT g.film_id AS film_id FROM seances_programme g JOIN seances s ON s.id = g.seance_id
      WHERE s.id = ? AND g.rang <= s.rang_courant`,
  ).all(seanceId) as Array<{ film_id: string }>;
  let n = 0;
  for (const { film_id } of films) {
    const vus = db.prepare(
      `SELECT p.utilisateur_id AS id FROM progression p JOIN seances_presences r ON r.utilisateur_id = p.utilisateur_id AND r.seance_id = ?
        WHERE p.film_id = ? AND p.termine = 1`,
    ).all(seanceId, film_id) as Array<{ id: number }>;
    n += retirerEnvies(db, film_id, vus.map((v) => v.id));
  }
  return n;
}
