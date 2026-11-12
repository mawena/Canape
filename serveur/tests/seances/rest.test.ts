// Routes REST des séances : droits, création, liens, messages, reprise, historique, ICE.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { creerUtilisateur, get, patch, post, supprimer, type UtilisateurTest } from '../aides.ts';
import { creerEnv, insererFilm, inserer, type Env } from './aides-seances.ts';

describe('séances : REST', () => {
  let env: Env;
  let hote: UtilisateurTest, invite: UtilisateurTest, etranger: UtilisateurTest, admin: UtilisateurTest, autre: UtilisateurTest;
  let film: string, filmPrive: string;
  before(async () => {
    env = await creerEnv();
    hote = await creerUtilisateur(env, { prenom: 'Hana' });
    invite = await creerUtilisateur(env, { prenom: 'Ivan' });
    etranger = await creerUtilisateur(env, { prenom: 'Eli' });
    autre = await creerUtilisateur(env, { prenom: 'Omar' });
    admin = await creerUtilisateur(env, { role: 'admin', prenom: 'Admin' });
    film = insererFilm(env, hote, { visibilite: 'tous' });
    filmPrive = insererFilm(env, etranger, { visibilite: 'prive' });
  });
  after(() => env.fermer());

  test('refus sans connexion', async () => {
    assert.equal((await get(env.app, '/api/seances')).statusCode, 401);
  });

  test('création : film visible requis, invités, hôte exclu des invités', async () => {
    const r = await post(env.app, '/api/seances', { filmId: film, titre: ' Soirée ', invites: [invite.id, hote.id] }, hote);
    assert.equal(r.statusCode, 201);
    const s = r.json();
    assert.equal(s.titre, 'Soirée');
    assert.equal(s.hoteId, hote.id);
    assert.deepEqual(s.invites.map((i: { id: number }) => i.id), [invite.id]);
    assert.equal((await post(env.app, '/api/seances', { filmId: filmPrive }, hote)).statusCode, 404);
    assert.equal((await post(env.app, '/api/seances', { filmId: film, invites: [99999] }, hote)).statusCode, 400);
    assert.equal((await post(env.app, '/api/seances', {}, hote)).statusCode, 400);
    assert.equal((await post(env.app, '/api/seances', { filmId: film, titre: 'x'.repeat(121) }, hote)).statusCode, 400);
  });

  test('droits : hôte, invité, admin ; étranger : 404', async () => {
    const id = (await post(env.app, '/api/seances', { filmId: film, invites: [invite.id] }, hote)).json().id;
    for (const u of [hote, invite, admin]) assert.equal((await get(env.app, `/api/seances/${id}`, u)).statusCode, 200);
    assert.equal((await get(env.app, `/api/seances/${id}`, etranger)).statusCode, 404);
    assert.equal((await get(env.app, `/api/seances/${id}/messages`, etranger)).statusCode, 404);
    assert.equal((await patch(env.app, `/api/seances/${id}`, { titre: 'x' }, etranger)).statusCode, 404);
    assert.equal((await patch(env.app, `/api/seances/${id}`, { titre: 'x' }, invite)).statusCode, 403);
    assert.equal((await supprimer(env.app, `/api/seances/${id}`, invite)).statusCode, 403);
    assert.equal((await get(env.app, '/api/seances/nimportequoi', hote)).statusCode, 404);
  });

  test('liste : visible seulement pour l\'hôte et les invités ; « à venir » puis « récentes »', async () => {
    const id = (await post(env.app, '/api/seances', { filmId: film, invites: [autre.id] }, hote)).json().id;
    const pourAutre = (await get(env.app, '/api/seances', autre)).json();
    assert.ok(pourAutre.aVenir.some((s: { id: string }) => s.id === id));
    const pourEtranger = (await get(env.app, '/api/seances', etranger)).json();
    assert.deepEqual([...pourEtranger.aVenir, ...pourEtranger.enCours, ...pourEtranger.recentes], []);
    await patch(env.app, `/api/seances/${id}`, { terminee: true }, hote);
    const apres = (await get(env.app, '/api/seances', autre)).json();
    assert.ok(apres.recentes.some((s: { id: string }) => s.id === id));
    assert.ok(!apres.aVenir.some((s: { id: string }) => s.id === id));
  });

  test('modification par l\'hôte ou un admin, puis suppression', async () => {
    const id = (await post(env.app, '/api/seances', { filmId: film }, hote)).json().id;
    const r = await patch(env.app, `/api/seances/${id}`, { titre: 'Nouveau', prevueLe: '2030-05-01T20:00:00Z', invites: [invite.id] }, hote);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().titre, 'Nouveau');
    assert.equal(r.json().prevueLe, '2030-05-01T20:00:00.000Z');
    assert.equal((await patch(env.app, `/api/seances/${id}`, { prevueLe: 'bof' }, hote)).statusCode, 400);
    assert.equal((await patch(env.app, `/api/seances/${id}`, { titre: 'Admin' }, admin)).statusCode, 200);
    assert.equal((await supprimer(env.app, `/api/seances/${id}`, admin)).statusCode, 204);
    assert.equal((await get(env.app, `/api/seances/${id}`, hote)).statusCode, 404);
  });

  test('changer de film par PATCH : seulement un film visible, position remise à 0', async () => {
    const id = (await post(env.app, '/api/seances', { filmId: film }, hote)).json().id;
    env.db.prepare('UPDATE seances SET position = 400 WHERE id = ?').run(id);
    assert.equal((await patch(env.app, `/api/seances/${id}`, { filmId: filmPrive }, hote)).statusCode, 404);
    const f2 = insererFilm(env, hote);
    const r = (await patch(env.app, `/api/seances/${id}`, { filmId: f2 }, hote)).json();
    assert.equal(r.filmId, f2);
    assert.equal(r.position, 0);
  });

  test('lien : créer, rejoindre (devient invité), retirer, lien mort', async () => {
    const id = (await post(env.app, '/api/seances', { filmId: film }, hote)).json().id;
    assert.equal((await post(env.app, `/api/seances/${id}/lien`, undefined, invite)).statusCode, 404);
    const lien = (await post(env.app, `/api/seances/${id}/lien`, undefined, hote));
    assert.equal(lien.statusCode, 201);
    const url: string = lien.json().lien;
    assert.match(url, /^http:\/\/localhost:8080\/rejoindre\/[A-Za-z0-9_-]+$/);
    const jeton = url.split('/').pop();
    assert.equal((await get(env.app, `/api/seances/${id}`, etranger)).statusCode, 404);
    const r = await post(env.app, `/api/rejoindre/${jeton}`, undefined, etranger);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().seanceId, id);
    assert.equal((await get(env.app, `/api/seances/${id}`, etranger)).statusCode, 200);
    // le film de la séance devient visible pour le nouvel invité (règle d'accès)
    assert.equal(env.faux.service.peutVoir({ id: etranger.id, role: 'viewer' } as never, film), true);
    assert.equal((await post(env.app, `/api/rejoindre/${jeton}`, undefined, null)).statusCode, 401);
    assert.equal((await supprimer(env.app, `/api/seances/${id}/lien`, hote)).statusCode, 204);
    assert.equal((await post(env.app, `/api/rejoindre/${jeton}`, undefined, autre)).statusCode, 404);
    assert.equal((await get(env.app, `/api/seances/${id}`, autre)).statusCode, 404);
  });

  test('règle d\'accès : l\'invité voit le film privé de la séance, plus après la fin', async () => {
    const f = insererFilm(env, hote, { visibilite: 'prive' });
    const u = { id: invite.id, role: 'viewer' } as never;
    assert.equal(env.faux.service.peutVoir(u, f), false);
    const id = (await post(env.app, '/api/seances', { filmId: f, invites: [invite.id] }, hote)).json().id;
    assert.equal(env.faux.service.peutVoir(u, f), true);
    await patch(env.app, `/api/seances/${id}`, { terminee: true }, hote);
    assert.equal(env.faux.service.peutVoir(u, f), false);
  });

  test('film supprimé : la séance perd son film', async () => {
    const f = insererFilm(env, hote);
    const id = inserer(env, hote, f);
    env.db.prepare('UPDATE seances SET position = 12, piste_audio = 1 WHERE id = ?').run(id);
    env.faux.supprimer(f);
    const s = (await get(env.app, `/api/seances/${id}`, hote)).json();
    assert.equal(s.filmId, null);
    assert.equal(s.position, 0);
    assert.equal(s.pisteAudio, null);
  });

  test('messages paginés', async () => {
    const id = inserer(env, hote, film, [invite]);
    const ins = env.db.prepare('INSERT INTO messages (seance_id, utilisateur_id, texte, position, envoye_le) VALUES (?, ?, ?, NULL, ?)');
    for (let i = 1; i <= 7; i++) ins.run(id, hote.id, `m${i}`, new Date().toISOString());
    const p1 = (await get(env.app, `/api/seances/${id}/messages?limite=3`, invite)).json();
    assert.deepEqual(p1.map((m: { texte: string }) => m.texte), ['m5', 'm6', 'm7']);
    const p2 = (await get(env.app, `/api/seances/${id}/messages?limite=3&avant=${p1[0].id}`, invite)).json();
    assert.deepEqual(p2.map((m: { texte: string }) => m.texte), ['m2', 'm3', 'm4']);
    assert.equal((await get(env.app, `/api/seances/${id}/messages?avant=abc`, invite)).statusCode, 400);
  });

  test('ICE : STUN, et TURN temporaire quand il est configuré', async () => {
    const r = await get(env.app, '/api/ice', hote);
    assert.equal(r.statusCode, 200);
    assert.ok(Array.isArray(r.json().iceServers));
    assert.equal((await get(env.app, '/api/ice', null)).statusCode, 401);
  });
});

describe('séances : TURN configuré', () => {
  let env: Env;
  let u: UtilisateurTest;
  before(async () => {
    const { creerAppTest } = await import('../aides.ts');
    const { fauxMediatheque } = await import('./aides-seances.ts');
    const t = await creerAppTest({
      env: { CANAPE_TURN_URLS: 'turn:turn.exemple.test:3478', CANAPE_TURN_SECRET: 'secret-de-test' },
      avantPret: (app) => { app.mediatheque = fauxMediatheque(app).service; },
    });
    env = { ...t, port: 0 } as unknown as Env;
    u = await creerUtilisateur(env);
  });
  after(() => env.fermer());
  test('identifiants temporaires', async () => {
    const j = (await get(env.app, '/api/ice', u)).json();
    const turn = j.iceServers.find((s: { username?: string }) => s.username);
    assert.ok(turn);
    assert.ok(Number(turn.username) > Date.now() / 1000);
    assert.ok(turn.credential);
  });
});

describe('séances : reprise et historique', () => {
  let env: Env;
  let u: UtilisateurTest, v: UtilisateurTest;
  before(async () => {
    env = await creerEnv();
    u = await creerUtilisateur(env);
    v = await creerUtilisateur(env);
  });
  after(() => env.fermer());
  test('reprise : en cours seulement et film encore visible ; historique : tout', async () => {
    const f1 = insererFilm(env, u, { visibilite: 'tous' });
    const f2 = insererFilm(env, u, { visibilite: 'tous' });
    const f3 = insererFilm(env, u, { visibilite: 'prive' });
    const ins = env.db.prepare('INSERT INTO progression (utilisateur_id, film_id, position, duree, termine, vu_le) VALUES (?, ?, ?, 6000, ?, ?)');
    ins.run(v.id, f1, 1200, 0, '2026-02-01T00:00:00.000Z');
    ins.run(v.id, f2, 5900, 1, '2026-02-02T00:00:00.000Z');
    ins.run(v.id, f3, 100, 0, '2026-02-03T00:00:00.000Z');
    const reprise = (await get(env.app, '/api/reprendre', v)).json();
    assert.deepEqual(reprise.map((p: { film: { id: string } }) => p.film.id), [f1]);
    assert.equal(reprise[0].position, 1200);
    const histo = (await get(env.app, '/api/historique', v)).json();
    assert.deepEqual(histo.map((p: { film: { id: string } }) => p.film.id), [f2, f1]);
    assert.equal(histo[0].termine, true);
    assert.deepEqual((await get(env.app, '/api/reprendre', u)).json(), []);
  });
});
