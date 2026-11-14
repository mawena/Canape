// Films « à voir ensemble » : l'envie de chacun et la liste des films qui plaisent (le retrait après séance est dans `commun/envies.ts`).
import type { FastifyInstance } from 'fastify';
import type { EtatEnvie, FilmAVoir } from '@canape/partage';
import { etatEnvie, retirerEnvies } from '../../commun/envies.ts';
import { introuvable } from '../../commun/erreurs.ts';
import { maintenantIso } from '../../commun/identifiants.ts';
import type { Mediatheque } from './mediatheque.ts';

export function installerEnvies(app: FastifyInstance, med: Mediatheque): void {
  const pre = { preHandler: app.exigerConnexion };

  /** Film prêt et visible par l'utilisateur, sinon 404 (jamais d'indice sur un film privé). */
  function filmVisible(id: string, u: Parameters<Mediatheque['peutVoir']>[0]) {
    const l = med.ligne(id);
    if (!l || !med.peutVoir(u, id)) throw introuvable('Film introuvable.');
    return l;
  }

  app.put('/api/films/:id/envie', pre, async (req): Promise<EtatEnvie> => {
    const l = filmVisible((req.params as { id: string }).id, req.utilisateur);
    app.db.prepare('INSERT OR IGNORE INTO envies (utilisateur_id, film_id, cree_le) VALUES (?, ?, ?)').run(req.utilisateur.id, l.id, maintenantIso());
    return etatEnvie(app.db, l.id, req.utilisateur.id);
  });

  app.delete('/api/films/:id/envie', pre, async (req): Promise<EtatEnvie> => {
    const l = filmVisible((req.params as { id: string }).id, req.utilisateur);
    retirerEnvies(app.db, l.id, [req.utilisateur.id]);
    return etatEnvie(app.db, l.id, req.utilisateur.id);
  });

  // Les films prêts qui plaisent à au moins une personne et que je peux voir : le plus d'envies d'abord, puis la plus récente.
  app.get('/api/envies', pre, async (req): Promise<FilmAVoir[]> => {
    const u = req.utilisateur;
    const lignes = app.db.prepare(
      `SELECT f.id AS film_id, COUNT(*) AS n, MAX(e.cree_le) AS derniere FROM envies e JOIN films f ON f.id = e.film_id
        WHERE f.etat = 'pret' GROUP BY f.id ORDER BY n DESC, derniere DESC, f.id`,
    ).all() as Array<{ film_id: string; n: number; derniere: string }>;
    const qui = app.db.prepare(
      `SELECT u.id, u.prenom, u.couleur FROM envies e JOIN utilisateurs u ON u.id = e.utilisateur_id
        WHERE e.film_id = ? ORDER BY e.cree_le, u.id`,
    );
    const sortie: FilmAVoir[] = [];
    for (const l of lignes) {
      const film = med.ligne(l.film_id);
      if (!film || !med.peutVoir(u, film.id)) continue;
      const personnes = (qui.all(film.id) as Array<{ id: number; prenom: string; couleur: string | null }>)
        .map((p) => ({ id: p.id, prenom: p.prenom, couleur: p.couleur }));
      sortie.push({ film: med.versFilm(film, u), personnes, moi: personnes.some((p) => p.id === u.id) });
    }
    return sortie;
  });
}
