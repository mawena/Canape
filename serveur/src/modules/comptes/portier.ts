// Connexion facultative par Portier (fournisseur OpenID Connect), EN PLUS de la connexion par mot de passe.
// Flux Authorization Code + PKCE S256 + state + nonce, secret client (client_secret_basic), jeton d'identité RS256
// vérifié avec la crypto de Node (clés JWK du fournisseur). Aucune création de compte : la personne Portier doit être
// liée à un compte Canapé existant par CANAPE_PORTIER_COMPTES. Enregistré seulement si CANAPE_PORTIER=1.
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { creerSession, supprimerSession, type LigneUtilisateur } from '../../commun/auth.ts';
import { maintenantIso } from '../../commun/identifiants.ts';
import type { ConfigPortier } from '../../config.ts';
import type { Base } from '../../db/index.ts';

export const COOKIE_PORTIER = 'canape_portier';
/** Durée de vie d'une tentative de connexion (aller-retour chez Portier). */
const TENTATIVE_MS = 10 * 60_000;
const TENTATIVES_MAX = 1000;
/** Tolérance d'horloge sur `exp` et `iat`. */
const DERIVE_S = 60;
const CACHE_MS = 3_600_000;

/** Pourquoi une connexion par Portier n'a pas abouti (rendu à la page de connexion : `/connexion?portier=<code>`). */
export type CodeEchecPortier = 'refuse' | 'expire' | 'non_lie' | 'echec';

export class ErreurPortier extends Error {
  readonly code: CodeEchecPortier;
  constructor(code: CodeEchecPortier, message: string) {
    super(message);
    this.code = code;
  }
}

// ---- PKCE, state, nonce -------------------------------------------------------------------------------------

export function aleatoire(octets = 32): string {
  return randomBytes(octets).toString('base64url');
}

/** Défi PKCE S256 : BASE64URL(SHA-256(verificateur)). */
export function defiPkce(verificateur: string): string {
  return createHash('sha256').update(verificateur, 'ascii').digest('base64url');
}

export interface Tentative {
  nonce: string;
  verificateur: string;
  /** Chemin local où revenir après la connexion. */
  retour: string;
  expire: number;
}

/** Tentatives en cours, indexées par `state` (le même `state` est posé dans un cookie du navigateur). */
export class Tentatives {
  private readonly table = new Map<string, Tentative>();

  creer(retour: string, maintenant = Date.now()): { state: string } & Tentative {
    for (const [cle, t] of this.table) if (t.expire <= maintenant) this.table.delete(cle);
    while (this.table.size >= TENTATIVES_MAX) this.table.delete(this.table.keys().next().value as string);
    const state = aleatoire();
    const t: Tentative = { nonce: aleatoire(), verificateur: aleatoire(), retour, expire: maintenant + TENTATIVE_MS };
    this.table.set(state, t);
    return { state, ...t };
  }

  /** Rend et oublie la tentative (usage unique) si `state` correspond au cookie et n'a pas expiré. */
  prendre(state: string | undefined, cookie: string | undefined, maintenant = Date.now()): Tentative | null {
    if (!state || !cookie || state !== cookie) return null;
    const t = this.table.get(state);
    if (!t) return null;
    this.table.delete(state);
    return t.expire > maintenant ? t : null;
  }
}

/** Chemin local sûr (comme `retourSur` côté client) : commence par « / », jamais « // », « /\ » ni de saut de ligne. */
export function cheminLocal(v: unknown): string {
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || /[\r\n]/.test(v) || v.length > 500) return '/';
  return v;
}

// ---- Jeton d'identité ---------------------------------------------------------------------------------------

export interface RevendicationsPortier {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  nonce?: string;
  azp?: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
}

/** Clé publique du JWKS (seuls les champs utiles d'une clé RSA). */
export interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

function json64(partie: string): Record<string, unknown> {
  const v: unknown = JSON.parse(Buffer.from(partie, 'base64url').toString('utf8'));
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('pas un objet');
  return v as Record<string, unknown>;
}

/** `kid` du jeton (pour savoir s'il faut relire les clés), ou `null`. */
export function kidDuJeton(jeton: string): string | null {
  try {
    const kid = json64(jeton.split('.')[0] ?? '')['kid'];
    return typeof kid === 'string' ? kid : null;
  } catch {
    return null;
  }
}

/**
 * Vérifie un jeton d'identité RS256 : signature (clé du JWKS désignée par `kid`), `iss`, `aud` (et `azp` si
 * plusieurs audiences), `exp`, `iat`, `nonce`, `sub`. Lève `ErreurPortier('echec')` au moindre écart.
 */
export function verifierJetonIdentite(
  jeton: string,
  attendu: { cles: Jwk[]; emetteur: string; clientId: string; nonce: string; maintenant?: number },
): RevendicationsPortier {
  const refus = (raison: string): never => { throw new ErreurPortier('echec', `jeton d'identité refusé : ${raison}`); };
  const parties = typeof jeton === 'string' ? jeton.split('.') : [];
  if (parties.length !== 3) refus('format');
  const [h, p, s] = parties as [string, string, string];
  let entete: Record<string, unknown>;
  let charge: Record<string, unknown>;
  try {
    entete = json64(h);
    charge = json64(p);
  } catch {
    return refus('illisible');
  }
  if (entete['alg'] !== 'RS256') refus(`algorithme ${String(entete['alg'])}`);
  const rsa = attendu.cles.filter((c) => c.kty === 'RSA' && (c.use === undefined || c.use === 'sig') && (c.alg === undefined || c.alg === 'RS256'));
  const kid = entete['kid'];
  const cle = typeof kid === 'string' ? rsa.find((c) => c.kid === kid) : rsa.length === 1 ? rsa[0] : undefined;
  if (!cle) refus('clé inconnue');
  let bon = false;
  try {
    const publique = createPublicKey({ key: { kty: 'RSA', n: cle!.n, e: cle!.e }, format: 'jwk' });
    bon = verify('RSA-SHA256', Buffer.from(`${h}.${p}`, 'ascii'), publique, Buffer.from(s, 'base64url'));
  } catch {
    bon = false;
  }
  if (!bon) refus('signature');

  const r = charge as unknown as RevendicationsPortier;
  const maintenant = Math.floor((attendu.maintenant ?? Date.now()) / 1000);
  if (r.iss !== attendu.emetteur) refus('émetteur');
  const auds = Array.isArray(r.aud) ? r.aud : [r.aud];
  if (!auds.includes(attendu.clientId)) refus('audience');
  if ((auds.length > 1 || r.azp !== undefined) && r.azp !== attendu.clientId) refus('azp');
  if (typeof r.exp !== 'number' || r.exp + DERIVE_S <= maintenant) refus('expiré');
  if (r.iat !== undefined && (typeof r.iat !== 'number' || r.iat - DERIVE_S > maintenant)) refus('émis dans le futur');
  if (typeof r.nonce !== 'string' || r.nonce !== attendu.nonce) refus('nonce');
  if (typeof r.sub !== 'string' || !r.sub) refus('sub');
  return r;
}

// ---- Compte lié --------------------------------------------------------------------------------------------

/**
 * Compte Canapé actif lié à la personne Portier, par `CANAPE_PORTIER_COMPTES` : d'abord son nom Portier
 * (`preferred_username`, sinon `sub`), puis son e-mail s'il est vérifié. Jamais de création ; `null` si rien.
 */
export function compteLie(db: Base, comptes: Map<string, string>, r: RevendicationsPortier): LigneUtilisateur | null {
  const cles = [(r.preferred_username || r.sub).toLowerCase()];
  if (r.email && r.email_verified === true) cles.push(r.email.toLowerCase());
  for (const cle of cles) {
    const identifiant = comptes.get(cle);
    if (!identifiant) continue;
    const ligne = db.prepare('SELECT * FROM utilisateurs WHERE identifiant = ? AND actif = 1').get(identifiant) as LigneUtilisateur | undefined;
    if (ligne) return ligne;
  }
  return null;
}

// ---- Fournisseur (découverte, clés, jeton) -----------------------------------------------------------------

interface Decouverte {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export class Fournisseur {
  private decouverte: { valeur: Decouverte; lu: number } | null = null;
  private cles: { valeur: Jwk[]; lu: number } | null = null;

  private readonly config: ConfigPortier;
  private readonly recuperer: typeof fetch;

  constructor(config: ConfigPortier, recuperer: typeof fetch = fetch) {
    this.config = config;
    this.recuperer = recuperer;
  }

  private async json(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const r = await this.recuperer(url, { ...init, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new ErreurPortier('echec', `${url} a répondu ${r.status}`);
    const v: unknown = await r.json();
    if (!v || typeof v !== 'object') throw new ErreurPortier('echec', `${url} : réponse illisible`);
    return v as Record<string, unknown>;
  }

  async lireDecouverte(): Promise<Decouverte> {
    if (this.decouverte && Date.now() - this.decouverte.lu < CACHE_MS) return this.decouverte.valeur;
    const d = await this.json(`${this.config.emetteur}/.well-known/openid-configuration`) as unknown as Decouverte;
    if (d.issuer !== this.config.emetteur) throw new ErreurPortier('echec', `émetteur annoncé « ${String(d.issuer)} » différent de CANAPE_PORTIER_EMETTEUR`);
    for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
      if (typeof d[k] !== 'string' || !/^https?:\/\//.test(d[k])) throw new ErreurPortier('echec', `découverte : ${k} absent`);
    }
    this.decouverte = { valeur: d, lu: Date.now() };
    return d;
  }

  /** Clés publiques ; relues si `kid` est inconnu (changement de clé chez Portier). */
  async lireCles(kid: string | null): Promise<Jwk[]> {
    const connu = this.cles && Date.now() - this.cles.lu < CACHE_MS && (kid === null || this.cles.valeur.some((c) => c.kid === kid));
    if (connu) return this.cles!.valeur;
    const { jwks_uri } = await this.lireDecouverte();
    const j = await this.json(jwks_uri);
    const cles = Array.isArray(j['keys']) ? (j['keys'] as Jwk[]) : [];
    this.cles = { valeur: cles, lu: Date.now() };
    return cles;
  }

  async urlAutorisation(t: { state: string; nonce: string; verificateur: string }): Promise<string> {
    const { authorization_endpoint } = await this.lireDecouverte();
    const u = new URL(authorization_endpoint);
    u.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.retour,
      scope: 'openid profile email',
      state: t.state,
      nonce: t.nonce,
      code_challenge: defiPkce(t.verificateur),
      code_challenge_method: 'S256',
    }).toString();
    return u.toString();
  }

  /** Échange le code (client_secret_basic + code_verifier) puis vérifie le jeton d'identité. */
  async echanger(code: string, t: Tentative): Promise<RevendicationsPortier> {
    const { token_endpoint } = await this.lireDecouverte();
    const basic = Buffer.from(`${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`).toString('base64');
    const reponse = await this.json(token_endpoint, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: this.config.retour, code_verifier: t.verificateur,
      }).toString(),
    });
    const jeton = reponse['id_token'];
    if (typeof jeton !== 'string') throw new ErreurPortier('echec', "pas de jeton d'identité dans la réponse");
    const cles = await this.lireCles(kidDuJeton(jeton));
    return verifierJetonIdentite(jeton, { cles, emetteur: this.config.emetteur, clientId: this.config.clientId, nonce: t.nonce });
  }
}

// ---- Routes ------------------------------------------------------------------------------------------------

export interface OptionsPortier {
  /** Remplace `fetch` (essais). */
  fetch?: typeof fetch;
}

const modulePortier: FastifyPluginAsync<OptionsPortier> = async (app, options) => {
  const { db, config } = app;
  const portier = config.portier;
  if (!portier) return;
  const fournisseur = new Fournisseur(portier, options.fetch ?? fetch);
  const tentatives = new Tentatives();
  const cookie = { path: '/api/portier', httpOnly: true, sameSite: 'lax' as const, secure: config.https };

  const versConnexion = (reply: FastifyReply, code: CodeEchecPortier) =>
    reply.header('Cache-Control', 'no-store').redirect(`/connexion?portier=${code}`, 303);

  app.get<{ Querystring: { retour?: string } }>('/api/portier/depart', {
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
  }, async (req, reply) => {
    const t = tentatives.creer(cheminLocal(req.query.retour));
    let url: string;
    try {
      url = await fournisseur.urlAutorisation(t);
    } catch (e) {
      req.log.warn({ err: e }, 'portier : découverte impossible');
      return versConnexion(reply, 'echec');
    }
    reply.setCookie(COOKIE_PORTIER, t.state, { ...cookie, maxAge: TENTATIVE_MS / 1000 });
    return reply.header('Cache-Control', 'no-store').redirect(url, 303);
  });

  type Retour = { Querystring: { code?: string; state?: string; error?: string; iss?: string } };
  app.get<Retour>('/api/portier/retour', {
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
  }, async (req: FastifyRequest<Retour>, reply) => {
    const t = tentatives.prendre(req.query.state, req.cookies?.[COOKIE_PORTIER]);
    reply.clearCookie(COOKIE_PORTIER, { path: cookie.path });
    if (!t) return versConnexion(reply, 'expire');
    if (req.query.error) {
      req.log.info({ erreur: req.query.error }, 'portier : connexion refusée par le fournisseur');
      return versConnexion(reply, 'refuse');
    }
    // RFC 9207 : Portier rend aussi `iss` ; s'il est là, il doit être le bon émetteur.
    if (!req.query.code || (req.query.iss !== undefined && req.query.iss !== portier.emetteur)) return versConnexion(reply, 'echec');
    let r: RevendicationsPortier;
    try {
      r = await fournisseur.echanger(req.query.code, t);
    } catch (e) {
      req.log.warn({ err: e }, 'portier : échec de la connexion');
      return versConnexion(reply, e instanceof ErreurPortier ? e.code : 'echec');
    }
    const ligne = compteLie(db, portier.comptes, r);
    if (!ligne) {
      req.log.warn({ portier: r.preferred_username || r.sub }, 'portier : aucun compte Canapé lié');
      return versConnexion(reply, 'non_lie');
    }
    supprimerSession(req); // une éventuelle session précédente de ce navigateur
    db.prepare('UPDATE utilisateurs SET derniere_connexion = ? WHERE id = ?').run(maintenantIso(), ligne.id);
    creerSession(ligne.id, req, reply);
    req.log.info({ portier: r.preferred_username || r.sub, identifiant: ligne.identifiant }, 'portier : connexion');
    return reply.header('Cache-Control', 'no-store').redirect(t.retour, 303);
  });
};

export default modulePortier;
