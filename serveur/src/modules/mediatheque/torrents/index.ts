// Téléchargement de films par torrent (module médiathèque) : moteur WebTorrent dans un processus enfant,
// règles et base côté serveur. Contrat : docs/CONCEPTION.md, « Torrents (1.1) ».
import type { FastifyInstance } from 'fastify';
import type { Mediatheque } from '../mediatheque.ts';
import { installerRoutesTorrents } from './routes.ts';
import { Torrents } from './service.ts';

declare module 'fastify' {
  interface FastifyInstance {
    torrents: Torrents;
  }
}

export function installerTorrents(app: FastifyInstance, med: Mediatheque): void {
  const torrents = new Torrents(app, med);
  app.decorate('torrents', torrents);
  installerRoutesTorrents(app, torrents);
  app.addHook('onReady', async () => { await torrents.demarrer(); });
  app.addHook('onClose', async () => { await torrents.arreter(); });
}
