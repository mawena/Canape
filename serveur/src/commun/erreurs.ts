import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ErreurApiCorps } from '@canape/partage';

/** Erreur HTTP « attendue » : le gestionnaire la rend en `{ erreur, message }` avec le bon statut. */
export class ErreurHttp extends Error {
  statut: number;
  code: string;
  constructor(statut: number, code: string, message: string) {
    super(message);
    this.name = 'ErreurHttp';
    this.statut = statut;
    this.code = code;
  }
}

export const nonConnecte = () => new ErreurHttp(401, 'non_connecte', 'Connexion requise.');
export const interdit = (message = 'Accès refusé.') => new ErreurHttp(403, 'interdit', message);
export const introuvable = (message = 'Introuvable.') => new ErreurHttp(404, 'introuvable', message);
export const requeteInvalide = (message = 'Requête invalide.') => new ErreurHttp(400, 'requete_invalide', message);

const CODES_PAR_STATUT: Record<number, string> = {
  400: 'requete_invalide', 401: 'non_connecte', 403: 'interdit', 404: 'introuvable', 405: 'methode_interdite',
  409: 'conflit', 413: 'trop_volumineux', 415: 'type_non_pris_en_charge', 429: 'trop_de_requetes', 507: 'quota_depasse',
};

/** Installe le gestionnaire d'erreurs (format `{ erreur, message }`). */
export function installerGestionnaireErreurs(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | ErreurHttp, req: FastifyRequest, reply: FastifyReply) => {
    let statut: number;
    let corps: ErreurApiCorps;
    if (err instanceof ErreurHttp) {
      statut = err.statut;
      corps = { erreur: err.code, message: err.message };
    } else {
      const s = (err as FastifyError).statusCode;
      if (s && s >= 400 && s < 500) {
        statut = s;
        const validation = (err as FastifyError).validation;
        corps = {
          erreur: CODES_PAR_STATUT[s] ?? 'requete_invalide',
          message: s === 429 ? 'Trop de requêtes, réessayez dans un instant.'
            : validation ? 'Requête invalide.'
            : s === 413 ? 'Contenu trop volumineux.'
            : err.message || 'Requête invalide.',
        };
      } else {
        statut = 500;
        req.log.error({ err }, 'erreur interne');
        corps = { erreur: 'erreur_interne', message: 'Une erreur est survenue côté serveur.' };
      }
    }
    return reply.status(statut).send(corps);
  });
}
