import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { creerAppTest, creerUtilisateur, get, ORIGINE_TEST, patch, post, requete, supprimer, type AppTest } from '../aides.ts';
import { inviterCli, reinitialiserCli } from '../../src/modules/comptes/cli.ts';
import { nombreComptes } from '../../src/modules/comptes/service.ts';

describe('comptes : administration', () => {
  let t: AppTest;
  before(async () => {
    t = await creerAppTest();
    mkdirSync(t.config.films, { recursive: true });
    mkdirSync(t.config.cache, { recursive: true });
  });
  after(() => t.fermer());

  const routes: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string, Record<string, unknown> | null]> = [
    ['GET', '/api/admin/utilisateurs', null],
    ['PATCH', '/api/admin/utilisateurs/1', { prenom: 'X' }],
    ['DELETE', '/api/admin/utilisateurs/1', null],
    ['POST', '/api/admin/utilisateurs/1/reinitialisation', null],
    ['GET', '/api/admin/invitations', null],
    ['POST', '/api/admin/invitations', { role: 'viewer' }],
    ['DELETE', '/api/admin/invitations/1', null],
    ['GET', '/api/admin/stockage', null],
    ['GET', '/api/admin/reglages', null],
    ['PATCH', '/api/admin/reglages', { preparationAuto: false }],
  ];

  test('toutes les routes admin : 401 sans session, 403 pour un viewer', async () => {
    const viewer = await creerUtilisateur(t, { role: 'viewer' });
    for (const [m, url, corps] of routes) {
      const sans = await requete(t.app, m, url, { corps });
      assert.equal(sans.statusCode, 401, `${m} ${url} sans session`);
      const v = await requete(t.app, m, url, { utilisateur: viewer, corps });
      assert.equal(v.statusCode, 403, `${m} ${url} viewer`);
      assert.equal(typeof v.json().message, 'string');
    }
  });

  test('Origin étrangère refusée sur une écriture admin', async () => {
    const admin = await creerUtilisateur(t, { role: 'admin' });
    const r = await requete(t.app, 'POST', '/api/admin/invitations', { utilisateur: admin, corps: { role: 'viewer' }, entetes: { origin: 'https://evil.test' } });
    assert.equal(r.statusCode, 403);
  });

  test('liste des comptes avec octets utilisés ; modification des droits et du quota', async () => {
    const admin = await creerUtilisateur(t, { role: 'admin' });
    const u = await creerUtilisateur(t, { prenom: 'Lou' });
    t.db.prepare("INSERT INTO films (id, proprietaire_id, titre, fichier, nom_origine, taille, ajoute_le) VALUES ('aaaaaaaaaaaa', ?, 'F', 'x', 'x', 500, '2026-01-01')").run(u.id);
    const liste = (await get(t.app, '/api/admin/utilisateurs', admin)).json() as Array<Record<string, unknown>>;
    const lou = liste.find((x) => x['id'] === u.id);
    assert.equal(lou?.['octetsUtilises'], 500);
    assert.equal(lou?.['actif'], true);
    assert.equal(lou?.['mot_de_passe'], undefined);
    const r = await patch(t.app, `/api/admin/utilisateurs/${u.id}`, { peutTeleverser: false, quotaOctets: 42, prenom: 'Louise' }, admin);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().peutTeleverser, false);
    assert.equal(r.json().quotaOctets, 42);
    assert.equal(r.json().prenom, 'Louise');
    const illimite = await patch(t.app, `/api/admin/utilisateurs/${u.id}`, { quotaOctets: null }, admin);
    assert.equal(illimite.json().quotaOctets, null);
    assert.equal((await patch(t.app, `/api/admin/utilisateurs/${u.id}`, { quotaOctets: -1 }, admin)).statusCode, 400);
    assert.equal((await patch(t.app, `/api/admin/utilisateurs/${u.id}`, {}, admin)).statusCode, 400);
    assert.equal((await patch(t.app, '/api/admin/utilisateurs/999999', { prenom: 'Z' }, admin)).statusCode, 404);
  });

  test('désactiver un compte ferme ses sessions ; il ne peut plus se connecter', async () => {
    const admin = await creerUtilisateur(t, { role: 'admin' });
    const u = await creerUtilisateur(t);
    assert.equal((await get(t.app, '/api/compte', u)).statusCode, 200);
    assert.equal((await patch(t.app, `/api/admin/utilisateurs/${u.id}`, { actif: false }, admin)).statusCode, 200);
    assert.equal((await get(t.app, '/api/compte', u)).statusCode, 401);
    assert.equal((t.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE utilisateur_id = ?').get(u.id) as { n: number }).n, 0);
    const c = await post(t.app, '/api/connexion', { identifiant: u.identifiant, motDePasse: u.motDePasse });
    assert.equal(c.statusCode, 401);
    const annuaire = (await get(t.app, '/api/utilisateurs', admin)).json() as Array<{ id: number }>;
    assert.ok(!annuaire.some((x) => x.id === u.id));
    assert.equal((await patch(t.app, `/api/admin/utilisateurs/${u.id}`, { actif: true }, admin)).statusCode, 200);
    assert.equal((await post(t.app, '/api/connexion', { identifiant: u.identifiant, motDePasse: u.motDePasse })).statusCode, 204);
  });

  test('le dernier administrateur actif ne peut être ni rétrogradé, ni désactivé, ni supprimé', async () => {
    const seul = await creerAppTest();
    try {
      const admin = await creerUtilisateur(seul, { role: 'admin' });
      for (const corps of [{ role: 'viewer' }, { actif: false }]) {
        const r = await patch(seul.app, `/api/admin/utilisateurs/${admin.id}`, corps, admin);
        assert.equal(r.statusCode, 409);
        assert.equal(r.json().erreur, 'dernier_admin');
      }
      const d = await supprimer(seul.app, `/api/admin/utilisateurs/${admin.id}`, admin);
      assert.equal(d.statusCode, 409);
      const autre = await creerUtilisateur(seul, { role: 'admin' });
      assert.equal((await patch(seul.app, `/api/admin/utilisateurs/${admin.id}`, { role: 'viewer' }, autre)).statusCode, 200);
      // un admin désactivé ne compte pas : `autre` est de nouveau le dernier
      const r = await patch(seul.app, `/api/admin/utilisateurs/${autre.id}`, { role: 'viewer' }, autre);
      assert.equal(r.statusCode, 409);
    } finally { await seul.fermer(); }
  });

  test('suppression : compte, films et fichiers retirés ; pas de suppression de soi', async () => {
    const admin = await creerUtilisateur(t, { role: 'admin' });
    const u = await creerUtilisateur(t);
    t.db.prepare("INSERT INTO films (id, proprietaire_id, titre, fichier, nom_origine, taille, ajoute_le) VALUES ('bbbbbbbbbbbb', ?, 'F', 'bbbbbbbbbbbb/original.mp4', 'x', 5, '2026-01-01')").run(u.id);
    mkdirSync(path.join(t.config.films, 'bbbbbbbbbbbb'), { recursive: true });
    writeFileSync(path.join(t.config.films, 'bbbbbbbbbbbb', 'original.mp4'), 'x');
    assert.equal((await supprimer(t.app, `/api/admin/utilisateurs/${admin.id}`, admin)).statusCode, 409);
    assert.equal((await supprimer(t.app, `/api/admin/utilisateurs/${u.id}`, admin)).statusCode, 204);
    assert.equal(t.db.prepare('SELECT 1 FROM films WHERE id = ?').get('bbbbbbbbbbbb'), undefined);
    assert.equal(t.db.prepare('SELECT 1 FROM utilisateurs WHERE id = ?').get(u.id), undefined);
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(path.join(t.config.films, 'bbbbbbbbbbbb')), false);
    assert.equal((await supprimer(t.app, `/api/admin/utilisateurs/${u.id}`, admin)).statusCode, 404);
  });

  test('invitations : création, liste, révocation ; durée et rôle validés', async () => {
    const admin = await creerUtilisateur(t, { role: 'admin' });
    const c = await post(t.app, '/api/admin/invitations', { role: 'viewer', prenomSuggere: 'Zoé', dureeJours: 3 }, admin);
    assert.equal(c.statusCode, 201);
    assert.match(c.json().lien, new RegExp(`^${ORIGINE_TEST}/invitation/[A-Za-z0-9_-]{20,}$`));
    const liste = (await get(t.app, '/api/admin/invitations', admin)).json() as Array<Record<string, unknown>>;
    const i = liste.find((x) => x['id'] === c.json().id);
    assert.equal(i?.['prenomSuggere'], 'Zoé');
    assert.equal(i?.['role'], 'viewer');
    assert.ok(Math.abs(Date.parse(i?.['expireLe'] as string) - Date.now() - 3 * 86_400_000) < 60_000);
    assert.equal((await post(t.app, '/api/admin/invitations', { role: 'root' }, admin)).statusCode, 400);
    assert.equal((await post(t.app, '/api/admin/invitations', { role: 'viewer', dureeJours: 0 }, admin)).statusCode, 400);
    assert.equal((await post(t.app, '/api/admin/invitations', {}, admin)).statusCode, 400);
    assert.equal((await supprimer(t.app, `/api/admin/invitations/${c.json().id}`, admin)).statusCode, 204);
    assert.equal((await supprimer(t.app, `/api/admin/invitations/${c.json().id}`, admin)).statusCode, 404);
    const jeton = (c.json().lien as string).split('/').pop();
    assert.equal((await get(t.app, `/api/invitations/${jeton}`)).json().valide, false);
  });

  test('réinitialisation depuis l’admin : lien, compte inconnu 404', async () => {
    const admin = await creerUtilisateur(t, { role: 'admin' });
    const u = await creerUtilisateur(t);
    const r = await post(t.app, `/api/admin/utilisateurs/${u.id}/reinitialisation`, undefined, admin);
    assert.equal(r.statusCode, 201);
    assert.match(r.json().lien, /\/invitation\//);
    assert.equal((await post(t.app, '/api/admin/utilisateurs/999999/reinitialisation', undefined, admin)).statusCode, 404);
  });

  test('stockage : disque, films par propriétaire, cache', async () => {
    const admin = await creerUtilisateur(t, { role: 'admin' });
    writeFileSync(path.join(t.config.cache, 'a.bin'), Buffer.alloc(1000));
    mkdirSync(path.join(t.config.cache, 'sous'), { recursive: true });
    writeFileSync(path.join(t.config.cache, 'sous', 'b.bin'), Buffer.alloc(234));
    const j = (await get(t.app, '/api/admin/stockage', admin)).json();
    assert.ok(j.disque.total > 0 && j.disque.libre > 0 && j.disque.libre <= j.disque.total);
    assert.equal(j.cache, 1234);
    assert.equal(typeof j.cacheMax, 'number');
    assert.ok(Array.isArray(j.parUtilisateur));
    assert.ok(j.films >= 0);
    // mise en cache 60 s : un fichier ajouté n'apparaît pas tout de suite
    writeFileSync(path.join(t.config.cache, 'c.bin'), Buffer.alloc(100));
    assert.equal((await get(t.app, '/api/admin/stockage', admin)).json().cache, 1234);
  });

  test('réglages : lecture, modification, liste blanche, valeurs validées', async () => {
    const admin = await creerUtilisateur(t, { role: 'admin' });
    const defaut = (await get(t.app, '/api/admin/reglages', admin)).json();
    assert.equal(typeof defaut.preparationAuto, 'boolean');
    assert.equal(typeof defaut.quotaDefautOctets, 'number');
    const r = await patch(t.app, '/api/admin/reglages', { preparationAuto: !defaut.preparationAuto, quotaDefautOctets: 5_000_000 }, admin);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().quotaDefautOctets, 5_000_000);
    assert.equal((await get(t.app, '/api/admin/reglages', admin)).json().preparationAuto, !defaut.preparationAuto);
    for (const mauvais of [{ inconnu: 1 }, { preparationAuto: 'oui' }, { quotaDefautOctets: -5 }, { quotaDefautOctets: 1.5 }, {}]) {
      const x = await patch(t.app, '/api/admin/reglages', mauvais, admin);
      assert.equal(x.statusCode, 400, JSON.stringify(mauvais));
      assert.equal(typeof x.json().message, 'string');
    }
    // le quota par défaut s'applique à un nouveau viewer
    const inv = await post(t.app, '/api/admin/invitations', { role: 'viewer' }, admin);
    const jeton = (inv.json().lien as string).split('/').pop();
    const a = await post(t.app, `/api/invitations/${jeton}`, { prenom: 'Neo', identifiant: 'neo-quota', motDePasse: 'un-mot-de-passe-long' });
    assert.equal(a.statusCode, 201);
    assert.equal(a.json().quotaOctets, 5_000_000);
  });
});

describe('comptes : premier démarrage et ligne de commande', () => {
  let t: AppTest;
  before(async () => { t = await creerAppTest(); });
  after(() => t.fermer());

  test('sans compte : installationRequise, et un seul lien admin valide à la fois', async () => {
    assert.equal((await get(t.app, '/api/etat')).json().installationRequise, true);
    const ctx = { config: t.config, db: t.db };
    const l1 = await inviterCli(ctx, { role: 'admin', jours: 7 });
    const l2 = await inviterCli(ctx, { role: 'admin', jours: 7 });
    assert.match(l1, /^http:\/\/localhost:8080\/invitation\//);
    assert.notEqual(l1, l2);
    assert.equal((await get(t.app, `/api/invitations/${l1.split('/').pop()}`)).json().valide, false);
    assert.equal((await get(t.app, `/api/invitations/${l2.split('/').pop()}`)).json().valide, true);
    const valides = (t.db.prepare("SELECT COUNT(*) AS n FROM invitations WHERE role = 'admin' AND utilisee_le IS NULL").get() as { n: number }).n;
    assert.equal(valides, 1);
  });

  test('inviter (viewer, durée) puis réinitialiser par la CLI', async () => {
    const ctx = { config: t.config, db: t.db };
    const lien = await inviterCli(ctx, { role: 'admin', jours: 2 });
    const a = await post(t.app, `/api/invitations/${lien.split('/').pop()}`, { prenom: 'Ada', identifiant: 'ada-cli', motDePasse: 'un-mot-de-passe-long' });
    assert.equal(a.statusCode, 201);
    assert.equal(nombreComptes(t.db), 1);
    assert.equal((await get(t.app, '/api/etat')).json().installationRequise, false);
    const viewer = await inviterCli(ctx, { role: 'viewer', jours: 1 });
    const info = (await get(t.app, `/api/invitations/${viewer.split('/').pop()}`)).json();
    assert.equal(info.role, 'viewer');
    // un lien admin créé par la CLI quand des comptes existent ne remplace pas un autre lien
    const a1 = await inviterCli(ctx, { role: 'admin', jours: 1 });
    const a2 = await inviterCli(ctx, { role: 'admin', jours: 1 });
    assert.equal((await get(t.app, `/api/invitations/${a1.split('/').pop()}`)).json().valide, true);
    assert.equal((await get(t.app, `/api/invitations/${a2.split('/').pop()}`)).json().valide, true);
    const rl = await reinitialiserCli(ctx, 'ADA-CLI');
    assert.equal((await get(t.app, `/api/invitations/${rl.split('/').pop()}`)).json().type, 'reinitialisation');
    await assert.rejects(reinitialiserCli(ctx, 'inconnu'), /Aucun compte/);
  });
});
