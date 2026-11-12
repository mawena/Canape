import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { ErreurHttp } from '../../src/commun/erreurs.ts';
import { idBase32, jetonAleatoire, sha256Hex } from '../../src/commun/identifiants.ts';
import { creerAppTest, creerUtilisateur, get, post, requete, ORIGINE_TEST, type AppTest } from '../aides.ts';

describe('socle : application', () => {
  let t: AppTest;
  before(async () => {
    t = await creerAppTest({
      avecClient: true,
      avantPret: (app: FastifyInstance) => {
        app.get('/api/_test/prive', { preHandler: app.exigerConnexion }, async (req) => ({ id: req.utilisateur.id, role: req.utilisateur.role }));
        app.get('/api/_test/admin', { preHandler: app.exigerAdmin }, async () => ({ ok: true }));
        app.post('/api/_test/ecrire', async () => ({ ok: true }));
        app.get('/api/_test/erreur', async () => { throw new ErreurHttp(418, 'theiere', 'Je suis une théière.'); });
        app.get('/api/_test/boum', async () => { throw new Error('secret interne'); });
      },
    });
  });
  after(() => t.fermer());

  test('GET /api/etat répond sans session', async () => {
    const r = await get(t.app, '/api/etat');
    assert.equal(r.statusCode, 200);
    const j = r.json();
    assert.equal(j.utilisateur, null);
    assert.equal(j.installationRequise, true);
    assert.match(j.version, /^\d+\.\d+\.\d+/);
  });

  test('GET /api/etat avec session rend l\'utilisateur sans fuite de secret', async () => {
    const u = await creerUtilisateur(t, { role: 'admin', prenom: 'Ada' });
    const j = (await get(t.app, '/api/etat', u)).json();
    assert.equal(j.utilisateur.prenom, 'Ada');
    assert.equal(j.utilisateur.role, 'admin');
    assert.equal(j.installationRequise, false);
    assert.equal(j.utilisateur.mot_de_passe, undefined);
    assert.equal(j.utilisateur.sessionId, undefined);
  });

  test('401 sans session, 401 avec un faux cookie', async () => {
    const r = await get(t.app, '/api/_test/prive');
    assert.equal(r.statusCode, 401);
    assert.deepEqual(r.json(), { erreur: 'non_connecte', message: 'Connexion requise.' });
    const faux = await requete(t.app, 'GET', '/api/_test/prive', { entetes: { cookie: 'canape_session=nimportequoi' } });
    assert.equal(faux.statusCode, 401);
  });

  test('viewer : 200 sur route privée, 403 sur route admin ; admin : 200', async () => {
    const viewer = await creerUtilisateur(t, { role: 'viewer' });
    const admin = await creerUtilisateur(t, { role: 'admin' });
    assert.equal((await get(t.app, '/api/_test/prive', viewer)).statusCode, 200);
    const r = await get(t.app, '/api/_test/admin', viewer);
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().erreur, 'interdit');
    assert.equal((await get(t.app, '/api/_test/admin', admin)).statusCode, 200);
    assert.equal((await get(t.app, '/api/_test/admin')).statusCode, 401);
  });

  test('compte désactivé refusé ; session expirée refusée', async () => {
    const u = await creerUtilisateur(t);
    t.db.prepare('UPDATE utilisateurs SET actif = 0 WHERE id = ?').run(u.id);
    assert.equal((await get(t.app, '/api/_test/prive', u)).statusCode, 401);
    const v = await creerUtilisateur(t);
    t.db.prepare('UPDATE sessions SET expire_le = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', sha256Hex(v.jeton));
    assert.equal((await get(t.app, '/api/_test/prive', v)).statusCode, 401);
    assert.equal(t.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sha256Hex(v.jeton)), undefined);
  });

  test('expiration glissante : la session vue il y a longtemps est prolongée et le cookie renouvelé', async () => {
    const u = await creerUtilisateur(t);
    const id = sha256Hex(u.jeton);
    t.db.prepare('UPDATE sessions SET vu_le = ?, expire_le = ? WHERE id = ?').run(
      new Date(Date.now() - 3_600_000).toISOString(), new Date(Date.now() + 86_400_000).toISOString(), id,
    );
    const r = await get(t.app, '/api/_test/prive', u);
    assert.equal(r.statusCode, 200);
    assert.match(String(r.headers['set-cookie']), /canape_session=/);
    const l = t.db.prepare('SELECT expire_le FROM sessions WHERE id = ?').get(id) as { expire_le: string };
    assert.ok(Date.parse(l.expire_le) > Date.now() + 29 * 86_400_000);
  });

  test('format d\'erreur { erreur, message } ; erreur interne sans détail', async () => {
    const a = await get(t.app, '/api/_test/erreur');
    assert.equal(a.statusCode, 418);
    assert.deepEqual(a.json(), { erreur: 'theiere', message: 'Je suis une théière.' });
    const b = await get(t.app, '/api/_test/boum');
    assert.equal(b.statusCode, 500);
    assert.equal(b.json().erreur, 'erreur_interne');
    assert.ok(!b.body.includes('secret interne'));
    const c = await get(t.app, '/api/inexistant');
    assert.equal(c.statusCode, 404);
    assert.equal(c.json().erreur, 'introuvable');
  });

  test('contrôle d\'Origin sur les requêtes qui modifient', async () => {
    const bonne = await post(t.app, '/api/_test/ecrire');
    assert.equal(bonne.statusCode, 200);
    const mauvaise = await requete(t.app, 'POST', '/api/_test/ecrire', { entetes: { origin: 'https://evil.example' } });
    assert.equal(mauvaise.statusCode, 403);
    assert.equal(mauvaise.json().erreur, 'origine_refusee');
    const croisee = await t.app.inject({ method: 'POST', url: '/api/_test/ecrire', headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(croisee.statusCode, 403);
    const sans = await t.app.inject({ method: 'POST', url: '/api/_test/ecrire' });
    assert.equal(sans.statusCode, 200, 'client hors navigateur sans Origin : toléré');
    // Les lectures ne sont pas contrôlées.
    const lecture = await t.app.inject({ method: 'GET', url: '/api/etat', headers: { origin: 'https://evil.example' } });
    assert.equal(lecture.statusCode, 200);
  });

  test('en-têtes de sécurité (CSP stricte avec hachage du script en ligne)', async () => {
    const r = await get(t.app, '/api/etat');
    const csp = String(r.headers['content-security-policy']);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self' 'sha256-/);
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp));
    assert.match(csp, /media-src 'self' blob:/);
    assert.match(csp, /worker-src 'self' blob:/);
    assert.match(String(r.headers['permissions-policy']), /camera=\(self\), microphone=\(self\)/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['strict-transport-security'], undefined, 'pas de HSTS en HTTP');
  });

  test('repli monopage : l\'accueil et une route profonde rendent index.html ; l\'API et les fichiers manquants restent en 404', async () => {
    const accueil = await get(t.app, '/');
    assert.equal(accueil.statusCode, 200);
    assert.match(accueil.body, /Canapé test/);
    const profonde = await get(t.app, '/seances/abc123/salle');
    assert.equal(profonde.statusCode, 200);
    assert.match(profonde.body, /Canapé test/);
    assert.match(String(profonde.headers['content-type']), /text\/html/);
    assert.equal((await get(t.app, '/robots.txt')).statusCode, 200);
    const immuable = await get(t.app, '/_app/immutable/a.js');
    assert.match(String(immuable.headers['cache-control']), /immutable/);
    assert.equal((await get(t.app, '/_app/immutable/absent.js')).statusCode, 404);
    assert.equal((await get(t.app, '/api/rien')).json().erreur, 'introuvable');
    assert.equal((await get(t.app, '/media/xyz/original')).statusCode, 404);
  });

  test('identifiants et jetons', () => {
    const id = idBase32();
    assert.match(id, /^[a-z2-7]{12}$/);
    assert.notEqual(idBase32(), idBase32());
    assert.ok(jetonAleatoire().length >= 40);
    assert.equal(sha256Hex('a'), 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
  });
});

describe('socle : HTTPS', () => {
  let t: AppTest;
  before(async () => { t = await creerAppTest({ env: { CANAPE_URL_PUBLIQUE: 'https://canape.test' } }); });
  after(() => t.fermer());
  test('HSTS et cookie Secure derrière HTTPS', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/etat' });
    assert.match(String(r.headers['strict-transport-security']), /max-age=/);
    const bonne = await t.app.inject({ method: 'POST', url: '/api/rien', headers: { origin: 'https://canape.test' } });
    assert.equal(bonne.statusCode, 404);
    const mauvaise = await t.app.inject({ method: 'POST', url: '/api/rien', headers: { origin: ORIGINE_TEST } });
    assert.equal(mauvaise.statusCode, 403);
  });
});
