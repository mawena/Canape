import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { TAILLE_MAX_FICHIER_TORRENT } from '@canape/partage';
import { creerAppTest, creerUtilisateur, get, patch, post, supprimer, type AppTest, type UtilisateurTest } from '../aides.ts';
import { posterTorrent, liste } from './aides-torrents.ts';

const hash = () => randomBytes(20).toString('hex');
const magnet = (h = hash()) => `magnet:?xt=urn:btih:${h}`;

describe('torrents : droits, validation, doublons', () => {
  let t: AppTest;
  let admin: UtilisateurTest;
  let alice: UtilisateurTest;
  let bob: UtilisateurTest;
  let sansDroit: UtilisateurTest;

  before(async () => {
    t = await creerAppTest({ env: { CANAPE_TORRENT_ISOLE: '1' } });
    admin = await creerUtilisateur(t, { role: 'admin' });
    alice = await creerUtilisateur(t, { prenom: 'Alice' });
    bob = await creerUtilisateur(t, { prenom: 'Bob' });
    sansDroit = await creerUtilisateur(t, { peutTeleverser: false });
  });
  after(async () => { await t.fermer(); });

  test('une session est obligatoire', async () => {
    assert.equal((await get(t.app, '/api/torrents')).statusCode, 401);
    assert.equal((await post(t.app, '/api/torrents', { magnet: magnet() })).statusCode, 401);
  });

  test('sans droit de téléverser : peutAjouter faux et ajout refusé (403)', async () => {
    assert.equal((await liste(t, sansDroit)).peutAjouter, false);
    assert.equal((await liste(t, alice)).peutAjouter, true);
    assert.equal((await post(t.app, '/api/torrents', { magnet: magnet() }, sansDroit)).statusCode, 403);
  });

  test('liens invalides : 400', async () => {
    for (const corps of [{}, { magnet: 'http://exemple.fr/film' }, { magnet: 'magnet:?xt=urn:btih:12' }, { magnet: 42 }]) {
      const r = await post(t.app, '/api/torrents', corps, alice);
      assert.equal(r.statusCode, 400, JSON.stringify(corps));
    }
    const r = await posterTorrent(t.app, alice, 'x.torrent', Buffer.from('pas un torrent'));
    assert.equal(r.statusCode, 400);
  });

  test('un .torrent trop gros : 413', async () => {
    const r = await posterTorrent(t.app, alice, 'x.torrent', Buffer.alloc(TAILLE_MAX_FICHIER_TORRENT + 10, 1));
    assert.equal(r.statusCode, 413);
  });

});

describe('torrents : ajout, doublons, pause, annulation', () => {
  let t: AppTest;
  let admin: UtilisateurTest;
  let alice: UtilisateurTest;
  let bob: UtilisateurTest;
  before(async () => {
    t = await creerAppTest({ env: { CANAPE_TORRENT_ISOLE: '1' } });
    admin = await creerUtilisateur(t, { role: 'admin' });
    alice = await creerUtilisateur(t, { prenom: 'Alice' });
    bob = await creerUtilisateur(t, { prenom: 'Bob' });
  });
  after(async () => { await t.fermer(); });

  test('ajout par lien : 201, visible de son propriétaire et de l\'admin seulement, 404 pour les autres, 409 pour un doublon', async () => {
    const h = hash();
    const r = await post(t.app, '/api/torrents', { magnet: magnet(h.toUpperCase()) }, alice);
    assert.equal(r.statusCode, 201);
    const tel = r.json();
    assert.equal(tel.infoHash, h);
    assert.equal(tel.etat, 'metadonnees');
    assert.equal(tel.nom, null);
    assert.equal(tel.proprietairePrenom, 'Alice');
    assert.deepEqual(tel.fichiers, []);
    assert.equal(tel.octetsTotal, null);

    assert.equal((await liste(t, alice)).telechargements.length, 1);
    assert.equal((await liste(t, bob)).telechargements.length, 0);
    assert.equal((await liste(t, admin)).telechargements.length, 1);

    assert.equal((await patch(t.app, `/api/torrents/${tel.id}`, { pause: true }, bob)).statusCode, 404);
    assert.equal((await supprimer(t.app, `/api/torrents/${tel.id}`, bob)).statusCode, 404);
    assert.equal((await supprimer(t.app, '/api/torrents/inconnu', alice)).statusCode, 404);

    // Même torrent, même pour un autre compte : 409.
    assert.equal((await post(t.app, '/api/torrents', { magnet: magnet(h) }, bob)).statusCode, 409);

    // Validation du PATCH : informations pas encore reçues.
    assert.equal((await patch(t.app, `/api/torrents/${tel.id}`, { fichiers: [0] }, alice)).statusCode, 409);
    assert.equal((await patch(t.app, `/api/torrents/${tel.id}`, {}, alice)).statusCode, 400);

    // Pause puis reprise.
    const p = await patch(t.app, `/api/torrents/${tel.id}`, { pause: true }, alice);
    assert.equal(p.statusCode, 200);
    assert.equal(p.json().etat, 'pause');
    // Un torrent en pause compte encore comme actif pour le doublon.
    assert.equal((await post(t.app, '/api/torrents', { magnet: magnet(h) }, bob)).statusCode, 409);
    assert.equal((await patch(t.app, `/api/torrents/${tel.id}`, { pause: false }, alice)).json().etat, 'metadonnees');

    // Annulation : la ligne reste « annule », une seconde suppression la retire.
    assert.equal((await supprimer(t.app, `/api/torrents/${tel.id}`, alice)).statusCode, 204);
    assert.equal((await liste(t, alice)).telechargements[0]?.etat, 'annule');
    assert.equal((await patch(t.app, `/api/torrents/${tel.id}`, { pause: true }, alice)).statusCode, 409);
    assert.equal((await supprimer(t.app, `/api/torrents/${tel.id}`, alice)).statusCode, 204);
    assert.equal((await liste(t, alice)).telechargements.length, 0);
    // Annulé : le même torrent peut être ajouté de nouveau.
    const encore = await post(t.app, '/api/torrents', { magnet: magnet(h) }, alice);
    assert.equal(encore.statusCode, 201);
    await supprimer(t.app, `/api/torrents/${encore.json().id}`, alice);
  });

});

describe('torrents : limite des ajouts', () => {
  let t: AppTest;
  let bob: UtilisateurTest;
  before(async () => { t = await creerAppTest({ env: { CANAPE_TORRENT_ISOLE: '1' } }); bob = await creerUtilisateur(t, { prenom: 'Bob' }); });
  after(async () => { await t.fermer(); });

  test('au plus 10 ajouts par minute : 429', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post(t.app, '/api/torrents', { magnet: 'invalide' }, bob)).statusCode);
    assert.ok(codes.includes(429), codes.join(','));
  });
});

describe('torrents désactivés (CANAPE_TORRENTS=0)', () => {
  let t: AppTest;
  let admin: UtilisateurTest;
  before(async () => { t = await creerAppTest({ env: { CANAPE_TORRENTS: '0' } }); admin = await creerUtilisateur(t, { role: 'admin' }); });
  after(async () => { await t.fermer(); });

  test('peutAjouter faux, ajout en 403, aucun processus enfant', async () => {
    assert.equal((await liste(t, admin)).peutAjouter, false);
    assert.equal((await post(t.app, '/api/torrents', { magnet: magnet() }, admin)).statusCode, 403);
    assert.equal(t.app.torrents.moteur.pid, null);
  });
});
