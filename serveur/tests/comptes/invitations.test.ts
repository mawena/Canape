import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { COOKIE_SESSION, COULEURS_AVATAR } from '@canape/partage';
import { sha256Hex } from '../../src/commun/identifiants.ts';
import { verifierMotDePasse } from '../../src/commun/motdepasse.ts';
import { creerInvitation } from '../../src/modules/comptes/index.ts';
import { creerAppTest, creerUtilisateur, get, patch, post, type AppTest, type UtilisateurTest } from '../aides.ts';

describe('comptes : invitations et réinitialisation', () => {
  let t: AppTest;
  let admin: UtilisateurTest;
  const jetonDe = (lien: string) => lien.split('/').pop() as string;
  before(async () => {
    t = await creerAppTest({ env: { CANAPE_URL_PUBLIQUE: 'https://canape.example.org' } });
    admin = await creerUtilisateur(t, { role: 'admin', prenom: 'Léa', identifiant: 'lea' });
    // les requêtes de test portent l'Origin de la configuration
    admin.entetes.origin = 'https://canape.example.org';
  });
  after(() => t.fermer());

  const inviter = async (corps: Record<string, unknown> = { role: 'viewer' }) =>
    (await post(t.app, '/api/admin/invitations', corps, admin)).json().lien as string;
  const libre = (corps: Record<string, unknown>, jeton: string) =>
    t.app.inject({ method: 'POST', url: `/api/invitations/${jeton}`, payload: corps, headers: { origin: 'https://canape.example.org' } });

  test('création : lien public, 7 jours par défaut, jeton non stocké en clair', async () => {
    const r = await post(t.app, '/api/admin/invitations', { role: 'viewer', prenomSuggere: 'Sam' }, admin);
    assert.equal(r.statusCode, 201);
    const { lien, expireLe } = r.json();
    assert.match(lien, /^https:\/\/canape\.example\.org\/invitation\/[\w-]{40,}$/);
    const jours = (Date.parse(expireLe) - Date.now()) / 86_400_000;
    assert.ok(jours > 6.99 && jours <= 7);
    const jeton = jetonDe(lien);
    const l = t.db.prepare('SELECT * FROM invitations WHERE jeton_hash = ?').get(sha256Hex(jeton)) as { prenom_suggere: string; cree_par: number };
    assert.equal(l.prenom_suggere, 'Sam');
    assert.equal(l.cree_par, admin.id);
    assert.equal((t.db.prepare('SELECT COUNT(*) AS n FROM invitations WHERE jeton_hash = ?').get(jeton) as { n: number }).n, 0);
  });

  test('durée personnalisée et bornes', async () => {
    const r = await post(t.app, '/api/admin/invitations', { role: 'viewer', dureeJours: 2 }, admin);
    assert.ok((Date.parse(r.json().expireLe) - Date.now()) / 86_400_000 < 2.01);
    assert.equal((await post(t.app, '/api/admin/invitations', { role: 'viewer', dureeJours: 0 }, admin)).statusCode, 400);
    assert.equal((await post(t.app, '/api/admin/invitations', { role: 'viewer', dureeJours: 91 }, admin)).statusCode, 400);
    assert.equal((await post(t.app, '/api/admin/invitations', { role: 'roi' }, admin)).statusCode, 400);
  });

  test('consultation libre : type, rôle, prénom suggéré, qui invite', async () => {
    const jeton = jetonDe(await inviter({ role: 'viewer', prenomSuggere: 'Sam' }));
    const j = (await get(t.app, `/api/invitations/${jeton}`)).json();
    assert.deepEqual(j, { type: 'compte', role: 'viewer', prenomSuggere: 'Sam', valide: true, invitePar: 'Léa' });
  });

  test('jeton inconnu : valide=false, sans erreur', async () => {
    const r = await get(t.app, '/api/invitations/nimportequoi');
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().valide, false);
  });

  test('acceptation : compte créé, 201, cookie de session, quota par défaut, couleur valide, usage unique', async () => {
    const jeton = jetonDe(await inviter());
    const r = await libre({ prenom: ' Sam ', identifiant: 'sam@example.org', motDePasse: 'un-mot-de-passe-solide', couleur: COULEURS_AVATAR[2] }, jeton);
    assert.equal(r.statusCode, 201);
    const c = r.cookies.find((x) => x.name === COOKIE_SESSION);
    assert.ok(c);
    const u = r.json();
    assert.equal(u.prenom, 'Sam');
    assert.equal(u.role, 'viewer');
    assert.equal(u.couleur, COULEURS_AVATAR[2]);
    assert.equal(u.quotaOctets, t.config.quotaDefaut);
    assert.equal(u.mot_de_passe, undefined);
    const ligne = t.db.prepare('SELECT mot_de_passe FROM utilisateurs WHERE id = ?').get(u.id) as { mot_de_passe: string };
    assert.match(ligne.mot_de_passe, /^\$argon2id\$/);
    assert.ok(await verifierMotDePasse(ligne.mot_de_passe, 'un-mot-de-passe-solide'));
    assert.equal((await t.app.inject({ method: 'GET', url: '/api/compte', headers: { cookie: `${COOKIE_SESSION}=${c.value}` } })).statusCode, 200);
    const encore = await libre({ prenom: 'Autre', identifiant: 'autre-personne', motDePasse: 'un-mot-de-passe-solide' }, jeton);
    assert.equal(encore.statusCode, 404);
    assert.equal(encore.json().erreur, 'invitation_invalide');
    assert.equal((await get(t.app, `/api/invitations/${jeton}`)).json().valide, false);
  });

  test('invitation admin : quota illimité, couleur tirée de la palette si absente', async () => {
    const jeton = jetonDe(await inviter({ role: 'admin' }));
    const u = (await libre({ prenom: 'Bob', identifiant: 'bob-admin', motDePasse: 'un-mot-de-passe-solide' }, jeton)).json();
    assert.equal(u.role, 'admin');
    assert.equal(u.quotaOctets, null);
    assert.ok((COULEURS_AVATAR as readonly string[]).includes(u.couleur));
  });

  test('le quota par défaut suit le réglage', async () => {
    await patch(t.app, '/api/admin/reglages', { quotaDefautOctets: 5_000 }, admin);
    const jeton = jetonDe(await inviter());
    const u = (await libre({ prenom: 'Petit', identifiant: 'petit-quota', motDePasse: 'un-mot-de-passe-solide' }, jeton)).json();
    assert.equal(u.quotaOctets, 5_000);
  });

  test('validation : mot de passe court, identifiant court ou avec espace, prénom vide, couleur inconnue, champs manquants', async () => {
    const jeton = jetonDe(await inviter());
    const base = { prenom: 'Zoé', identifiant: 'zoe-zoe', motDePasse: 'un-mot-de-passe-solide' };
    for (const [corps, motif] of [
      [{ ...base, motDePasse: 'court' }, /au moins 10/],
      [{ ...base, identifiant: 'ab' }, /identifiant/],
      [{ ...base, identifiant: 'a b c d' }, /espace/],
      [{ ...base, identifiant: 'x'.repeat(65) }, /identifiant/],
      [{ ...base, prenom: '   ' }, /prénom/],
      [{ ...base, prenom: 'P'.repeat(41) }, /prénom/],
      [{ ...base, couleur: '#123456' }, /couleur/],
      [{ motDePasse: base.motDePasse }, /prénom/],
      [{ ...base, motDePasse: undefined }, /mot de passe/],
    ] as Array<[Record<string, unknown>, RegExp]>) {
      const r = await libre(corps, jeton);
      assert.equal(r.statusCode, 400, JSON.stringify(corps));
      assert.match(r.json().message, motif);
    }
    // aucune des tentatives n'a consommé le lien
    assert.equal((await get(t.app, `/api/invitations/${jeton}`)).json().valide, true);
  });

  test('identifiant déjà pris (insensible à la casse) : 409, le lien reste utilisable', async () => {
    const jeton = jetonDe(await inviter());
    const r = await libre({ prenom: 'Faux', identifiant: 'LEA', motDePasse: 'un-mot-de-passe-solide' }, jeton);
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().erreur, 'identifiant_pris');
    assert.equal((await get(t.app, `/api/invitations/${jeton}`)).json().valide, true);
  });

  test('invitation expirée : consultation invalide, acceptation 404', async () => {
    const { jeton, id } = creerInvitation(t.db, t.config, { type: 'compte', role: 'viewer' });
    t.db.prepare('UPDATE invitations SET expire_le = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), id);
    assert.equal((await get(t.app, `/api/invitations/${jeton}`)).json().valide, false);
    assert.equal((await libre({ prenom: 'Tard', identifiant: 'trop-tard', motDePasse: 'un-mot-de-passe-solide' }, jeton)).statusCode, 404);
  });

  test('invitation révoquée : 404', async () => {
    const r = await post(t.app, '/api/admin/invitations', { role: 'viewer' }, admin);
    const { lien, id } = r.json();
    const sup = await t.app.inject({ method: 'DELETE', url: `/api/admin/invitations/${id}`, headers: admin.entetes });
    assert.equal(sup.statusCode, 204);
    assert.equal((await libre({ prenom: 'Rev', identifiant: 'revoque', motDePasse: 'un-mot-de-passe-solide' }, jetonDe(lien))).statusCode, 404);
  });

  test('deux acceptations simultanées : une seule réussit', async () => {
    const jeton = jetonDe(await inviter());
    const [a, b] = await Promise.all([
      libre({ prenom: 'A', identifiant: 'course-a', motDePasse: 'un-mot-de-passe-solide' }, jeton),
      libre({ prenom: 'B', identifiant: 'course-b', motDePasse: 'un-mot-de-passe-solide' }, jeton),
    ]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 404]);
  });

  test('réinitialisation : lien admin, nouveau mot de passe, toutes les sessions fermées, usage unique', async () => {
    const cible = await creerUtilisateur(t, { identifiant: 'oublieux' });
    const cible2 = await creerUtilisateur(t, { identifiant: 'oublieux2' });
    const r = await post(t.app, `/api/admin/utilisateurs/${cible.id}/reinitialisation`, null, admin);
    assert.equal(r.statusCode, 201);
    const jeton = jetonDe(r.json().lien);
    const info = (await get(t.app, `/api/invitations/${jeton}`)).json();
    assert.equal(info.type, 'reinitialisation');
    assert.equal(info.valide, true);
    assert.equal((await libre({ motDePasse: 'court' }, jeton)).statusCode, 400);
    const ok = await libre({ motDePasse: 'nouveau-mot-de-passe-1' }, jeton);
    assert.equal(ok.statusCode, 204);
    assert.equal((await get(t.app, '/api/compte', cible)).statusCode, 401);
    assert.equal((await get(t.app, '/api/compte', cible2)).statusCode, 200);
    const conn = await t.app.inject({ method: 'POST', url: '/api/connexion', payload: { identifiant: 'oublieux', motDePasse: 'nouveau-mot-de-passe-1' }, headers: { origin: 'https://canape.example.org' } });
    assert.equal(conn.statusCode, 204);
    assert.equal((await libre({ motDePasse: 'encore-un-autre-mdp' }, jeton)).statusCode, 404);
  });

  test('une nouvelle réinitialisation annule la précédente ; compte inconnu : 404', async () => {
    const cible = await creerUtilisateur(t);
    const a = jetonDe((await post(t.app, `/api/admin/utilisateurs/${cible.id}/reinitialisation`, null, admin)).json().lien);
    const b = jetonDe((await post(t.app, `/api/admin/utilisateurs/${cible.id}/reinitialisation`, null, admin)).json().lien);
    assert.equal((await get(t.app, `/api/invitations/${a}`)).json().valide, false);
    assert.equal((await get(t.app, `/api/invitations/${b}`)).json().valide, true);
    assert.equal((await post(t.app, '/api/admin/utilisateurs/99999/reinitialisation', null, admin)).statusCode, 404);
  });

  test('une réinitialisation ne crée pas de compte (prénom et identifiant ignorés)', async () => {
    const cible = await creerUtilisateur(t);
    const jeton = jetonDe((await post(t.app, `/api/admin/utilisateurs/${cible.id}/reinitialisation`, null, admin)).json().lien);
    const avant = (t.db.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get() as { n: number }).n;
    await libre({ prenom: 'Intrus', identifiant: 'intrus', motDePasse: 'mot-de-passe-valide-1' }, jeton);
    assert.equal((t.db.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get() as { n: number }).n, avant);
  });
});
