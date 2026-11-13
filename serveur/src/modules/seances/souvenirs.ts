// Souvenirs de séance : présents, temps passé ensemble, note d'un mot de chacun.
import type { FastifyInstance } from 'fastify';
import { NOTES_SEANCE, type NoteSeance, type PresentSouvenir, type Souvenir } from '@canape/partage';

/** `true` si `v` est une des notes permises. */
export function estNote(v: unknown): v is NoteSeance {
  return typeof v === 'string' && (NOTES_SEANCE as readonly string[]).includes(v);
}

/** L'hôte ou une personne invitée (les administrateurs n'ont pas de souvenir dans une séance qui n'est pas la leur). */
export function estParticipant(app: FastifyInstance, seanceId: string, utilisateurId: number): boolean {
  return app.db.prepare(
    `SELECT 1 AS x FROM seances s WHERE s.id = ? AND (s.hote_id = ? OR EXISTS
       (SELECT 1 FROM seances_participants p WHERE p.seance_id = s.id AND p.utilisateur_id = ?))`,
  ).get(seanceId, utilisateurId, utilisateurId) !== undefined;
}

/** Note la présence d'une personne dans la salle (la première fois seulement). */
export function noterPresence(app: FastifyInstance, seanceId: string, utilisateurId: number, quand: string): void {
  app.db.prepare('INSERT OR IGNORE INTO seances_presences (seance_id, utilisateur_id, premiere_le) VALUES (?, ?, ?)').run(seanceId, utilisateurId, quand);
}

interface LigneSouvenir {
  id: string; film_id: string | null; film_titre: string | null; titre: string | null;
  cree_le: string; terminee_le: string | null; ensemble_secondes: number; nb_films: number;
}
interface LignePersonne { id: number; prenom: string; couleur: string | null; present: number; note: NoteSeance | null }

/** Le souvenir d'une séance, ou `null` si elle n'existe pas. Aucun contrôle d'accès ici. */
export function souvenirDe(app: FastifyInstance, seanceId: string): Souvenir | null {
  const l = app.db.prepare(
    `SELECT s.id, s.film_id, f.titre AS film_titre, s.titre, s.cree_le, s.terminee_le, s.ensemble_secondes,
            (SELECT COUNT(*) FROM seances_programme g WHERE g.seance_id = s.id AND g.rang <= s.rang_courant) AS nb_films
       FROM seances s LEFT JOIN films f ON f.id = s.film_id WHERE s.id = ?`,
  ).get(seanceId) as LigneSouvenir | undefined;
  if (!l) return null;
  const personnes = app.db.prepare(
    `SELECT u.id, u.prenom, u.couleur, (p.utilisateur_id IS NOT NULL) AS present, n.note
       FROM utilisateurs u
       LEFT JOIN seances_presences p ON p.seance_id = ?1 AND p.utilisateur_id = u.id
       LEFT JOIN seances_notes n ON n.seance_id = ?1 AND n.utilisateur_id = u.id
      WHERE p.utilisateur_id IS NOT NULL OR n.utilisateur_id IS NOT NULL
      ORDER BY (p.utilisateur_id IS NULL), p.premiere_le, n.notee_le, u.prenom COLLATE NOCASE`,
  ).all(seanceId) as unknown as LignePersonne[];
  return {
    seanceId: l.id, filmId: l.film_id, filmTitre: l.film_titre, titre: l.titre, creeLe: l.cree_le, termineeLe: l.terminee_le,
    secondesEnsemble: Math.max(0, Math.round(l.ensemble_secondes)), nbFilms: l.nb_films,
    personnes: personnes.map((p): PresentSouvenir => ({
      utilisateur: { id: p.id, prenom: p.prenom, couleur: p.couleur }, present: p.present === 1, note: p.note,
    })),
  };
}

/** Écrit (ou efface, avec `null`) la note de `utilisateurId`. */
export function poserNote(app: FastifyInstance, seanceId: string, utilisateurId: number, note: NoteSeance | null, quand: string): void {
  if (note === null) {
    app.db.prepare('DELETE FROM seances_notes WHERE seance_id = ? AND utilisateur_id = ?').run(seanceId, utilisateurId);
    return;
  }
  app.db.prepare(
    `INSERT INTO seances_notes (seance_id, utilisateur_id, note, notee_le) VALUES (?, ?, ?, ?)
     ON CONFLICT (seance_id, utilisateur_id) DO UPDATE SET note = excluded.note, notee_le = excluded.notee_le`,
  ).run(seanceId, utilisateurId, note, quand);
}
