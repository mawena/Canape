// Envies de films (phase 23) : accès à la table `envies`, partagé par la médiathèque (routes) et les séances (retrait une fois le film vu).
import type { EtatEnvie } from '@canape/partage';
import type { Base } from '../db/index.ts';

/**
 * Envies d'un film vues par `utilisateurId` : s'il en a envie, et combien de personnes en ont envie parmi lui et les
 * comptes `visibles` (ceux qu'il peut nommer : `comptesCiblables`). Les envies d'inconnus ne comptent pas, comme dans
 * `GET /api/envies` : le nombre affiché est toujours celui des personnes qu'on peut voir.
 */
export function etatEnvie(db: Base, filmId: string, utilisateurId: number, visibles: ReadonlySet<number>): EtatEnvie {
  const ids = (db.prepare('SELECT utilisateur_id AS id FROM envies WHERE film_id = ?').all(filmId) as Array<{ id: number }>).map((l) => l.id);
  return { filmId, moi: ids.includes(utilisateurId), nombre: ids.filter((id) => id === utilisateurId || visibles.has(id)).length };
}

/** Retire l'envie de ces personnes pour ce film (ils l'ont vu). Rend le nombre d'envies retirées. */
export function retirerEnvies(db: Base, filmId: string, utilisateurIds: number[]): number {
  let n = 0;
  const q = db.prepare('DELETE FROM envies WHERE film_id = ? AND utilisateur_id = ?');
  for (const id of utilisateurIds) n += Number(q.run(filmId, id).changes);
  return n;
}

/**
 * Fin d'une séance : les personnes présentes qui y ont vu le film jusqu'au bout n'ont plus envie de le voir.
 * Seule une progression notée pendant cette séance compte : qui avait déjà vu le film ailleurs et veut le revoir garde son envie.
 */
export function retirerEnviesDeSeance(db: Base, seanceId: string): number {
  const films = db.prepare(
    `SELECT DISTINCT g.film_id AS film_id FROM seances_programme g JOIN seances s ON s.id = g.seance_id
      WHERE s.id = ? AND g.rang <= s.rang_courant`,
  ).all(seanceId) as Array<{ film_id: string }>;
  let n = 0;
  for (const { film_id } of films) {
    const vus = db.prepare(
      `SELECT p.utilisateur_id AS id FROM progression p JOIN seances_presences r ON r.utilisateur_id = p.utilisateur_id AND r.seance_id = ?
        WHERE p.film_id = ? AND p.termine = 1 AND p.seance_id = r.seance_id`,
    ).all(seanceId, film_id) as Array<{ id: number }>;
    n += retirerEnvies(db, film_id, vus.map((v) => v.id));
  }
  return n;
}
