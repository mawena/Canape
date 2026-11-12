import type { FastifyPluginAsync } from 'fastify';
import { Mediatheque } from './mediatheque.ts';
import { installerRoutes } from './routes.ts';
import { installerTeleversement } from './televersement.ts';

// Module « mediatheque » : galeries, téléversement tus, analyse, fiches, partage, sous-titres externes.
// Enregistré sans encapsulation : `app.mediatheque` reste visible des modules suivants.
const moduleMediatheque: FastifyPluginAsync = async (app) => {
  const med = new Mediatheque(app.db, app.config, app.log);
  app.decorate('mediatheque', med);
  installerTeleversement(app, med);
  installerRoutes(app, med);
  app.addHook('onReady', async () => {
    await med.nettoyerTeleversements().catch(() => 0);
    med.reprendreAnalyses();
  });
  app.addHook('onClose', async () => { await med.attendreTraitements(); });
};

export default moduleMediatheque;
