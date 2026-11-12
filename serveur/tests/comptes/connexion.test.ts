import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { COOKIE_SESSION } from '@canape/partage';
import { creerAppTest, creerUtilisateur, get, MOT_DE_PASSE_TEST, ORIGINE_TEST, post, requete, type AppTest, type UtilisateurTest } from '../aides.ts';

const cookieSession = (r: { cookies: Array<{ name: string; value: string }> }) => r.cookies.find((c) => c.name === COOKIE_SESSION);

describe('comptes : connexion', () => {
  let t: AppTest;
  let ada: UtilisateurTest;
  before(async () => {
    t = await creerAppTest({ env: { CANAPE_DERRIERE_PROXY: '1' } });
    ada = await creerUtilisateur(t, { identifiant: 'Ada', prenom: 'Ada' });
  });
  after(() => t.fermer());

  const connexion = (identifiant: string, motDePasse: string, ip = '10.0.0.1') =>
    requete(t.app, 'POST', '/api/connexion', { corps: { identifiant, motDePasse }, entetes: { 'x-forwarded-for': ip } });

  test('bon mot de passe : 204, cookie HttpOnly SameSite=Lax, session valable, dernière connexion renseignée', async () => {
    const r = await connexion('ada', MOT_DE_PASSE_TEST, '10.0.1.1');
    assert.equal(r.statusCode, 204);
    const c = cookieSession(r) as unknown as { value: string; httpOnly: boolean; sameSite: string };
    assert.ok(c.value.length > 30);
    assert.equal(c.httpOnly, true);
    assert.equal(c.sameSite, 'Lax');
    const etat = (await requete(t.app, 'GET', '/api/etat', { entetes: { cookie: `${COOKIE_SESSION}=${c.value}` } })).json();
    assert.equal(etat.utilisateur.identifiant, 'Ada');
    assert.ok(etat.utilisateur.derniereConnexion);
    assert.equal((etat.utilisateur as Record<string, unknown>)['mot_de_passe'], undefined);
  });

  test('mauvais mot de passe et identifiant inconnu : même réponse 401', async () => {
    const a = await connexion('ada', 'pas-le-bon-mot-de-passe', '10.0.2.1');
    const b = await connexion('personne', 'pas-le-bon-mot-de-passe', '10.0.2.1');
    assert.equal(a.statusCode, 401);
    assert.equal(b.statusCode, 401);
    assert.deepEqual(a.json(), b.json());
    assert.equal(a.json().erreur, 'identifiants_invalides');
    assert.equal(cookieSession(a), undefined);
  });

  test('durée comparable que l’identifiant existe ou non (la vérification Argon2 a toujours lieu)', async () => {
    await connexion('ada', 'x'.repeat(12), '10.0.3.1'); // échauffement
    const mesure = async (id: string, ip: string) => { const d = performance.now(); await connexion(id, 'mauvais-mot-de-passe', ip); return performance.now() - d; };
    const existant = await mesure('ada', '10.0.3.2');
    const inconnu = await mesure('inconnu-au-bataillon', '10.0.3.3');
    assert.ok(inconnu > existant / 4, `inconnu ${inconnu} ms vs existant ${existant} ms`);
    assert.ok(inconnu > 2, 'le compte inconnu ne doit pas répondre instantanément');
  });

  test('l’identifiant n’est pas sensible à la casse', async () => {
    assert.equal((await connexion('ADA', MOT_DE_PASSE_TEST, '10.0.4.1')).statusCode, 204);
  });

  test('compte désactivé : refusé, même avec le bon mot de passe', async () => {
    const u = await creerUtilisateur(t, { identifiant: 'dormeur', actif: false });
    assert.equal((await connexion('dormeur', u.motDePasse, '10.0.5.1')).statusCode, 401);
  });

  test('corps invalide : 400 avec message', async () => {
    const r = await requete(t.app, 'POST', '/api/connexion', { corps: { identifiant: 'ada' } });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().erreur, 'requete_invalide');
  });

  test('429 après 5 échecs par identifiant, même depuis une autre IP ; le bon mot de passe ne passe plus', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await connexion('victime', 'mauvais-mot-de-passe', `10.1.0.${i + 1}`)).statusCode, 401);
    const r = await connexion('victime', 'mauvais-mot-de-passe', '10.1.0.99');
    assert.equal(r.statusCode, 429);
    assert.equal(r.json().erreur, 'trop_de_requetes');
    assert.ok(Number(r.headers['retry-after']) > 0);
    const bon = await connexion('ada', MOT_DE_PASSE_TEST, '10.1.0.50'); // autre identifiant : non touché
    assert.equal(bon.statusCode, 204);
  });

  test('429 après 5 échecs par IP, quel que soit l’identifiant ; une autre IP reste libre', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await connexion(`inconnu${i}`, 'mauvais-mot-de-passe', '10.2.0.1')).statusCode, 401);
    assert.equal((await connexion('ada', MOT_DE_PASSE_TEST, '10.2.0.1')).statusCode, 429);
    assert.equal((await connexion('ada', MOT_DE_PASSE_TEST, '10.2.0.2')).statusCode, 204);
  });

  test('Origin étrangère : 403', async () => {
    const r = await requete(t.app, 'POST', '/api/connexion', { corps: { identifiant: 'ada', motDePasse: MOT_DE_PASSE_TEST }, entetes: { origin: 'https://pirate.example' } });
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().erreur, 'origine_refusee');
  });

  test('déconnexion : la session disparaît, le cookie est effacé', async () => {
    const u = await creerUtilisateur(t);
    const r = await post(t.app, '/api/deconnexion', null, u);
    assert.equal(r.statusCode, 204);
    assert.equal((await get(t.app, '/api/etat', u)).json().utilisateur, null);
    assert.equal((await get(t.app, '/api/compte', u)).statusCode, 401);
  });

  test('se reconnecter remplace la session du cookie présenté', async () => {
    const u = await creerUtilisateur(t, { identifiant: 'remplace' });
    const avant = (t.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE utilisateur_id = ?').get(u.id) as { n: number }).n;
    const r = await requete(t.app, 'POST', '/api/connexion', { corps: { identifiant: 'remplace', motDePasse: u.motDePasse }, entetes: { cookie: u.cookie, 'x-forwarded-for': '10.4.0.1' } });
    assert.equal(r.statusCode, 204);
    const apres = (t.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE utilisateur_id = ?').get(u.id) as { n: number }).n;
    assert.equal(apres, avant);
  });

  test('GET /api/etat : sans session, utilisateur null et plus d’installation requise', async () => {
    const j = (await get(t.app, '/api/etat')).json();
    assert.equal(j.utilisateur, null);
    assert.equal(j.installationRequise, false);
    assert.ok(ada.id);
    assert.equal(ORIGINE_TEST.startsWith('http'), true);
  });
});

describe('comptes : installation', () => {
  test('sans compte : installationRequise et un seul lien admin valide (recréé au démarrage)', async () => {
    const t = await creerAppTest();
    try {
      assert.equal((await get(t.app, '/api/etat')).json().installationRequise, true);
      const n = () => (t.db.prepare("SELECT COUNT(*) AS n FROM invitations WHERE type = 'compte' AND role = 'admin' AND utilisee_le IS NULL").get() as { n: number }).n;
      assert.equal(n(), 1);
    } finally { await t.fermer(); }
  });

  test('avec des comptes : aucun lien créé au démarrage', async () => {
    const { creerApp } = await import('../../src/app.ts');
    const t = await creerAppTest();
    try {
      await creerUtilisateur(t, { role: 'admin' });
      t.db.exec('DELETE FROM invitations');
      const app2 = await creerApp(t.config, { db: t.db, journal: 'silent', clientBuild: `${t.dossier}/absent` });
      await app2.ready();
      assert.equal((t.db.prepare('SELECT COUNT(*) AS n FROM invitations').get() as { n: number }).n, 0);
      await app2.close();
    } finally { await t.fermer(); }
  });
});
