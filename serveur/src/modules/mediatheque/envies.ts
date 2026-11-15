// Films « à voir ensemble » : l'envie de chacun et la liste des films qui plaisent (le retrait après séance est dans `commun/envies.ts`).
import type { FastifyInstance } from 'fastify';
import type { EtatEnvie, FilmAVoir, UtilisateurEnvie } from '@canape/partage';
import { etatEnvie, retirerEnvies } from '../../commun/envies.ts';
import { introuvable } from '../../commun/erreurs.ts';
import { maintenantIso } from '../../commun/identifiants.ts';
import { comptesCiblables } from '../comptes/connus.ts';
import type { Mediatheque } from './mediatheque.ts';

export function installerEnvies(app: FastifyInstance, med: Mediatheque): void {
  const pre = { preHandler: app.exigerConnexion };

  /** Film visible par l'utilisateur (prêt ou non), sinon 404 (jamais d'indice sur un film privé). */
  function filmVisible(id: string, u: Parameters<Mediatheque['peutVoir']>[0]) {
    const l = med.ligne(id);
    if (!l || !med.peutVoir(u, id)) throw introuvable('Film introuvable.');
    return l;
  }

  app.put('/api/films/:id/envie', pre, async (req): Promise<EtatEnvie> => {
    const l = filmVisible((req.params as { id: string }).id, req.utilisateur);
    app.db.prepare('INSERT OR IGNORE INTO envies (utilisateur_id, film_id, cree_le) VALUES (?, ?, ?)').run(req.utilisateur.id, l.id, maintenantIso());
    return etatEnvie(app.db, l.id, req.utilisateur.id, comptesCiblables(app.db, req.utilisateur));
  });

  app.delete('/api/films/:id/envie', pre, async (req): Promise<EtatEnvie> => {
    const l = filmVisible((req.params as { id: string }).id, req.utilisateur);
    retirerEnvies(app.db, l.id, [req.utilisateur.id]);
    return etatEnvie(app.db, l.id, req.utilisateur.id, comptesCiblables(app.db, req.utilisateur));
  });

  // Les films prêts que je peux voir et qui plaisent à au moins une personne que je peux nommer : le plus d'envies d'abord, puis la plus récente.
  app.get('/api/envies', pre, async (req): Promise<FilmAVoir[]> => {
    const u = req.utilisateur;
    // Vie privée entre inconnus : on ne nomme et on ne compte que les comptes que je peux viser (connus, admins, moi) ; un film voulu seulement par des inconnus n'apparaît pas.
    const visibles = comptesCiblables(app.db, u);
    visibles.add(u.id);
    const lignes = app.db.prepare(
      `SELECT e.film_id, e.cree_le, c.id, c.prenom, c.couleur FROM envies e
         JOIN films f ON f.id = e.film_id JOIN utilisateurs c ON c.id = e.utilisateur_id
        WHERE f.etat = 'pret' ORDER BY e.cree_le, c.id`,
    ).all() as Array<{ film_id: string; cree_le: string; id: number; prenom: string; couleur: string | null }>;
    // Par film : les personnes visibles (la plus ancienne envie d'abord) et la date de leur dernière envie.
    const parFilm = new Map<string, { personnes: UtilisateurEnvie[]; derniere: string }>();
    for (const l of lignes) {
      if (!visibles.has(l.id)) continue;
      let g = parFilm.get(l.film_id);
      if (!g) parFilm.set(l.film_id, (g = { personnes: [], derniere: l.cree_le }));
      g.personnes.push({ id: l.id, prenom: l.prenom, couleur: l.couleur });
      g.derniere = l.cree_le;
    }
    const retenus = [...parFilm].flatMap(([filmId, g]) => {
      const film = med.ligne(filmId);
      return film && med.peutVoir(u, film.id) ? [{ film, ...g }] : [];
    });
    retenus.sort((a, b) => b.personnes.length - a.personnes.length || b.derniere.localeCompare(a.derniere) || a.film.id.localeCompare(b.film.id));
    return retenus.map((r) => ({ film: med.versFilm(r.film, u, false, visibles), personnes: r.personnes, moi: r.personnes.some((p) => p.id === u.id) }));
  });
}
