import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { LIMITES_WS, TAILLE_MAX_SOUS_TITRES } from '@canape/partage';
import { installerAuth } from './commun/auth.ts';
import { installerGestionnaireErreurs, ErreurHttp } from './commun/erreurs.ts';
import { optionsJournal } from './commun/journal.ts';
import { sansEncapsulation } from './commun/module.ts';
import { installerControleOrigine } from './commun/origine.ts';
import { hachagesScriptsEnLigne, installerEntetesSecurite } from './commun/securite.ts';
import type { Config } from './config.ts';
import { migrer, ouvrirBase, type Base } from './db/index.ts';
import moduleComptes from './modules/comptes/index.ts';
import moduleLecture from './modules/lecture/index.ts';
import moduleMediatheque from './modules/mediatheque/index.ts';
import moduleSeances from './modules/seances/index.ts';

export const DOSSIER_CLIENT = new URL('../../client/build/', import.meta.url).pathname;

export interface OptionsApp {
  /** Base déjà ouverte et migrée ; sinon `<donnees>/canape.sqlite` est ouverte, migrée et fermée avec l'app. */
  db?: Base;
  /** Dossier de l'application construite (défaut : `client/build`). */
  clientBuild?: string;
  /** Niveau du journal pino (`'silent'` en test). */
  journal?: string;
  /** Fastify HTTPS (certificat lu depuis la configuration). */
  https?: { key: Buffer; cert: Buffer };
}

const PREFIXES_API = ['/api/', '/media/', '/ws/'];

/** Construit l'application Fastify : plugins communs, modules, service du client. N'écoute pas. */
export async function creerApp(config: Config, options: OptionsApp = {}): Promise<FastifyInstance> {
  for (const d of [config.donnees, config.films, config.cache, config.televersements, config.telechargements]) mkdirSync(d, { recursive: true });
  const db = options.db ?? ouvrirBase(path.join(config.donnees, 'canape.sqlite'));
  if (!options.db) migrer(db);

  const https = options.https ?? (config.tlsCert && config.tlsCle
    ? { cert: readFileSync(config.tlsCert), key: readFileSync(config.tlsCle) }
    : undefined);

  const app = Fastify({
    logger: optionsJournal(options.journal),
    trustProxy: config.derriereProxy,
    bodyLimit: 1024 * 1024,
    routerOptions: { ignoreTrailingSlash: true },
    ...(https ? { https } : {}),
  }) as unknown as FastifyInstance;

  app.decorate('config', config);
  app.decorate('db', db);
  if (!options.db) app.addHook('onClose', async () => db.close());

  installerGestionnaireErreurs(app);
  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });
  await app.register(fastifyWebsocket, { options: { maxPayload: LIMITES_WS.tailleMessageOctets } });
  await app.register(fastifyMultipart, { limits: { files: 1, fileSize: TAILLE_MAX_SOUS_TITRES } });

  const build = options.clientBuild ?? DOSSIER_CLIENT;
  const indexHtml = path.join(build, 'index.html');
  const clientPresent = existsSync(indexHtml);
  installerEntetesSecurite(app, clientPresent ? hachagesScriptsEnLigne(readFileSync(indexHtml, 'utf8')) : []);
  installerControleOrigine(app);
  installerAuth(app);

  // Les quatre modules, dans l'ordre (la lecture s'abonne à la médiathèque).
  await app.register(sansEncapsulation(moduleComptes));
  await app.register(sansEncapsulation(moduleMediatheque));
  await app.register(sansEncapsulation(moduleLecture));
  await app.register(sansEncapsulation(moduleSeances));

  if (clientPresent) {
    await app.register(fastifyStatic, {
      root: build,
      index: ['index.html'],
      setHeaders(res, chemin) {
        res.header(
          'Cache-Control',
          chemin.includes(`${path.sep}_app${path.sep}immutable${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  app.setNotFoundHandler(async (req, reply) => {
    const chemin = req.url.split('?')[0] ?? '/';
    const api = PREFIXES_API.some((p) => chemin.startsWith(p));
    const fichier = (chemin.split('/').pop() ?? '').includes('.');
    if (clientPresent && !api && !fichier && (req.method === 'GET' || req.method === 'HEAD')) {
      // Repli de l'application monopage : toute route du client rend index.html.
      return reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(readFileSync(indexHtml));
    }
    throw new ErreurHttp(404, 'introuvable', 'Introuvable.');
  });

  return app;
}
