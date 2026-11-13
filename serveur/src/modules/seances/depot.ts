// Accès à la base pour les séances (lignes SQL <-> types du partage).
import { statSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Film, MessageChat, MessageChatWs, ProgressionFilm, Seance, UtilisateurPublic } from '@canape/partage';
import type { UtilisateurConnecte } from '../../commun/auth.ts';
import { introuvable } from '../../commun/erreurs.ts';
import { estParticipant, souvenirDe } from './souvenirs.ts';

export interface LigneSeance {
  id: string;
  hote_id: number;
  film_id: string | null;
  titre: string | null;
  prevue_le: string | null;
  lien_hash: string | null;
  piste_audio: number | null;
  sous_titres: string | null;
  position: number;
  cree_le: string;
  terminee_le: string | null;
  hote_prenom: string;
  film_titre: string | null;
}

const SELECT_SEANCE = `SELECT s.*, h.prenom AS hote_prenom, f.titre AS film_titre
  FROM seances s JOIN utilisateurs h ON h.id = s.hote_id LEFT JOIN films f ON f.id = s.film_id`;

export function ligneSeance(app: FastifyInstance, id: string): LigneSeance | null {
  return (app.db.prepare(`${SELECT_SEANCE} WHERE s.id = ?`).get(id) as LigneSeance | undefined) ?? null;
}

export function invitesDe(app: FastifyInstance, seanceId: string): UtilisateurPublic[] {
  return (app.db.prepare(
    `SELECT u.id, u.prenom, u.couleur FROM seances_participants p JOIN utilisateurs u ON u.id = p.utilisateur_id
      WHERE p.seance_id = ? ORDER BY u.prenom COLLATE NOCASE`,
  ).all(seanceId) as unknown as UtilisateurPublic[]).map((u) => ({ id: u.id, prenom: u.prenom, couleur: u.couleur }));
}

export function versSeance(app: FastifyInstance, l: LigneSeance, presents: number): Seance {
  // Film supprimé (la clé étrangère a vidé `film_id`) : position et pistes n'ont plus de sens.
  if (l.film_id === null) l = { ...l, position: 0, piste_audio: null, sous_titres: null };
  return {
    id: l.id, hoteId: l.hote_id, hotePrenom: l.hote_prenom, filmId: l.film_id, filmTitre: l.film_titre,
    titre: l.titre, prevueLe: l.prevue_le, aUnLien: l.lien_hash !== null, pisteAudio: l.piste_audio,
    sousTitres: l.sous_titres, position: l.position, creeLe: l.cree_le, termineeLe: l.terminee_le,
    invites: invitesDe(app, l.id), presents,
  };
}

export type RoleSeance = 'hote' | 'participant' | 'admin';

/** Rôle de l'utilisateur dans la séance, ou `null` (aucun droit). */
export function roleDans(app: FastifyInstance, l: Pick<LigneSeance, 'id' | 'hote_id'>, u: Pick<UtilisateurConnecte, 'id' | 'role'>): RoleSeance | null {
  if (l.hote_id === u.id) return 'hote';
  const p = app.db.prepare('SELECT 1 AS x FROM seances_participants WHERE seance_id = ? AND utilisateur_id = ?').get(l.id, u.id);
  if (p) return 'participant';
  return u.role === 'admin' ? 'admin' : null;
}

/** Séance + rôle, ou 404 (pas d'indice d'existence). */
export function accesSeance(app: FastifyInstance, id: string, u: UtilisateurConnecte): { ligne: LigneSeance; role: RoleSeance } {
  const ligne = typeof id === 'string' && /^[a-z2-7]{12}$/.test(id) ? ligneSeance(app, id) : null;
  const role = ligne ? roleDans(app, ligne, u) : null;
  if (!ligne || !role) throw introuvable('Séance introuvable.');
  return { ligne, role };
}

export function messagesDe(app: FastifyInstance, seanceId: string, avant: number | null, limite: number): MessageChat[] {
  const lignes = app.db.prepare(
    `SELECT m.id, m.utilisateur_id, u.prenom, m.texte, m.position, m.envoye_le
       FROM messages m LEFT JOIN utilisateurs u ON u.id = m.utilisateur_id
      WHERE m.seance_id = ? AND (? IS NULL OR m.id < ?) ORDER BY m.id DESC LIMIT ?`,
  ).all(seanceId, avant, avant, limite) as unknown as Array<{
    id: number; utilisateur_id: number | null; prenom: string | null; texte: string; position: number | null; envoye_le: string;
  }>;
  return lignes.reverse().map((m) => ({
    id: m.id, seanceId, utilisateurId: m.utilisateur_id, prenom: m.prenom, texte: m.texte, position: m.position, envoyeLe: m.envoye_le,
  }));
}

export function versMessageWs(m: MessageChat): MessageChatWs {
  return { id: m.id, utilisateurId: m.utilisateurId, prenom: m.prenom, texte: m.texte, position: m.position, envoyeLe: m.envoyeLe };
}

interface LigneProgression {
  film_id: string; position: number; duree: number | null; seance_id: string | null; termine: number; vu_le: string;
  titre: string; annee: number | null; resume: string | null; genres: string | null; tmdb_id: number | null; nom_origine: string;
  taille: number; f_duree: number | null; etat: 'analyse' | 'pret' | 'erreur'; erreur: string | null;
  visibilite: 'prive' | 'partage' | 'tous'; affiche: string | null; fond: string | null; ajoute_le: string;
  proprietaire_id: number; proprietaire_prenom: string; couleur: string | null;
}

/** Même règle que la médiathèque : date de dernière écriture des images (cache du navigateur, `?v=`). */
function versionImages(dossierFilms: string, l: LigneProgression): number {
  let v = 0;
  for (const rel of [l.affiche, l.fond]) {
    if (!rel) continue;
    try { v = Math.max(v, Math.floor(statSync(path.join(dossierFilms, rel)).mtimeMs / 1000)); } catch { /* image absente */ }
  }
  return v;
}

function genres(v: string | null): string[] {
  if (!v) return [];
  try {
    const j: unknown = JSON.parse(v);
    if (Array.isArray(j)) return j.map(String);
  } catch { /* liste séparée par des virgules */ }
  return v.split(',').map((g) => g.trim()).filter(Boolean);
}

/** Progression de `u` (reprise ou historique), limitée aux films qu'il peut encore voir. */
export function progressions(app: FastifyInstance, u: UtilisateurConnecte, filtre: 'reprise' | 'historique', limite: number): ProgressionFilm[] {
  const lignes = app.db.prepare(
    `SELECT p.film_id, p.position, p.duree, p.seance_id, p.termine, p.vu_le,
            f.titre, f.annee, f.resume, f.genres, f.tmdb_id, f.nom_origine, f.taille, f.duree AS f_duree, f.etat, f.erreur,
            f.visibilite, f.affiche, f.fond, f.ajoute_le, f.proprietaire_id, f.couleur, o.prenom AS proprietaire_prenom
       FROM progression p JOIN films f ON f.id = p.film_id JOIN utilisateurs o ON o.id = f.proprietaire_id
      WHERE p.utilisateur_id = ? ${filtre === 'reprise' ? 'AND p.termine = 0 AND p.position >= 5' : ''}
      ORDER BY p.vu_le DESC`,
  ).all(u.id) as unknown as LigneProgression[];
  const sortie: ProgressionFilm[] = [];
  for (const l of lignes) {
    if (!app.mediatheque.peutVoir(u, l.film_id)) continue;
    const modifiable = u.role === 'admin' || l.proprietaire_id === u.id;
    const partages = modifiable
      ? (app.db.prepare('SELECT utilisateur_id FROM films_partages WHERE film_id = ?').all(l.film_id) as Array<{ utilisateur_id: number }>).map((x) => x.utilisateur_id)
      : [];
    const film: Film = {
      id: l.film_id, proprietaireId: l.proprietaire_id, proprietairePrenom: l.proprietaire_prenom, titre: l.titre, annee: l.annee,
      resume: l.resume, genres: genres(l.genres), tmdbId: l.tmdb_id, nomOrigine: l.nom_origine, taille: l.taille, duree: l.f_duree,
      etat: l.etat, erreur: l.erreur, visibilite: l.visibilite, partages, aAffiche: l.affiche !== null, aFond: l.fond !== null,
      couleur: l.couleur, versionImages: versionImages(app.config.films, l), modifiable, ajouteLe: l.ajoute_le,
    };
    const entree: ProgressionFilm = { film, position: l.position, duree: l.duree, seanceId: l.seance_id, termine: l.termine === 1, vuLe: l.vu_le };
    if (filtre === 'historique') {
      entree.souvenir = l.seance_id !== null && estParticipant(app, l.seance_id, u.id) ? souvenirDe(app, l.seance_id) : null;
    }
    sortie.push(entree);
    if (sortie.length >= limite) break;
  }
  return sortie;
}
