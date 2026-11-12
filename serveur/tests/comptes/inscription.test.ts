import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { Compte, EtatApi, EtatInscription, Utilisateur, UtilisateurAdmin, UtilisateurPublic } from '@canape/partage';
import type { LightMyRequestResponse } from 'fastify';
import { creerAppTest, creerUtilisateur, get, ORIGINE_TEST, patch, post, type AppTest } from '../aides.ts';
import { creerJeton } from '../../src/modules/comptes/inscription.ts';
import { inscriptionsCli } from '../../src/modules/comptes/cli.ts';
import { lireReglages } from '../../src/modules/comptes/service.ts';
import { DOSSIER_MIGRATIONS, ouvrirBase, migrer } from '../../src/db/index.ts';

let ipSuivante = 10;
const nouvelleIp = (): string => `10.1.${Math.floor(ipSuivante / 250)}.${ipSuivante++ % 250}`;

describe('inscription libre', () => {
  let t: AppTest;
  before(async () => { t = await creerAppTest(); });
  after(() => t.fermer());

  /** Un jeton déjà « mûr » (émis il y a `ageMs`). */
  const jeton = (ageMs = 10_000): string => creerJeton(t.db, Date.now() - ageMs);
  let n = 0;
  const corps = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
    prenom: 'Camille', identifiant: `camille${++n}`, motDePasse: 'un-mot-de-passe-long', accepteRegles: true, jeton: jeton(), ...o,
  });
  const inscrire = (c: Record<string, unknown>, ip = nouvelleIp(), origin: string = ORIGINE_TEST): Promise<LightMyRequestResponse> =>
    t.app.inject({ method: 'POST', url: '/api/inscription', headers: { origin }, remoteAddress: ip, payload: c as never });
  const erreur = (r: LightMyRequestResponse) => r.json() as { erreur: string; message: string };

  test('parcours complet : jeton, inscription, session, compte, quota, torrent refusé par défaut', async () => {
    const etat = (await get(t.app, '/api/inscription')).json() as EtatInscription;
    assert.equal(etat.ouverte, true);
    assert.equal(etat.raison, null);
    assert.match(etat.jeton ?? '', /^[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.equal(((await get(t.app, '/api/etat')).json() as EtatApi).inscriptionOuverte, true);

    // Trop tôt : refusé ; après 3 s : accepté (jeton réellement émis par GET).
    const trop = await inscrire(corps({ jeton: etat.jeton }));
    assert.equal(trop.statusCode, 400);
    await new Promise((ok) => setTimeout(ok, 3100));
    const r = await inscrire(corps({ identifiant: 'Zoé_01', jeton: etat.jeton }));
    assert.equal(r.statusCode, 201, r.body);
    const u = r.json() as Utilisateur;
    assert.deepEqual([u.role, u.origine, u.peutTeleverser, u.peutTorrent, u.quotaOctets], ['viewer', 'inscription', true, false, 20 * 1024 ** 3]);
    assert.ok(u.derniereConnexion);
    assert.equal('motDePasse' in u, false);
    const cookie = String(r.headers['set-cookie']).split(';')[0] as string;
    const cc = await t.app.inject({ method: 'GET', url: '/api/compte', headers: { cookie } });
    assert.equal(cc.statusCode, 200);
    assert.equal((cc.json() as Compte).identifiant, 'Zoé_01');
    assert.equal((cc.json() as Compte).origine, 'inscription');
    // Peut se reconnecter avec son mot de passe.
    const co = await post(t.app, '/api/connexion', { identifiant: 'zoé_01', motDePasse: 'un-mot-de-passe-long' });
    assert.equal(co.statusCode, 204);
    // Droits : envoi permis (pas 403), torrent refusé.
    const tor = await t.app.inject({ method: 'POST', url: '/api/torrents', headers: { cookie, origin: ORIGINE_TEST }, payload: { magnet: 'magnet:?xt=urn:btih:' + 'a'.repeat(40) } });
    assert.equal(tor.statusCode, 403);
    assert.equal(erreur(tor).message, "L'ajout par torrent n'est pas ouvert pour ton compte.");
    const liste = await t.app.inject({ method: 'GET', url: '/api/torrents', headers: { cookie } });
    assert.equal((liste.json() as { peutAjouter: boolean }).peutAjouter, false);
  });

  test('jeton : trop récent, trop vieux, falsifié, absent ; réutilisable dans la fenêtre', async () => {
    assert.equal((await inscrire(corps({ jeton: jeton(500) }))).statusCode, 400);
    assert.match(erreur(await inscrire(corps({ jeton: jeton(500) }))).message, /rapide/);
    assert.equal((await inscrire(corps({ jeton: jeton(3 * 3_600_000) }))).statusCode, 400);
    const bon = jeton();
    const [h, a, s] = bon.split('.') as [string, string, string];
    assert.equal((await inscrire(corps({ jeton: `${h}.${a}.${s.slice(1)}x` }))).statusCode, 400);
    assert.equal((await inscrire(corps({ jeton: `${(Number.parseInt(h, 36) - 99_000_000).toString(36)}.${a}.${s}` }))).statusCode, 400);
    assert.equal((await inscrire(corps({ jeton: undefined }))).statusCode, 400);
    assert.equal((await inscrire(corps({ jeton: 42 }))).statusCode, 400);
    // Choix : un jeton valide sert plusieurs fois (sans état) ; les limites par IP bornent l'abus.
    assert.equal((await inscrire(corps({ jeton: bon }))).statusCode, 201);
    assert.equal((await inscrire(corps({ jeton: bon }))).statusCode, 201);
  });

  test('champ piège, règles, validations', async () => {
    assert.equal((await inscrire(corps({ site: 'http://spam' }))).statusCode, 400);
    assert.equal((await inscrire(corps({ site: '' }))).statusCode, 201);
    const sans = await inscrire(corps({ accepteRegles: false }));
    assert.equal(sans.statusCode, 400);
    assert.match(erreur(sans).message, /règles/);
    assert.equal((await inscrire(corps({ accepteRegles: 'true' }))).statusCode, 400);
    const cas: Array<[Record<string, unknown>, RegExp]> = [
      [{ prenom: '  ' }, /prénom/],
      [{ prenom: 'x'.repeat(41) }, /prénom/],
      [{ identifiant: 'ab' }, /identifiant/],
      [{ identifiant: 'a'.repeat(33) }, /identifiant/],
      [{ identifiant: 'a b c' }, /identifiant/],
      [{ identifiant: 'a/b;c' }, /identifiant/],
      [{ identifiant: 'pas@un@mail' }, /e-mail/],
      [{ identifiant: 'moi@exemple' }, /e-mail/],
      [{ motDePasse: 'court' }, /au moins 10/],
      [{ identifiant: 'identifiant-long', motDePasse: 'Identifiant-Long' }, /identifiant/],
      [{ couleur: '#123456' }, /couleur/],
      [{ prenom: 5 }, /prénom/],
      [{ motDePasse: undefined }, /mot de passe/],
    ];
    for (const [o, re] of cas) {
      const r = await inscrire(corps(o));
      assert.equal(r.statusCode, 400, JSON.stringify(o));
      assert.match(erreur(r).message, re, JSON.stringify(o));
    }
    assert.equal((await inscrire(corps({ identifiant: 'moi@exemple.fr', couleur: '#8e2433' }))).statusCode, 201);
    assert.equal((await inscrire(corps({ identifiant: 'a.b_c-d' }))).statusCode, 201);
  });

  test('409 identifiant pris (sans tenir compte de la casse)', async () => {
    const c = corps({ identifiant: 'DoublonUn' });
    assert.equal((await inscrire(c)).statusCode, 201);
    const r = await inscrire(corps({ identifiant: 'doublonun' }));
    assert.equal(r.statusCode, 409);
    assert.equal(erreur(r).erreur, 'identifiant_pris');
  });

  test('Origin étrangère refusée', async () => {
    const r = await inscrire(corps(), nouvelleIp(), 'https://pirate.example');
    assert.equal(r.statusCode, 403);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM utilisateurs WHERE identifiant LIKE ?').get('camille%') !== undefined, true);
  });

  test('429 : 3 inscriptions par heure et par IP, avec Retry-After', async () => {
    const ip = nouvelleIp();
    for (let i = 0; i < 3; i++) assert.equal((await inscrire(corps(), ip)).statusCode, 201);
    const r = await inscrire(corps(), ip);
    assert.equal(r.statusCode, 429);
    assert.ok(Number(r.headers['retry-after']) > 0);
    assert.equal((await inscrire(corps(), nouvelleIp())).statusCode, 201);
  });

  test('429 : 30 par jour en tout', async () => {
    const t2 = await creerAppTest({ env: {} });
    try {
      const deja = (t2.db.prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE origine = 'inscription'").get() as { n: number }).n;
      const ins = t2.db.prepare("INSERT INTO utilisateurs (prenom, identifiant, mot_de_passe, role, origine, cree_le) VALUES ('x', ?, 'x', 'viewer', 'inscription', ?)");
      for (let i = deja; i < 30; i++) ins.run(`bot${i}`, new Date().toISOString());
      const r = await t2.app.inject({
        method: 'POST', url: '/api/inscription', headers: { origin: ORIGINE_TEST }, remoteAddress: nouvelleIp(),
        payload: { prenom: 'A', identifiant: 'nouveau1', motDePasse: 'un-mot-de-passe-long', accepteRegles: true, jeton: creerJeton(t2.db, Date.now() - 10_000) },
      });
      assert.equal(r.statusCode, 429);
    } finally {
      await t2.fermer();
    }
  });

  test('429 : trop de tentatives par IP (sondage d’identifiants)', async () => {
    const ip = nouvelleIp();
    let dernier = 0;
    for (let i = 0; i < 25; i++) dernier = (await inscrire(corps({ identifiant: 'ab' }), ip)).statusCode;
    assert.equal(dernier, 429);
  });

  test('réglages : fermées, complètes, torrents, quota ; admin', async () => {
    const admin = await creerUtilisateur(t, { role: 'admin', origine: 'installation' });
    const defauts = (await get(t.app, '/api/admin/reglages', admin)).json() as Record<string, unknown>;
    assert.equal(defauts['inscriptionsOuvertes'], true);
    assert.equal(defauts['quotaInscriptionOctets'], 20 * 1024 ** 3);
    assert.equal(defauts['torrentsInscrits'], false);
    assert.equal(defauts['maxComptesInscrits'], 100);
    for (const mauvais of [{ inscriptionsOuvertes: 'oui' }, { quotaInscriptionOctets: -1 }, { torrentsInscrits: 1 }, { maxComptesInscrits: 1.5 }, { maxComptesInscrits: 2_000_000 }]) {
      assert.equal((await patch(t.app, '/api/admin/reglages', mauvais, admin)).statusCode, 400, JSON.stringify(mauvais));
    }

    // Fermées
    assert.equal((await patch(t.app, '/api/admin/reglages', { inscriptionsOuvertes: false }, admin)).statusCode, 200);
    const f = (await get(t.app, '/api/inscription')).json() as EtatInscription;
    assert.deepEqual([f.ouverte, f.jeton], [false, null]);
    assert.match(f.raison ?? '', /fermées/);
    assert.equal(((await get(t.app, '/api/etat')).json() as EtatApi).inscriptionOuverte, false);
    const r = await inscrire(corps());
    assert.equal(r.statusCode, 403);
    await patch(t.app, '/api/admin/reglages', { inscriptionsOuvertes: true }, admin);

    // Complètes
    const nb = (t.db.prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE origine = 'inscription'").get() as { n: number }).n;
    await patch(t.app, '/api/admin/reglages', { maxComptesInscrits: nb }, admin);
    const c = (await get(t.app, '/api/inscription')).json() as EtatInscription;
    assert.deepEqual([c.ouverte, c.jeton], [false, null]);
    assert.match(c.raison ?? '', /complètes/);
    assert.equal(((await get(t.app, '/api/etat')).json() as EtatApi).inscriptionOuverte, false);
    assert.equal((await inscrire(corps())).statusCode, 403);
    await patch(t.app, '/api/admin/reglages', { maxComptesInscrits: 1000 }, admin);

    // Torrents des inscrits + quota : s'appliquent aux nouveaux comptes
    await patch(t.app, '/api/admin/reglages', { torrentsInscrits: true, quotaInscriptionOctets: 5_000 }, admin);
    const ok = await inscrire(corps({ identifiant: 'avec-torrent' }));
    assert.equal(ok.statusCode, 201);
    const u = ok.json() as Utilisateur;
    assert.deepEqual([u.peutTorrent, u.quotaOctets], [true, 5_000]);
    await patch(t.app, '/api/admin/reglages', { torrentsInscrits: false, quotaInscriptionOctets: 20 * 1024 ** 3 }, admin);

    // L'admin donne le droit à un compte
    const sans = (await inscrire(corps({ identifiant: 'sans-torrent' }))).json() as Utilisateur;
    const cookie = String((await inscrire(corps({ identifiant: 'sans-torrent-2' }))).headers['set-cookie']).split(';')[0] as string;
    assert.equal(sans.peutTorrent, false);
    const m = await patch(t.app, `/api/admin/utilisateurs/${sans.id}`, { peutTorrent: true }, admin);
    assert.equal(m.statusCode, 200);
    assert.equal((m.json() as UtilisateurAdmin).peutTorrent, true);
    const liste = (await get(t.app, '/api/admin/utilisateurs', admin)).json() as UtilisateurAdmin[];
    const ligne = liste.find((x) => x.id === sans.id) as UtilisateurAdmin;
    assert.deepEqual([ligne.origine, ligne.peutTorrent], ['inscription', true]);
    assert.equal(liste.find((x) => x.id === admin.id)?.origine, 'installation');
    assert.ok(cookie);
    assert.equal((await patch(t.app, `/api/admin/utilisateurs/${sans.id}`, { peutTorrent: 'x' }, admin)).statusCode, 400);
  });

  test('un compte accordé `peutTorrent` peut ajouter ; un invité l’a par défaut', async () => {
    const sans = await creerUtilisateur(t, { origine: 'inscription', peutTorrent: false });
    const avec = await creerUtilisateur(t, { origine: 'inscription', peutTorrent: true });
    const invite = await creerUtilisateur(t);
    const lire = async (u: typeof sans) => ((await get(t.app, '/api/torrents', u)).json() as { peutAjouter: boolean }).peutAjouter;
    assert.deepEqual([await lire(sans), await lire(avec), await lire(invite)], [false, true, true]);
    const r = await post(t.app, '/api/torrents', { magnet: 'magnet:?xt=urn:btih:' + 'b'.repeat(40) }, sans);
    assert.equal(r.statusCode, 403);
  });

  test('invitation : origine « invitation », droit torrent ; premier admin : « installation »', async () => {
    const vide = await creerAppTest();
    try {
      const { creerInvitation } = await import('../../src/modules/comptes/service.ts');
      const i1 = creerInvitation(vide.db, vide.config, { type: 'compte', role: 'admin' });
      const r1 = await post(vide.app, `/api/invitations/${i1.jeton}`, { prenom: 'Chef', identifiant: 'chef', motDePasse: 'mot-de-passe-long' });
      assert.equal((r1.json() as Utilisateur).origine, 'installation');
      const i2 = creerInvitation(vide.db, vide.config, { type: 'compte', role: 'viewer', creePar: (r1.json() as Utilisateur).id });
      const r2 = await post(vide.app, `/api/invitations/${i2.jeton}`, { prenom: 'Ami', identifiant: 'ami', motDePasse: 'mot-de-passe-long' });
      const u2 = r2.json() as Utilisateur;
      assert.deepEqual([u2.origine, u2.peutTorrent], ['invitation', true]);
    } finally { await vide.fermer(); }
  });

  test('vie privée : GET /api/utilisateurs et recherche par identifiant', async () => {
    const t3 = await creerAppTest();
    try {
      const admin = await creerUtilisateur(t3, { role: 'admin', prenom: 'Chef' });
      const a = await creerUtilisateur(t3, { prenom: 'Alice', identifiant: 'alice', origine: 'inscription' });
      const b = await creerUtilisateur(t3, { prenom: 'Bob', identifiant: 'bob', origine: 'inscription' });
      const inv = await creerUtilisateur(t3, { prenom: 'Invité', identifiant: 'invite-1' });
      const lister = async (u: typeof a, q = '') => ((await get(t3.app, `/api/utilisateurs${q}`, u)).json() as UtilisateurPublic[]);
      const noms = (l: UtilisateurPublic[]) => l.map((x) => x.prenom).sort();
      // L'inscrit ne voit que lui et l'admin ; l'admin voit tout le monde.
      assert.deepEqual(noms(await lister(a)), ['Alice', 'Chef']);
      assert.deepEqual(noms(await lister(admin)), ['Alice', 'Bob', 'Chef', 'Invité']);
      for (const u of await lister(a)) assert.deepEqual(Object.keys(u).sort(), ['couleur', 'id', 'prenom']);
      // Recherche exacte (casse indifférente) ; absent -> [] ; pas de recherche partielle ; pas soi-même.
      assert.deepEqual(noms(await lister(a, '?identifiant=BOB')), ['Bob']);
      assert.deepEqual(await lister(a, '?identifiant=bo'), []);
      assert.deepEqual(await lister(a, '?identifiant=nexistepas'), []);
      assert.deepEqual(await lister(a, '?identifiant=alice'), []);
      assert.equal((await get(t3.app, '/api/utilisateurs?identifiant=', a)).statusCode, 400);
      // Un compte désactivé ne se trouve pas.
      t3.db.prepare('UPDATE utilisateurs SET actif = 0 WHERE id = ?').run(inv.id);
      assert.deepEqual(await lister(a, '?identifiant=invite-1'), []);
      t3.db.prepare('UPDATE utilisateurs SET actif = 1 WHERE id = ?').run(inv.id);
      // Une séance où Alice invite Bob : sans recherche, refusé ; après recherche, permis.
      const refus = await post(t3.app, '/api/seances', { invites: [b.id] }, a);
      assert.equal(refus.statusCode, 400);
      assert.deepEqual(noms(await lister(a)), ['Alice', 'Chef']);
      await lister(a, '?identifiant=bob');
      const ok = await post(t3.app, '/api/seances', { invites: [b.id] }, a);
      assert.equal(ok.statusCode, 201, ok.body);
      // Bob et Alice se connaissent désormais ; Invité reste inconnu des deux.
      assert.deepEqual(noms(await lister(a)), ['Alice', 'Bob', 'Chef']);
      assert.deepEqual(noms(await lister(b)), ['Alice', 'Bob', 'Chef']);
      // Partage d'un film : même règle ; le film privé d'un autre reste 404.
      t3.db.prepare("INSERT INTO films (id, proprietaire_id, titre, fichier, nom_origine, taille, ajoute_le) VALUES ('abcdefghijkl', ?, 'F', 'x', 'x', 1, '2026-01-01')").run(a.id);
      assert.equal((await patch(t3.app, '/api/films/abcdefghijkl', { visibilite: 'partage', partages: [inv.id] }, a)).statusCode, 400);
      assert.equal((await patch(t3.app, '/api/films/abcdefghijkl', { visibilite: 'partage', partages: [b.id] }, a)).statusCode, 200);
      assert.equal((await get(t3.app, '/api/films/abcdefghijkl', b)).statusCode, 200);
      assert.equal((await get(t3.app, '/api/films/abcdefghijkl', inv)).statusCode, 404);
      assert.equal((await get(t3.app, '/api/films/zzzzzzzzzzzz', inv)).statusCode, 404);
      // Invité qui connaît celui qui l'a invité (lien d'invitation enregistré).
      t3.db.prepare("INSERT INTO invitations (jeton_hash, type, role, utilisateur_id, cree_par, cree_le, expire_le, utilisee_le) VALUES ('h', 'compte', 'viewer', ?, ?, '2026-01-01', '2027-01-01', '2026-01-02')").run(inv.id, a.id);
      assert.ok(noms(await lister(inv)).includes('Alice'));
      assert.ok(noms(await lister(a)).includes('Invité'));
      // Admin : peut cibler n'importe qui.
      assert.equal((await post(t3.app, '/api/seances', { invites: [inv.id, b.id] }, admin)).statusCode, 201);
    } finally { await t3.fermer(); }
  });

  test('recherche d’identifiant : 30 par minute', async () => {
    const u = await creerUtilisateur(t);
    let dernier = 0;
    for (let i = 0; i < 31; i++) dernier = (await get(t.app, '/api/utilisateurs?identifiant=x', u)).statusCode;
    assert.equal(dernier, 429);
  });

  test('ligne de commande : admin inscriptions', async () => {
    const t4 = await creerAppTest();
    try {
      const ctx = { config: t4.config, db: t4.db };
      assert.match(await inscriptionsCli(ctx), /ouvertes/);
      assert.match(await inscriptionsCli(ctx, 'fermer'), /fermées/);
      assert.equal(lireReglages(t4.db, t4.config).inscriptionsOuvertes, false);
      assert.match(await inscriptionsCli(ctx, 'ouvrir'), /ouvertes/);
      await assert.rejects(inscriptionsCli(ctx, 'x'));
    } finally { await t4.fermer(); }
  });
});

describe('migration 011 sur une base 1.1', () => {
  test('comptes existants : origine et peut_torrent', () => {
    const avant = mkdtempSync(path.join(tmpdir(), 'canape-mig-'));
    try {
      for (const f of readdirSync(DOSSIER_MIGRATIONS)) if (f !== '011_inscription.sql') copyFileSync(path.join(DOSSIER_MIGRATIONS, f), path.join(avant, f));
      const db = ouvrirBase(':memory:');
      migrer(db, avant);
      const ins = db.prepare("INSERT INTO utilisateurs (prenom, identifiant, mot_de_passe, role, cree_le) VALUES (?, ?, 'x', ?, '2026-01-01')");
      ins.run('Chef', 'chef', 'admin');
      ins.run('Deuxieme', 'deux', 'admin');
      ins.run('Ami', 'ami', 'viewer');
      assert.deepEqual(migrer(db), ['011_inscription.sql']);
      const l = db.prepare('SELECT identifiant, origine, peut_torrent FROM utilisateurs ORDER BY id').all();
      assert.deepEqual(l.map((x) => ({ ...x })), [
        { identifiant: 'chef', origine: 'installation', peut_torrent: 1 },
        { identifiant: 'deux', origine: 'invitation', peut_torrent: 1 },
        { identifiant: 'ami', origine: 'invitation', peut_torrent: 1 },
      ]);
      db.close();
    } finally { rmSync(avant, { recursive: true, force: true }); }
  });
});
