// Notifications : routes, envoi vers un faux service local, expiration (410), limite de 10 minutes, déclencheur à l'entrée dans la salle.
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import type { ChargeNotification } from '@canape/partage';
import { creerUtilisateur, get, requete, post, type UtilisateurTest } from '../aides.ts';
import { DELAI_ENTRE_NOTIFICATIONS_MS } from '../../src/modules/notifications/service.ts';
import { connecter, creerEnv, inserer, insererFilm, type Env } from '../seances/aides-seances.ts';
import { creerAbonneTest, creerFauxService, verifierJwt, type AbonneTest, type FauxService } from './aides-notifications.ts';

describe('notifications Web Push', () => {
  let env: Env;
  let faux: FauxService;
  let hote: UtilisateurTest, camille: UtilisateurTest, ivan: UtilisateurTest, etranger: UtilisateurTest;
  let film: string;
  let abHote: AbonneTest, abIvan: AbonneTest;
  let horloge = Date.UTC(2026, 10, 13, 12, 0, 0);

  before(async () => {
    env = await creerEnv();
    faux = await creerFauxService();
    env.app.notifications.maintenant = () => horloge;
    hote = await creerUtilisateur(env, { prenom: 'Hana' });
    camille = await creerUtilisateur(env, { prenom: 'Camille' });
    ivan = await creerUtilisateur(env, { prenom: 'Ivan' });
    etranger = await creerUtilisateur(env, { prenom: 'Eli' });
    film = insererFilm(env, hote, { visibilite: 'tous' });
    abHote = creerAbonneTest();
    abIvan = creerAbonneTest();
  });
  after(async () => { await faux.fermer(); await env.fermer(); });
  afterEach(() => { faux.recus.length = 0; faux.statut = 201; faux.retardMs = 0; });

  const abonner = (u: UtilisateurTest, ab: AbonneTest, nom: string, appareil = 'Firefox sur Linux') =>
    requete(env.app, 'POST', '/api/notifications/abonnements', { utilisateur: u, corps: ab.corps(faux.url(nom), appareil) });
  const lignes = (u: UtilisateurTest) => env.db.prepare('SELECT * FROM notifications_abonnements WHERE utilisateur_id = ?').all(u.id) as Array<Record<string, any>>;
  const charge = (ab: AbonneTest, i = 0): ChargeNotification => JSON.parse(ab.dechiffrer(faux.recus[i]!.corps).toString()) as ChargeNotification;

  test('clé publique : connexion requise, 65 octets, stable (créée une fois, gardée en base)', async () => {
    assert.equal((await get(env.app, '/api/notifications/cle')).statusCode, 401);
    const r = await get(env.app, '/api/notifications/cle', hote);
    assert.equal(r.statusCode, 200);
    const cle = r.json().clePublique as string;
    assert.equal(Buffer.from(cle, 'base64url').length, 65);
    assert.equal((await get(env.app, '/api/notifications/cle', camille)).json().clePublique, cle);
    assert.equal((env.db.prepare('SELECT COUNT(*) AS n FROM notifications_cles').get() as { n: number }).n, 1);
    assert.equal((env.db.prepare('SELECT cle_publique FROM notifications_cles').get() as { cle_publique: string }).cle_publique, cle);
  });

  test('abonnement : crée, met à jour (même endpoint), supprime ; validations', async () => {
    assert.equal((await requete(env.app, 'POST', '/api/notifications/abonnements', { corps: abHote.corps(faux.url('x')) })).statusCode, 401);
    assert.equal((await abonner(hote, abHote, 'hote')).statusCode, 204);
    assert.equal(lignes(hote).length, 1);
    assert.equal(lignes(hote)[0]!['appareil'], 'Firefox sur Linux');
    assert.equal((await abonner(hote, abHote, 'hote', 'Chrome sur Android')).statusCode, 204);
    assert.equal(lignes(hote).length, 1, 'même endpoint : mise à jour');
    assert.equal(lignes(hote)[0]!['appareil'], 'Chrome sur Android');

    const mauvais = [
      { endpoint: 'pas une adresse', keys: { p256dh: abHote.p256dh, auth: abHote.auth } },
      { endpoint: faux.url('m'), keys: { p256dh: 'AAAA', auth: abHote.auth } },
      { endpoint: faux.url('m'), keys: { p256dh: abHote.p256dh, auth: 'AAAA' } },
      { endpoint: faux.url('m') },
      { endpoint: 'ftp://127.0.0.1/x', keys: { p256dh: abHote.p256dh, auth: abHote.auth } },
    ];
    for (const corps of mauvais) assert.equal((await requete(env.app, 'POST', '/api/notifications/abonnements', { utilisateur: hote, corps })).statusCode, 400, JSON.stringify(corps));

    // Un appareil ne se désabonne que pour son propriétaire.
    assert.equal((await requete(env.app, 'DELETE', '/api/notifications/abonnements', { utilisateur: camille, corps: { endpoint: faux.url('hote') } })).statusCode, 204);
    assert.equal(lignes(hote).length, 1);
    assert.equal((await requete(env.app, 'DELETE', '/api/notifications/abonnements', { utilisateur: hote, corps: { endpoint: faux.url('hote') } })).statusCode, 204);
    assert.equal(lignes(hote).length, 0);
    assert.equal((await requete(env.app, 'DELETE', '/api/notifications/abonnements', { utilisateur: hote, corps: {} })).statusCode, 400);
  });

  test('un endpoint qui change de compte passe à la personne connectée', async () => {
    await abonner(hote, abHote, 'partage');
    await abonner(camille, abHote, 'partage');
    assert.equal(lignes(hote).length, 0);
    assert.equal(lignes(camille).length, 1);
    await requete(env.app, 'DELETE', '/api/notifications/abonnements', { utilisateur: camille, corps: { endpoint: faux.url('partage') } });
  });

  test('en production (https) : adresses locales ou IP refusées, pas de service local', async () => {
    const prod = await creerEnv2();
    try {
      const u = await creerUtilisateur(prod, { prenom: 'Zoe' });
      const ab = creerAbonneTest();
      const entetes = { cookie: u.cookie, origin: 'https://canape.exemple' };
      const envoyer = (endpoint: string) => requete(prod.app, 'POST', '/api/notifications/abonnements', { utilisateur: null, entetes, corps: ab.corps(endpoint) });
      for (const e of ['http://push.exemple/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://[::1]/x', 'https://machine/x', 'https://u:p@push.exemple/x']) {
        assert.equal((await envoyer(e)).statusCode, 400, e);
      }
      assert.equal((await envoyer('https://push.exemple/abc')).statusCode, 204);
    } finally { await prod.fermer(); }
  });

  test('essai : arrive au faux service, chiffré, avec VAPID ; seulement l\'appareil demandé', async () => {
    await abonner(hote, abHote, 'hote');
    const autre = creerAbonneTest();
    await abonner(hote, autre, 'hote2');
    const r = await post(env.app, '/api/notifications/essai', { endpoint: faux.url('hote') }, hote);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { envoyes: 1, echecs: 0 });
    assert.equal(faux.recus.length, 1);
    const recu = faux.recus[0]!;
    assert.equal(recu.chemin, '/push/hote');
    assert.equal(recu.entetes['content-encoding'], 'aes128gcm');
    assert.ok(recu.entetes['ttl']);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(String(recu.entetes['authorization']))!;
    const cle = (await get(env.app, '/api/notifications/cle', hote)).json().clePublique as string;
    assert.equal(m[2], cle);
    const jwt = verifierJwt(m[1]!, cle);
    assert.equal(jwt.valide, true);
    assert.equal(jwt.charge['aud'], new URL(faux.url()).origin);
    assert.equal(jwt.charge['sub'], 'http://localhost:8080', 'sujet : l\'adresse de Canapé, pas une adresse e-mail');
    const c = charge(abHote);
    assert.equal(c.titre, 'Canapé');
    assert.deepEqual(Object.keys(c).sort(), ['corps', 'etiquette', 'titre', 'url']);
    assert.equal(lignes(hote).find((l) => l['endpoint'] === faux.url('hote'))!['dernier_succes_le'] !== null, true);
    // Sans `endpoint` : tous les appareils de la personne.
    faux.recus.length = 0;
    assert.deepEqual((await post(env.app, '/api/notifications/essai', {}, hote)).json(), { envoyes: 2, echecs: 0 });
    for (const n of ['hote', 'hote2']) await requete(env.app, 'DELETE', '/api/notifications/abonnements', { utilisateur: hote, corps: { endpoint: faux.url(n) } });
  });

  test('essai : 410 supprime l\'abonnement, 500 le garde et note l\'échec, service lent : délai court, rien ne plante', async () => {
    await abonner(hote, abHote, 'mort');
    faux.statut = 410;
    assert.deepEqual((await post(env.app, '/api/notifications/essai', {}, hote)).json(), { envoyes: 0, echecs: 1 });
    assert.equal(lignes(hote).length, 0, '410 : abonnement supprimé');

    await abonner(hote, abHote, 'panne');
    faux.statut = 404;
    await post(env.app, '/api/notifications/essai', {}, hote);
    assert.equal(lignes(hote).length, 0, '404 aussi');

    await abonner(hote, abHote, 'panne');
    faux.statut = 500;
    assert.deepEqual((await post(env.app, '/api/notifications/essai', {}, hote)).json(), { envoyes: 0, echecs: 1 });
    assert.equal(lignes(hote).length, 1);
    assert.equal(lignes(hote)[0]!['dernier_echec_raison'], 'HTTP 500');

    faux.statut = 201;
    faux.retardMs = 1000;
    env.app.notifications.delaiMs = 150;
    const t0 = Date.now();
    assert.deepEqual((await post(env.app, '/api/notifications/essai', {}, hote)).json(), { envoyes: 0, echecs: 1 });
    assert.ok(Date.now() - t0 < 900);
    env.app.notifications.delaiMs = 8000;
    assert.equal(lignes(hote).length, 1, 'un délai dépassé ne supprime pas l\'abonnement');
    await supprimerTous(hote);
  });

  const supprimerTous = async (u: UtilisateurTest) => { env.db.prepare('DELETE FROM notifications_abonnements WHERE utilisateur_id = ?').run(u.id); };

  test('à l\'entrée dans la salle : l\'invité abonné est prévenu, pas celui qui entre, pas un étranger à la séance', async () => {
    const id = inserer(env, hote, film, [camille, ivan]);
    await abonner(hote, abHote, 'hote');
    await abonner(ivan, abIvan, 'ivan');
    const abEtranger = creerAbonneTest();
    await abonner(etranger, abEtranger, 'etranger');
    const cCamille = await connecter(env, id, camille);
    await faux.attendre(2);
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(faux.recus.map((r) => r.chemin).sort(), ['/push/hote', '/push/ivan']);
    const pourIvan = faux.recus.find((r) => r.chemin === '/push/ivan')!;
    const c = JSON.parse(abIvan.dechiffrer(pourIvan.corps).toString()) as ChargeNotification;
    assert.equal(c.titre, 'Camille est dans la salle');
    assert.match(c.corps, /^Film \d+ — rejoins la séance quand tu veux\.$/);
    assert.equal(c.url, `/seances/${id}`);
    assert.deepEqual(Object.keys(c).sort(), ['corps', 'etiquette', 'titre', 'url']);
    cCamille.fermer();
    await supprimerTous(hote); await supprimerTous(ivan); await supprimerTous(etranger);
  });

  test('personne déjà dans la salle, ou sans appareil abonné : pas de notification ; deuxième onglet de l\'entrant : rien', async () => {
    const id = inserer(env, hote, film, [camille, ivan]);
    await abonner(ivan, abIvan, 'ivan');
    const cIvan = await connecter(env, id, ivan);
    await new Promise((r) => setTimeout(r, 100));
    faux.recus.length = 0;
    const cCamille = await connecter(env, id, camille); // Ivan est déjà là ; l'hôte n'a pas d'appareil
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(faux.recus.length, 0);
    const cCamille2 = await connecter(env, id, camille); // deuxième onglet
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(faux.recus.length, 0);
    for (const c of [cIvan, cCamille, cCamille2]) c.fermer();
    await supprimerTous(ivan);
  });

  test('limite : une notification par personne et par séance toutes les 10 minutes', async () => {
    const id = inserer(env, hote, film, [camille, ivan]);
    const autreId = inserer(env, hote, film, [camille, ivan]);
    await abonner(ivan, abIvan, 'ivan');
    const entrerSortir = async (seance: string) => { const c = await connecter(env, seance, camille); await new Promise((r) => setTimeout(r, 120)); c.fermer(); await new Promise((r) => setTimeout(r, 50)); };
    await entrerSortir(id);
    assert.equal(faux.recus.length, 1);
    await entrerSortir(id);
    assert.equal(faux.recus.length, 1, 'trop tôt');
    await entrerSortir(autreId);
    assert.equal(faux.recus.length, 2, 'autre séance : permis');
    horloge += DELAI_ENTRE_NOTIFICATIONS_MS - 1000;
    await entrerSortir(id);
    assert.equal(faux.recus.length, 2, 'encore dans les 10 minutes');
    horloge += 2000;
    await entrerSortir(id);
    assert.equal(faux.recus.length, 3, 'après 10 minutes');
    await supprimerTous(ivan);
  });

  test('séance terminée : personne n\'est prévenu ; l\'échec d\'un envoi ne bloque pas la salle', async () => {
    const termine = inserer(env, hote, film, [camille, ivan]);
    env.db.prepare('UPDATE seances SET terminee_le = ? WHERE id = ?').run(new Date().toISOString(), termine);
    await abonner(ivan, abIvan, 'ivan');
    const c1 = await connecter(env, termine, camille);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(faux.recus.length, 0);
    c1.fermer();

    const id = inserer(env, hote, film, [camille, ivan]);
    faux.statut = 500;
    const c2 = await connecter(env, id, camille); // le service est en panne : la salle s'ouvre quand même
    await faux.attendre(1);
    assert.ok(c2.recus.some((m) => m.t === 'bienvenue'));
    c2.fermer();
    await supprimerTous(ivan);
  });

  test('suppression d\'un compte : ses abonnements disparaissent', async () => {
    const u = await creerUtilisateur(env, { prenom: 'Temp' });
    await abonner(u, creerAbonneTest(), 'temp');
    assert.equal(lignes(u).length, 1);
    env.db.prepare('DELETE FROM utilisateurs WHERE id = ?').run(u.id);
    assert.equal(lignes(u).length, 0);
  });
});

async function creerEnv2() {
  const { creerAppTest } = await import('../aides.ts');
  return creerAppTest({ env: { CANAPE_URL_PUBLIQUE: 'https://canape.exemple' } });
}
