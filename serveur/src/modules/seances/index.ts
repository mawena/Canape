import type { FastifyPluginAsync } from 'fastify';
import type { UtilisateurConnecte } from '../../commun/auth.ts';
import { Salles } from './salles.ts';
import { enregistrerRoutes } from './routes.ts';
import { enregistrerWebSocket } from './ws.ts';

// Module « seances » : séances, liens, salle WebSocket, reprise, historique, ICE.
// Enregistré sans encapsulation (decorateurs visibles des modules suivants).
const moduleSeances: FastifyPluginAsync = async (app) => {
  const salles = new Salles(app);
  enregistrerRoutes(app, salles);
  enregistrerWebSocket(app, salles);

  // `app.mediatheque` n'existe qu'une fois tous les modules enregistrés : on s'y abonne au démarrage.
  app.addHook('onReady', async () => {
    if (!app.hasDecorator('mediatheque')) {
      app.log.warn('séances : app.mediatheque absent, règle d\'accès et suppression de film non branchées');
      return;
    }
    // Participant (ou hôte) d'une séance non terminée dont le film est celui-ci : il peut le voir.
    app.mediatheque.ajouterRegleAcces((u: UtilisateurConnecte, filmId: string) =>
      app.db.prepare(
        `SELECT 1 AS x FROM seances s WHERE s.film_id = ? AND s.terminee_le IS NULL AND
           (s.hote_id = ? OR EXISTS (SELECT 1 FROM seances_participants p WHERE p.seance_id = s.id AND p.utilisateur_id = ?)) LIMIT 1`,
      ).get(filmId, u.id, u.id) !== undefined);
    // Les séances d'un film supprimé perdent leur film (la base le fait par ON DELETE SET NULL ; les salles ouvertes aussi).
    app.mediatheque.surFilmSupprime((filmId) => {
      app.db.prepare('UPDATE seances SET film_id = NULL, position = 0, piste_audio = NULL, sous_titres = NULL WHERE film_id = ?').run(filmId);
      salles.surFilmSupprime(filmId);
    });
  });
};

export default moduleSeances;
