import type { FastifyPluginAsync } from 'fastify';
import type { EtatApi } from '@canape/partage';
import { version } from '../../commun/version.ts';

// Module « comptes » : à remplir par son propriétaire (voir docs/CONCEPTION.md).
// Enregistré sans encapsulation : ses décorateurs restent visibles des modules suivants.
const moduleComptes: FastifyPluginAsync = async (app) => {
  // Version minimale de GET /api/etat, à compléter (installation requise, etc.).
  app.get('/api/etat', async (req, reply): Promise<EtatApi> => {
    const u = app.utilisateurOptionnel(req, reply);
    const { n } = app.db.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get() as { n: number };
    let utilisateur: EtatApi['utilisateur'] = null;
    if (u) {
      const { sessionId: _s, ...sans } = u;
      utilisateur = sans;
    }
    return { version, utilisateur, installationRequise: n === 0 };
  });
};

export default moduleComptes;
