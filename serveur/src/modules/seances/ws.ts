// `GET /ws/seances/:id` : accès vérifié avant la poignée de main, puis la salle prend la connexion.
import type { FastifyInstance } from 'fastify';
import { LIMITES_WS } from '@canape/partage';
import { ErreurHttp, nonConnecte } from '../../commun/erreurs.ts';
import { origineAutorisee } from '../../commun/origine.ts';
import { accesSeance } from './depot.ts';
import type { Salles } from './salles.ts';

export function enregistrerWebSocket(app: FastifyInstance, salles: Salles): void {
  app.get<{ Params: { id: string } }>(
    '/ws/seances/:id',
    {
      websocket: true,
      // Ces contrôles tournent avant la poignée de main : un refus devient une réponse HTTP (403, 401, 404, 503).
      onRequest: async (req) => {
        if (!origineAutorisee(req, app.config, true)) throw new ErreurHttp(403, 'origine_refusee', 'Origine non autorisée.');
        const u = app.utilisateurOptionnel(req);
        if (!u) throw nonConnecte();
        accesSeance(app, req.params.id, u);
        if (salles.presents(req.params.id) >= LIMITES_WS.connexionsParSeance) {
          throw new ErreurHttp(503, 'salle_pleine', `La salle est pleine (${LIMITES_WS.connexionsParSeance} connexions au plus).`);
        }
      },
    },
    (socket, req) => {
      const u = app.utilisateurOptionnel(req);
      if (!u) { socket.close(4401, 'Non connecté'); return; }
      if (salles.presents(req.params.id) >= LIMITES_WS.connexionsParSeance) { socket.close(4503, 'Salle pleine'); return; }
      try {
        accesSeance(app, req.params.id, u);
      } catch {
        socket.close(4404, 'Introuvable');
        return;
      }
      salles.rejoindre(req.params.id, u, socket);
    },
  );
}
