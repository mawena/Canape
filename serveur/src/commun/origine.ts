import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import { ErreurHttp } from './erreurs.ts';

const METHODES_SURES = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * `true` si l'`Origin` de la requête est celle de `CANAPE_URL_PUBLIQUE`.
 * `strict` (WebSocket) : une `Origin` absente est refusée ; sinon (requêtes qui modifient) elle est tolérée
 * pour les clients hors navigateur, sauf si le navigateur signale `Sec-Fetch-Site: cross-site`.
 */
export function origineAutorisee(req: FastifyRequest, config: Config, strict = false): boolean {
  const origine = req.headers.origin;
  if (origine === undefined) {
    if (strict) return false;
    return req.headers['sec-fetch-site'] !== 'cross-site';
  }
  return origine === config.origine;
}

/** Hook global : refuse (403) les requêtes qui modifient venant d'une autre origine. */
export function installerControleOrigine(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    if (METHODES_SURES.has(req.method)) return;
    if (!origineAutorisee(req, app.config)) {
      throw new ErreurHttp(403, 'origine_refusee', "Origine de la requête non autorisée.");
    }
  });
}
