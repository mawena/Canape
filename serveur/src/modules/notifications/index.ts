// Module « notifications » : notifications Web Push (accord par appareil, essai, envoi à l'entrée dans la salle).
// Enregistré sans encapsulation : décore `app.notifications`, utilisé par le module séances à l'exécution.
import type { FastifyPluginAsync } from 'fastify';
import type { CorpsAbonnementNotifications, ReponseCleNotifications, ReponseEssaiNotifications } from '@canape/partage';
import { ErreurHttp, requeteInvalide } from '../../commun/erreurs.ts';
import { MAX_ABONNEMENTS_PAR_PERSONNE, ServiceNotifications } from './service.ts';

declare module 'fastify' {
  interface FastifyInstance {
    notifications: ServiceNotifications;
  }
}

type Corps = Record<string, unknown>;

function corps(req: { body: unknown }): Corps {
  if (req.body === undefined || req.body === null) return {};
  if (typeof req.body !== 'object' || Array.isArray(req.body)) throw requeteInvalide();
  return req.body as Corps;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Octets d'une valeur base64url de longueur exacte, sinon `null`. */
function octets(v: unknown, longueur: number): Buffer | null {
  if (typeof v !== 'string' || v.length > 200 || !BASE64URL.test(v)) return null;
  const b = Buffer.from(v, 'base64url');
  return b.length === longueur ? b : null;
}

const HOTE_IP = /^(\d{1,3}(\.\d{1,3}){3}|\[.*\])$/;

/** Adresse d'un service de notifications : https et un vrai nom d'hôte (http et boucle locale seulement si Canapé lui-même est en http, c'est-à-dire en développement). */
function endpointValide(v: unknown, urlPublique: string): string {
  if (typeof v !== 'string' || v.length > 2048) throw requeteInvalide('Adresse d\'abonnement invalide.');
  let u: URL;
  try { u = new URL(v); } catch { throw requeteInvalide('Adresse d\'abonnement invalide.'); }
  const dev = urlPublique.startsWith('http:');
  if (u.username || u.password) throw requeteInvalide('Adresse d\'abonnement invalide.');
  if (!dev && (u.protocol !== 'https:' || HOTE_IP.test(u.hostname) || u.hostname === 'localhost' || !u.hostname.includes('.'))) {
    throw requeteInvalide('Adresse d\'abonnement refusée.');
  }
  if (dev && u.protocol !== 'https:' && u.protocol !== 'http:') throw requeteInvalide('Adresse d\'abonnement invalide.');
  return u.toString();
}

const moduleNotifications: FastifyPluginAsync = async (app) => {
  const service = new ServiceNotifications(app);
  app.decorate('notifications', service);
  const pre = { preHandler: app.exigerConnexion };

  app.get('/api/notifications/cle', pre, async (): Promise<ReponseCleNotifications> => ({ clePublique: service.cles().publique }));

  app.post('/api/notifications/abonnements', pre, async (req, reply) => {
    const c = corps(req) as Partial<CorpsAbonnementNotifications> & Corps;
    const endpoint = endpointValide(c['endpoint'], app.config.urlPublique);
    const cles = c['keys'] && typeof c['keys'] === 'object' ? (c['keys'] as Corps) : {};
    const p256dh = octets(cles['p256dh'], 65);
    const auth = octets(cles['auth'], 16);
    if (!p256dh || p256dh[0] !== 4 || !auth) throw requeteInvalide('Clés d\'abonnement invalides.');
    const appareil = typeof c['appareil'] === 'string' && c['appareil'].trim() !== '' ? c['appareil'].trim().slice(0, 80) : 'Appareil';
    const u = req.utilisateur;
    if (!service.possede(u.id, endpoint) && service.nombreAbonnements(u.id) >= MAX_ABONNEMENTS_PAR_PERSONNE) {
      throw new ErreurHttp(409, 'conflit', `Trop d'appareils abonnés (${MAX_ABONNEMENTS_PAR_PERSONNE} au plus).`);
    }
    service.abonner(u.id, { endpoint, p256dh: cles['p256dh'] as string, auth: cles['auth'] as string }, appareil);
    return reply.status(204).send();
  });

  app.delete('/api/notifications/abonnements', pre, async (req, reply) => {
    const c = corps(req);
    if (typeof c['endpoint'] !== 'string' || c['endpoint'].length > 2048) throw requeteInvalide('Adresse d\'abonnement invalide.');
    service.desabonner(req.utilisateur.id, c['endpoint']);
    return reply.status(204).send();
  });

  app.post('/api/notifications/essai', { ...pre, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req): Promise<ReponseEssaiNotifications> => {
    const c = corps(req);
    if (c['endpoint'] !== undefined && typeof c['endpoint'] !== 'string') throw requeteInvalide();
    return service.essai(req.utilisateur.id, c['endpoint'] as string | undefined);
  });
};

export default moduleNotifications;
