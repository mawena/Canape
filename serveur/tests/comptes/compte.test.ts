import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { COULEURS_AVATAR } from '@canape/partage';
import { creerAppTest, creerUtilisateur, get, MOT_DE_PASSE_TEST, patch, requete, type AppTest } from '../aides.ts';

describe('comptes : mon compte et annuaire', () => {
  let t: AppTest;
  before(async () => { t = await creerAppTest(); });
  after(() => t.fermer());

  test('routes protégées : 401 sans session', async () => {
    assert.equal((await get(t.app, '/api/compte')).statusCode, 401);
    assert.equal((await patch(t.app, '/api/compte', { prenom: 'X' })).statusCode, 401);
    assert.equal((await get(t.app, '/api/utilisateurs')).statusCode, 401);
    const r = await get(t.app, '/api/compte');
    assert.equal(typeof r.json().message, 'string');
    assert.equal(r.json().erreur, 'non_connecte');
  });

  test('GET /api/compte : le compte et l’espace utilisé', async () => {
    const u = await creerUtilisateur(t, { prenom: 'Mia', quotaOctets: 1000 });
    t.db.prepare("INSERT INTO films (id, proprietaire_id, titre, fichier, nom_origine, taille, ajoute_le) VALUES ('abcdefghijkl', ?, 'F', 'x', 'x', 123, '2026-01-01')").run(u.id);
    const j = (await get(t.app, '/api/compte', u)).json();
    assert.equal(j.prenom, 'Mia');
    assert.equal(j.quotaOctets, 1000);
    assert.equal(j.octetsUtilises, 123);
    assert.equal(j.mot_de_passe, undefined);
  });

  test('modifier prénom et couleur', async () => {
    const u = await creerUtilisateur(t);
    const r = await patch(t.app, '/api/compte', { prenom: '  Nouveau ', couleur: COULEURS_AVATAR[4] }, u);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().prenom, 'Nouveau');
    assert.equal(r.json().couleur, COULEURS_AVATAR[4]);
  });

  test('refus : corps vide, prénom vide, couleur hors palette', async () => {
    const u = await creerUtilisateur(t);
    assert.equal((await patch(t.app, '/api/compte', {}, u)).statusCode, 400);
    assert.equal((await patch(t.app, '/api/compte', { prenom: '   ' }, u)).statusCode, 400);
    assert.equal((await patch(t.app, '/api/compte', { couleur: '#000000' }, u)).statusCode, 400);
  });

  test('on ne peut changer ni son rôle ni son quota par ce chemin', async () => {
    const u = await creerUtilisateur(t, { quotaOctets: 10 });
    await patch(t.app, '/api/compte', { prenom: 'Même', role: 'admin', quotaOctets: null }, u);
    const l = t.db.prepare('SELECT role, quota_octets FROM utilisateurs WHERE id = ?').get(u.id) as { role: string; quota_octets: number };
    assert.equal(l.role, 'viewer');
    assert.equal(l.quota_octets, 10);
  });

  test('mot de passe : le bon actuel change le mot de passe et ferme les autres sessions, pas la courante', async () => {
    const u = await creerUtilisateur(t, { identifiant: 'change-mdp' });
    const autre = (await requete(t.app, 'POST', '/api/connexion', { corps: { identifiant: 'change-mdp', motDePasse: MOT_DE_PASSE_TEST } }));
    const cookieAutre = `canape_session=${autre.cookies[0]?.value}`;
    assert.equal((await t.app.inject({ method: 'GET', url: '/api/compte', headers: { cookie: cookieAutre } })).statusCode, 200);
    const r = await patch(t.app, '/api/compte', { motDePasse: { actuel: MOT_DE_PASSE_TEST, nouveau: 'tout-nouveau-mot-de-passe' } }, u);
    assert.equal(r.statusCode, 200);
    assert.equal((await get(t.app, '/api/compte', u)).statusCode, 200);
    assert.equal((await t.app.inject({ method: 'GET', url: '/api/compte', headers: { cookie: cookieAutre } })).statusCode, 401);
    const ancien = await requete(t.app, 'POST', '/api/connexion', { corps: { identifiant: 'change-mdp', motDePasse: MOT_DE_PASSE_TEST } });
    assert.equal(ancien.statusCode, 401);
    const nouveau = await requete(t.app, 'POST', '/api/connexion', { corps: { identifiant: 'change-mdp', motDePasse: 'tout-nouveau-mot-de-passe' } });
    assert.equal(nouveau.statusCode, 204);
  });

  test('mauvais mot de passe actuel : 400 (jamais 401, pour ne pas déconnecter) ; nouveau trop court : 400 ; limite d’essais', async () => {
    const u = await creerUtilisateur(t);
    const r = await patch(t.app, '/api/compte', { motDePasse: { actuel: 'faux-faux-faux', nouveau: 'tout-nouveau-mot-de-passe' } }, u);
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().erreur, 'mot_de_passe_incorrect');
    const court = await patch(t.app, '/api/compte', { motDePasse: { actuel: MOT_DE_PASSE_TEST, nouveau: 'court' } }, u);
    assert.equal(court.statusCode, 400);
    assert.match(court.json().message, /au moins 10/);
    for (let i = 0; i < 4; i++) await patch(t.app, '/api/compte', { motDePasse: { actuel: 'faux-faux-faux', nouveau: 'tout-nouveau-mot-de-passe' } }, u);
    const bloque = await patch(t.app, '/api/compte', { motDePasse: { actuel: MOT_DE_PASSE_TEST, nouveau: 'tout-nouveau-mot-de-passe' } }, u);
    assert.equal(bloque.statusCode, 429);
  });

  test('GET /api/utilisateurs : comptes actifs, champs minimaux seulement', async () => {
    const u = await creerUtilisateur(t, { prenom: 'Visible' });
    const inactif = await creerUtilisateur(t, { prenom: 'Absent', actif: false });
    const l = (await get(t.app, '/api/utilisateurs', u)).json() as Array<Record<string, unknown>>;
    assert.ok(l.some((x) => x['id'] === u.id));
    assert.ok(!l.some((x) => x['id'] === inactif.id));
    for (const x of l) assert.deepEqual(Object.keys(x).sort(), ['couleur', 'id', 'prenom']);
  });

  test('un compte désactivé ne peut plus rien faire avec sa session', async () => {
    const u = await creerUtilisateur(t);
    t.db.prepare('UPDATE utilisateurs SET actif = 0 WHERE id = ?').run(u.id);
    assert.equal((await get(t.app, '/api/compte', u)).statusCode, 401);
  });
});
