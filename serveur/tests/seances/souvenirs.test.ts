// Souvenirs : temps passé ensemble (logique pure), présents, notes d'un mot (REST) et diffusion en direct (WebSocket).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { creerUtilisateur, get, patch, requete, type UtilisateurTest } from '../aides.ts';
import { Salle } from '../../src/modules/seances/salle.ts';
import { connecter, creerEnv, inserer, insererFilm, type Env } from './aides-seances.ts';

const u = (id: number, prenom: string) => ({ id, prenom, couleur: null });
const nouvelleSalle = (ensemble?: number) => {
  let t = 1_000_000;
  const s = new Salle({ filmId: 'f', position: 0, pisteAudio: null, sousTitres: null, ...(ensemble === undefined ? {} : { ensemble }) }, () => t);
  return { s, avancer: (ms: number) => { t += ms; } };
};

describe('temps passé ensemble (salle pure)', () => {
  test('une seule personne : rien ne compte', () => {
    const { s, avancer } = nouvelleSalle();
    s.ajouter('a', u(1, 'Ana'));
    avancer(600_000);
    assert.equal(s.secondesEnsemble(), 0);
  });

  test('à deux : le temps compte, et continue de courir', () => {
    const { s, avancer } = nouvelleSalle();
    s.ajouter('a', u(1, 'Ana'));
    avancer(60_000);
    s.ajouter('b', u(2, 'Ben'));
    avancer(120_000);
    assert.equal(s.secondesEnsemble(), 120);
    s.retirer('b');
    avancer(300_000);
    assert.equal(s.secondesEnsemble(), 120, 'seule de nouveau : le compteur s\'arrête');
  });

  test('allers-retours : les périodes s\'additionnent', () => {
    const { s, avancer } = nouvelleSalle();
    s.ajouter('a', u(1, 'Ana'));
    s.ajouter('b', u(2, 'Ben'));
    avancer(100_000);
    s.retirer('b');
    avancer(50_000);
    s.ajouter('b2', u(2, 'Ben'));
    avancer(30_000);
    assert.equal(s.secondesEnsemble(), 130);
  });

  test('deux onglets du même compte ne font pas « ensemble »', () => {
    const { s, avancer } = nouvelleSalle();
    s.ajouter('a', u(1, 'Ana'));
    s.ajouter('a2', u(1, 'Ana'));
    avancer(90_000);
    assert.equal(s.secondesEnsemble(), 0);
  });

  test('reprise d\'un temps déjà enregistré', () => {
    const { s, avancer } = nouvelleSalle(500);
    s.ajouter('a', u(1, 'Ana'));
    s.ajouter('b', u(2, 'Ben'));
    avancer(10_000);
    assert.equal(s.secondesEnsemble(), 510);
    const { s: s2 } = nouvelleSalle(Number.NaN);
    assert.equal(s2.secondesEnsemble(), 0);
  });
});

describe('souvenirs : REST et WebSocket', () => {
  let env: Env;
  let hote: UtilisateurTest, invite: UtilisateurTest, tiers: UtilisateurTest, etranger: UtilisateurTest, admin: UtilisateurTest;
  let film: string;
  before(async () => {
    env = await creerEnv();
    hote = await creerUtilisateur(env, { prenom: 'Hana' });
    invite = await creerUtilisateur(env, { prenom: 'Ivan' });
    tiers = await creerUtilisateur(env, { prenom: 'Tess' });
    etranger = await creerUtilisateur(env, { prenom: 'Eli' });
    admin = await creerUtilisateur(env, { role: 'admin', prenom: 'Admin' });
    film = insererFilm(env, hote, { duree: 1000, visibilite: 'tous' });
  });
  after(() => env.fermer());

  const put = (id: string, corps: unknown, utilisateur: UtilisateurTest | null) =>
    requete(env.app, 'PUT', `/api/seances/${id}/note`, { utilisateur, corps: corps as Record<string, unknown> });

  test('la présence est notée à l\'entrée, le temps ensemble à la lecture du souvenir', async () => {
    const id = inserer(env, hote, film, [invite, tiers]);
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    await new Promise((r) => setTimeout(r, 1200));
    const s = (await get(env.app, `/api/seances/${id}/souvenir`, hote)).json();
    assert.deepEqual(s.personnes.map((p: { utilisateur: { prenom: string } }) => p.utilisateur.prenom), ['Hana', 'Ivan']);
    assert.ok(s.personnes.every((p: { present: boolean; note: unknown }) => p.present && p.note === null));
    assert.ok(s.secondesEnsemble >= 1, `temps ensemble ${s.secondesEnsemble}`);
    a.fermer(); b.fermer();
    await a.fermeture; await b.fermeture;
    await new Promise((r) => setTimeout(r, 100));
    const apres = (await get(env.app, `/api/seances/${id}/souvenir`, invite)).json();
    assert.ok(apres.secondesEnsemble >= s.secondesEnsemble, 'le temps survit à la fermeture de la salle');
    assert.equal(apres.personnes.length, 2, 'Tess n\'est jamais venue');
  });

  test('note : valeurs permises, modifiable, effaçable', async () => {
    const id = inserer(env, hote, film, [invite]);
    let r = await put(id, { note: 'coeur' }, invite);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().personnes.find((p: { utilisateur: { id: number } }) => p.utilisateur.id === invite.id).note, 'coeur');
    r = await put(id, { note: 'bof' }, invite);
    assert.equal(r.json().personnes.find((p: { utilisateur: { id: number } }) => p.utilisateur.id === invite.id).note, 'bof');
    await put(id, { note: 'bien' }, hote);
    const s = (await get(env.app, `/api/seances/${id}/souvenir`, hote)).json();
    assert.deepEqual(s.personnes.map((p: { note: string }) => p.note).sort(), ['bien', 'bof']);
    r = await put(id, { note: null }, invite);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().personnes.some((p: { utilisateur: { id: number } }) => p.utilisateur.id === invite.id), false, 'une personne sans note ni présence disparaît');
  });

  test('note : valeurs invalides refusées', async () => {
    const id = inserer(env, hote, film, [invite]);
    for (const note of ['super', '', 3, undefined, ['coeur'], { a: 1 }]) {
      assert.equal((await put(id, { note }, invite)).statusCode, 400, `note ${JSON.stringify(note)}`);
    }
    assert.equal((await put(id, {}, invite)).statusCode, 400);
    assert.equal((await get(env.app, `/api/seances/${id}/souvenir`, invite)).json().personnes.length, 0);
  });

  test('réservé aux participants : étranger, administrateur non invité et anonyme n\'y accèdent pas', async () => {
    const id = inserer(env, hote, film, [invite]);
    for (const x of [etranger, admin, null]) {
      const attendu = x === null ? 401 : 404;
      assert.equal((await get(env.app, `/api/seances/${id}/souvenir`, x)).statusCode, attendu);
      assert.equal((await put(id, { note: 'bien' }, x)).statusCode, attendu);
    }
    assert.equal((await get(env.app, '/api/seances/nimportequoi/souvenir', hote)).statusCode, 404);
    assert.equal((await get(env.app, `/api/seances/${id}/souvenir`, hote)).statusCode, 200);
  });

  test('en direct : une note est diffusée à la salle, la fin décidée par l\'hôte aussi', async () => {
    const id = inserer(env, hote, film, [invite]);
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    await put(id, { note: 'coeur' }, invite);
    const m = await a.attendre('souvenir');
    assert.equal(m.fin, false);
    assert.equal(m.souvenir.personnes.find((p) => p.utilisateur.prenom === 'Ivan')?.note, 'coeur');
    await b.attendre('souvenir');
    assert.equal((await patch(env.app, `/api/seances/${id}`, { terminee: true }, hote)).statusCode, 200);
    const fin = await b.attendre('souvenir', (x) => x.fin);
    assert.equal(fin.souvenir.seanceId, id);
    assert.ok(fin.souvenir.termineeLe);
    a.fermer(); b.fermer();
  });

  test('historique : le souvenir accompagne chaque séance vue', async () => {
    const id = inserer(env, hote, film, [invite]);
    env.db.prepare('INSERT INTO progression (utilisateur_id, film_id, position, duree, seance_id, termine, vu_le) VALUES (?, ?, 1000, 1000, ?, 1, ?)')
      .run(invite.id, film, id, new Date().toISOString());
    await put(id, { note: 'bien' }, invite);
    const h = (await get(env.app, '/api/historique', invite)).json();
    assert.equal(h.length, 1);
    assert.equal(h[0].souvenir.seanceId, id);
    assert.equal(h[0].souvenir.personnes[0].note, 'bien');
    const r = (await get(env.app, '/api/reprendre', invite)).json();
    assert.ok(r.every((e: { souvenir?: unknown }) => e.souvenir === undefined), 'la reprise n\'en porte pas');
  });
});
