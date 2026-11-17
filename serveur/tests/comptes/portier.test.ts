import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { COOKIE_SESSION } from '@canape/partage';
import { chargerConfig } from '../../src/config.ts';
import {
  COOKIE_PORTIER, Tentatives, cheminLocal, defiPkce, verifierJetonIdentite, type Jwk,
} from '../../src/modules/comptes/portier.ts';
import { creerAppTest, creerUtilisateur, requete, type AppTest } from '../aides.ts';

const EMETTEUR = 'https://portier.test';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK: Jwk = { ...(publicKey.export({ format: 'jwk' }) as Jwk), kid: 'cle-1', use: 'sig', alg: 'RS256' };
const autre = generateKeyPairSync('rsa', { modulusLength: 2048 });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signer(charge: Record<string, unknown>, entete: Record<string, unknown> = { alg: 'RS256', kid: 'cle-1', typ: 'JWT' }, cle = privateKey): string {
  const debut = `${b64(entete)}.${b64(charge)}`;
  return `${debut}.${sign('RSA-SHA256', Buffer.from(debut), cle).toString('base64url')}`;
}
const maintenant = () => Math.floor(Date.now() / 1000);
const revendications = (plus: Record<string, unknown> = {}) => ({
  iss: EMETTEUR, sub: 'charles-gamligo', aud: 'canape', exp: maintenant() + 600, iat: maintenant(), nonce: 'n-1',
  preferred_username: 'charles-gamligo', name: 'charles-gamligo', email: 'charles@exemple.fr', email_verified: true, ...plus,
});
const attendu = { cles: [JWK], emetteur: EMETTEUR, clientId: 'canape', nonce: 'n-1' };

describe('portier : jeton d\'identité', () => {
  test('jeton valable : revendications rendues', () => {
    const r = verifierJetonIdentite(signer(revendications()), attendu);
    assert.equal(r.preferred_username, 'charles-gamligo');
  });

  const refuse = (jeton: string, a = attendu) => assert.throws(() => verifierJetonIdentite(jeton, a), { name: 'Error', code: 'echec' } as object);

  test('signature d\'une autre clé, jeton modifié, alg none ou HS256 : refusés', () => {
    refuse(signer(revendications(), undefined, autre.privateKey));
    const [h, , s] = signer(revendications()).split('.');
    refuse(`${h}.${b64(revendications({ sub: 'admin', preferred_username: 'admin' }))}.${s}`);
    refuse(`${b64({ alg: 'none', kid: 'cle-1' })}.${b64(revendications())}.`);
    refuse(signer(revendications(), { alg: 'HS256', kid: 'cle-1' }));
    refuse(signer(revendications(), { alg: 'RS256', kid: 'inconnue' }));
    refuse('pas-un-jeton');
  });

  test('iss, aud, azp, exp, iat, nonce, sub vérifiés', () => {
    refuse(signer(revendications({ iss: 'https://ailleurs.test' })));
    refuse(signer(revendications({ aud: 'autre-appli' })));
    refuse(signer(revendications({ aud: ['canape', 'autre'] })));
    assert.ok(verifierJetonIdentite(signer(revendications({ aud: ['canape', 'autre'], azp: 'canape' })), attendu));
    refuse(signer(revendications({ azp: 'autre' })));
    refuse(signer(revendications({ exp: maintenant() - 120 })));
    refuse(signer(revendications({ iat: maintenant() + 600 })));
    refuse(signer(revendications({ nonce: 'rejoue' })));
    refuse(signer(revendications({ nonce: undefined })));
    refuse(signer(revendications({ sub: '' })));
  });
});

describe('portier : state, nonce, PKCE', () => {
  test('défi S256 conforme à la RFC 7636 (exemple de l\'annexe B)', () => {
    assert.equal(defiPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  test('tentative à usage unique, liée au cookie, expirée au bout de 10 min', () => {
    const t = new Tentatives();
    const a = t.creer('/galerie');
    assert.notEqual(a.state, a.nonce);
    assert.equal(t.prendre(a.state, 'autre-cookie'), null);
    assert.equal(t.prendre(a.state, undefined), null);
    assert.equal(t.prendre(a.state, a.state)?.retour, '/galerie');
    assert.equal(t.prendre(a.state, a.state), null, 'rejouée');
    const b = t.creer('/', Date.now() - 11 * 60_000);
    assert.equal(t.prendre(b.state, b.state), null);
  });

  test('retour limité aux chemins locaux', () => {
    assert.equal(cheminLocal('/seances/x?y=1'), '/seances/x?y=1');
    for (const v of ['//mechant.test', '/\\mechant.test', 'https://mechant.test', '/a\r\nSet-Cookie: x', undefined]) assert.equal(cheminLocal(v), '/');
  });
});

describe('portier : configuration', () => {
  test('désactivé par défaut ; activé sans secret : erreur ; secret lu dans un fichier', async () => {
    assert.equal(chargerConfig({}).portier, null);
    assert.throws(() => chargerConfig({ CANAPE_PORTIER: '1' }), /CANAPE_PORTIER_SECRET/);
    const c = chargerConfig({ CANAPE_PORTIER: '1', CANAPE_PORTIER_SECRET: 's', CANAPE_URL_PUBLIQUE: 'https://canape.test/', CANAPE_PORTIER_COMPTES: 'Charles-Gamligo:Charles, x@y.fr:bob' });
    assert.equal(c.portier?.emetteur, 'https://portier.mawena.cloud');
    assert.equal(c.portier?.clientId, 'canape');
    assert.equal(c.portier?.retour, 'https://canape.test/api/portier/retour');
    assert.deepEqual([...(c.portier?.comptes ?? [])], [['charles-gamligo', 'Charles'], ['x@y.fr', 'bob']]);
    assert.throws(() => chargerConfig({ CANAPE_PORTIER: '1', CANAPE_PORTIER_SECRET: 's', CANAPE_PORTIER_COMPTES: 'sans-deux-points' }), /CANAPE_PORTIER_COMPTES/);
    assert.throws(() => chargerConfig({ CANAPE_PORTIER: '1', CANAPE_PORTIER_SECRET_FICHIER: '/inexistant/secret' }), /illisible/);
    const dossier = mkdtempSync(path.join(tmpdir(), 'canape-portier-'));
    writeFileSync(path.join(dossier, 'secret'), 'du-fichier\n');
    assert.equal(chargerConfig({ CANAPE_PORTIER: '1', CANAPE_PORTIER_SECRET_FICHIER: path.join(dossier, 'secret') }).portier?.clientSecret, 'du-fichier');
    rmSync(dossier, { recursive: true });
  });
});

/** Faux Portier : découverte, JWKS, jeton (vérifie le secret, le code, l'adresse de retour et le vérificateur PKCE). */
function fauxPortier(charge: (nonce: string) => Record<string, unknown>) {
  const appels: string[] = [];
  const codes = new Map<string, { nonce: string; defi: string }>();
  const f = (async (entree: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entree));
    appels.push(url.pathname);
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/.well-known/openid-configuration') {
      return json({ issuer: EMETTEUR, authorization_endpoint: `${EMETTEUR}/oidc/autoriser`, token_endpoint: `${EMETTEUR}/oidc/jeton`, jwks_uri: `${EMETTEUR}/oidc/cles` });
    }
    if (url.pathname === '/oidc/cles') return json({ keys: [JWK] });
    if (url.pathname === '/oidc/jeton') {
      const corps = new URLSearchParams(String(init?.body));
      const auth = new Headers(init?.headers).get('authorization');
      if (auth !== `Basic ${Buffer.from('canape:le-secret').toString('base64')}`) return json({ error: 'invalid_client' }, 401);
      const c = codes.get(corps.get('code') ?? '');
      if (!c || corps.get('redirect_uri') !== 'http://localhost:8080/api/portier/retour') return json({ error: 'invalid_grant' }, 400);
      if (defiPkce(corps.get('code_verifier') ?? '') !== c.defi) return json({ error: 'invalid_grant' }, 400);
      return json({ access_token: 'a', token_type: 'Bearer', expires_in: 600, id_token: signer(charge(c.nonce)) });
    }
    return json({}, 404);
  }) as typeof fetch;
  /** Ce que ferait Portier après la connexion : un code lié au nonce et au défi de l'URL d'autorisation. */
  const autoriser = (urlAutorisation: string, code = 'code-1') => {
    const u = new URL(urlAutorisation);
    assert.equal(u.origin + u.pathname, `${EMETTEUR}/oidc/autoriser`);
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(u.searchParams.get('client_id'), 'canape');
    assert.equal(u.searchParams.get('response_type'), 'code');
    codes.set(code, { nonce: u.searchParams.get('nonce') ?? '', defi: u.searchParams.get('code_challenge') ?? '' });
    return { code, state: u.searchParams.get('state') ?? '' };
  };
  return { f, autoriser, appels };
}

describe('portier : routes', () => {
  let t: AppTest;
  let charge: (nonce: string) => Record<string, unknown> = (nonce) => revendications({ nonce });
  const portier = fauxPortier((n) => charge(n));
  before(async () => {
    t = await creerAppTest({
      env: {
        CANAPE_PORTIER: '1', CANAPE_PORTIER_EMETTEUR: EMETTEUR, CANAPE_PORTIER_SECRET: 'le-secret',
        CANAPE_PORTIER_COMPTES: 'charles-gamligo:Charles, ada@exemple.fr:Ada',
      },
      app: { fetchPortier: portier.f },
    });
    await creerUtilisateur(t, { identifiant: 'Charles', prenom: 'Charles' });
    await creerUtilisateur(t, { identifiant: 'Ada', prenom: 'Ada' });
  });
  after(() => t.fermer());

  async function aller(retour = '/galerie') {
    const r = await requete(t.app, 'GET', `/api/portier/depart?retour=${encodeURIComponent(retour)}`);
    assert.equal(r.statusCode, 303);
    const cookie = r.cookies.find((c) => c.name === COOKIE_PORTIER);
    assert.ok(cookie);
    return { ...portier.autoriser(r.headers.location as string, `code-${Math.random()}`), cookie: cookie.value };
  }
  const revenir = (q: string, cookie?: string) =>
    requete(t.app, 'GET', `/api/portier/retour?${q}`, cookie ? { entetes: { cookie: `${COOKIE_PORTIER}=${cookie}` } } : {});

  test('/api/etat annonce Portier', async () => {
    assert.equal((await requete(t.app, 'GET', '/api/etat')).json().portier, true);
  });

  test('aller-retour complet : session du compte lié, retour sur la page demandée', async () => {
    charge = (nonce) => revendications({ nonce });
    const a = await aller('/galerie');
    const r = await revenir(`code=${a.code}&state=${a.state}`, a.cookie);
    assert.equal(r.statusCode, 303);
    assert.equal(r.headers.location, '/galerie');
    const session = r.cookies.find((c) => c.name === COOKIE_SESSION);
    assert.ok(session);
    const etat = (await requete(t.app, 'GET', '/api/etat', { entetes: { cookie: `${COOKIE_SESSION}=${session.value}` } })).json();
    assert.equal(etat.utilisateur.identifiant, 'Charles');
  });

  test('correspondance par e-mail vérifié', async () => {
    charge = (nonce) => revendications({ nonce, sub: 'ada-p', preferred_username: 'ada-p', email: 'Ada@Exemple.fr' });
    const a = await aller();
    const r = await revenir(`code=${a.code}&state=${a.state}`, a.cookie);
    assert.equal(r.headers.location, '/galerie');
    assert.ok(r.cookies.find((c) => c.name === COOKIE_SESSION));
  });

  test('compte non lié (ou e-mail non vérifié) : refusé, aucune session, aucun compte créé', async () => {
    const avant = (t.db.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get() as { n: number }).n;
    for (const c of [
      (nonce: string) => revendications({ nonce, sub: 'inconnu', preferred_username: 'inconnu', email: 'inconnu@exemple.fr' }),
      (nonce: string) => revendications({ nonce, sub: 'ada-p', preferred_username: 'ada-p', email: 'ada@exemple.fr', email_verified: false }),
    ]) {
      charge = c;
      const a = await aller();
      const r = await revenir(`code=${a.code}&state=${a.state}`, a.cookie);
      assert.equal(r.headers.location, '/connexion?portier=non_lie');
      assert.equal(r.cookies.find((x) => x.name === COOKIE_SESSION && x.value), undefined);
    }
    assert.equal((t.db.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get() as { n: number }).n, avant);
  });

  test('compte lié mais désactivé : refusé', async () => {
    t.db.prepare("UPDATE utilisateurs SET actif = 0 WHERE identifiant = 'Ada'").run();
    charge = (nonce) => revendications({ nonce, sub: 'x', preferred_username: 'x', email: 'ada@exemple.fr' });
    const a = await aller();
    assert.equal((await revenir(`code=${a.code}&state=${a.state}`, a.cookie)).headers.location, '/connexion?portier=non_lie');
    t.db.prepare("UPDATE utilisateurs SET actif = 1 WHERE identifiant = 'Ada'").run();
  });

  test('state absent, sans cookie, d\'un autre navigateur ou rejoué : refusé', async () => {
    charge = (nonce) => revendications({ nonce });
    const a = await aller();
    const b = await aller();
    assert.equal((await revenir(`code=${a.code}&state=${a.state}`)).headers.location, '/connexion?portier=expire');
    assert.equal((await revenir(`code=${b.code}&state=${b.state}`, a.cookie)).headers.location, '/connexion?portier=expire');
    assert.equal((await revenir(`code=${b.code}`, b.cookie)).headers.location, '/connexion?portier=expire');
    const c = await aller();
    assert.equal((await revenir(`code=${c.code}&state=${c.state}`, c.cookie)).headers.location, '/galerie');
    assert.equal((await revenir(`code=${c.code}&state=${c.state}`, c.cookie)).headers.location, '/connexion?portier=expire');
  });

  test('nonce différent dans le jeton : refusé', async () => {
    charge = () => revendications({ nonce: 'pas-le-bon' });
    const a = await aller();
    const r = await revenir(`code=${a.code}&state=${a.state}`, a.cookie);
    assert.equal(r.headers.location, '/connexion?portier=echec');
    assert.equal(r.cookies.find((x) => x.name === COOKIE_SESSION && x.value), undefined);
  });

  test('refus de Portier (access_denied) : message, pas de session', async () => {
    const a = await aller();
    assert.equal((await revenir(`error=access_denied&state=${a.state}`, a.cookie)).headers.location, '/connexion?portier=refuse');
  });

  test('iss du retour (RFC 9207) : accepté s\'il est juste, refusé sinon', async () => {
    charge = (nonce) => revendications({ nonce });
    const a = await aller();
    assert.equal((await revenir(`code=${a.code}&state=${a.state}&iss=${encodeURIComponent(EMETTEUR)}`, a.cookie)).headers.location, '/galerie');
    const b = await aller();
    assert.equal((await revenir(`code=${b.code}&state=${b.state}&iss=https%3A%2F%2Fautre.test`, b.cookie)).headers.location, '/connexion?portier=echec');
  });

  test('retour vers un autre site ignoré', async () => {
    charge = (nonce) => revendications({ nonce });
    const a = await aller('//mechant.test');
    assert.equal((await revenir(`code=${a.code}&state=${a.state}`, a.cookie)).headers.location, '/');
  });
});

describe('portier : désactivé (défaut)', () => {
  let t: AppTest;
  before(async () => { t = await creerAppTest(); });
  after(() => t.fermer());

  test('/api/etat inchangé et routes absentes', async () => {
    const etat = (await requete(t.app, 'GET', '/api/etat')).json();
    assert.deepEqual(Object.keys(etat).sort(), ['inscriptionOuverte', 'installationRequise', 'utilisateur', 'version']);
    assert.equal((await requete(t.app, 'GET', '/api/portier/depart')).statusCode, 404);
    assert.equal((await requete(t.app, 'GET', '/api/portier/retour?code=x&state=y')).statusCode, 404);
  });
});
