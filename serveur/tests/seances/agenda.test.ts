// Agenda : fabrication du .ics (RFC 5545) et route `GET /api/seances/:id/agenda.ics`.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { construireIcs, dateIcs, dureeIcs, echapperTexteIcs, nomFichierAgenda, plierLigneIcs } from '@canape/partage';
import { creerUtilisateur, faireConnaitre, get, post, type UtilisateurTest } from '../aides.ts';
import { creerEnv, insererFilm, type Env } from './aides-seances.ts';

const base = {
  seanceId: 'abcdefghijkl', hoteUid: 'canape.exemple', titre: null, filmTitre: 'Les Nuits de Lisbonne',
  prevueLe: '2026-11-20T19:30:00.000Z', dureeSecondes: 6300, url: 'https://canape.exemple/seances/abcdefghijkl',
  maintenant: new Date('2026-11-13T10:00:00.000Z'),
};

describe('.ics : fonctions pures', () => {
  test('date UTC, durée, échappements', () => {
    assert.equal(dateIcs(new Date('2026-01-02T03:04:05.678Z')), '20260102T030405Z');
    assert.equal(dureeIcs(7200), 'PT2H');
    assert.equal(dureeIcs(6300), 'PT1H45M');
    assert.equal(dureeIcs(3001), 'PT51M');
    assert.equal(dureeIcs(null), 'PT2H', 'durée inconnue : 2 h');
    assert.equal(dureeIcs(0), 'PT2H');
    assert.equal(echapperTexteIcs('a;b,c\\d\ne'), 'a\;b\\,c\\\\d\\ne');
  });

  test('pliage : 75 octets au plus par ligne, suites commençant par une espace, sans couper un caractère UTF-8', () => {
    const longue = 'DESCRIPTION:' + 'é'.repeat(100) + '😀'.repeat(10);
    const morceaux = plierLigneIcs(longue);
    assert.ok(morceaux.length > 2);
    for (const m of morceaux) assert.ok(Buffer.byteLength(m) <= 75, `${Buffer.byteLength(m)} octets`);
    for (const m of morceaux.slice(1)) assert.ok(m.startsWith(' '));
    assert.equal(morceaux[0] + morceaux.slice(1).map((m) => m.slice(1)).join(''), longue, 'rien de perdu au dépliage');
    assert.deepEqual(plierLigneIcs('court'), ['court']);
  });

  test('VCALENDAR : CRLF, UID stable, DTSTART en UTC, DURATION, SUMMARY, URL, rappel de 15 minutes', () => {
    const ics = construireIcs(base);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
    assert.doesNotMatch(ics.replace(/\r\n/g, ''), /[\r\n]/);
    for (const l of ics.split('\r\n').slice(0, -1)) assert.ok(Buffer.byteLength(l) <= 75, l);
    for (const attendu of [
      'VERSION:2.0', 'UID:abcdefghijkl@canape.exemple', 'DTSTAMP:20261113T100000Z', 'DTSTART:20261120T193000Z', 'DURATION:PT1H45M',
      'SUMMARY:Canapé : Les Nuits de Lisbonne', 'URL:https://canape.exemple/seances/abcdefghijkl', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY',
    ]) assert.ok(ics.split('\r\n').includes(attendu), attendu);
    assert.equal(construireIcs(base), ics, 'même entrée, même fichier');
    assert.equal(ics.match(/^UID:/gm)?.length, 1);
  });

  test('titre de la séance avant celui du film, caractères spéciaux échappés, durée inconnue = 2 h', () => {
    const ics = construireIcs({ ...base, titre: 'Soirée; avec, des "signes"', dureeSecondes: null });
    assert.ok(ics.includes('SUMMARY:Canapé : Soirée\; avec\\, des "signes"\r\n'));
    assert.ok(ics.includes('DURATION:PT2H\r\n'));
  });

  test('nom de fichier sûr', () => {
    assert.equal(nomFichierAgenda('abcdefghijkl'), 'seance-abcdefghijkl.ics');
    assert.equal(nomFichierAgenda('a"b\r\nc'), 'seance-abc.ics');
  });
});

describe('.ics : route', () => {
  let env: Env;
  let hote: UtilisateurTest, invite: UtilisateurTest, etranger: UtilisateurTest, admin: UtilisateurTest;
  let film: string;
  before(async () => {
    env = await creerEnv();
    hote = await creerUtilisateur(env, { prenom: 'Hana' });
    invite = await creerUtilisateur(env, { prenom: 'Ivan' });
    etranger = await creerUtilisateur(env, { prenom: 'Eli' });
    admin = await creerUtilisateur(env, { role: 'admin', prenom: 'Admin' });
    await faireConnaitre(env.app, hote, invite);
    film = insererFilm(env, hote, { visibilite: 'tous', duree: 5400 });
  });
  after(() => env.fermer());

  test('hôte et invité reçoivent le fichier ; étranger, administrateur non invité et visiteur sans session : 404 / 401', async () => {
    const id = (await post(env.app, '/api/seances', { filmId: film, titre: 'Soirée', prevueLe: '2026-12-01T20:00:00.000Z', invites: [invite.id] }, hote)).json().id;
    for (const u of [hote, invite]) {
      const r = await get(env.app, `/api/seances/${id}/agenda.ics`, u);
      assert.equal(r.statusCode, 200);
      assert.equal(r.headers['content-type'], 'text/calendar; charset=utf-8');
      assert.equal(r.headers['content-disposition'], `attachment; filename="seance-${id}.ics"`);
      assert.ok(r.body.includes(`UID:${id}@localhost:8080\r\n`));
      assert.ok(r.body.includes('DTSTART:20261201T200000Z\r\n'));
      assert.ok(r.body.includes('DURATION:PT1H30M\r\n'), 'durée du film');
      assert.ok(r.body.includes('SUMMARY:Canapé : Soirée\r\n'));
      assert.ok(r.body.includes(`URL:http://localhost:8080/seances/${id}\r\n`));
    }
    assert.equal((await get(env.app, `/api/seances/${id}/agenda.ics`, etranger)).statusCode, 404);
    assert.equal((await get(env.app, `/api/seances/${id}/agenda.ics`, admin)).statusCode, 404);
    assert.equal((await get(env.app, `/api/seances/${id}/agenda.ics`)).statusCode, 401);
  });

  test('jamais le jeton d\'invitation dans le fichier', async () => {
    const id = (await post(env.app, '/api/seances', { filmId: film, prevueLe: '2026-12-01T20:00:00.000Z' }, hote)).json().id;
    const lien = (await post(env.app, `/api/seances/${id}/lien`, undefined, hote)).json().lien as string;
    const jeton = lien.split('/').pop()!;
    const r = await get(env.app, `/api/seances/${id}/agenda.ics`, hote);
    assert.equal(r.statusCode, 200);
    assert.ok(!r.body.includes(jeton));
    assert.ok(!r.body.includes('/rejoindre/'));
  });

  test('séance sans date prévue : 404 ; séance inconnue : 404', async () => {
    const id = (await post(env.app, '/api/seances', { filmId: film }, hote)).json().id;
    assert.equal((await get(env.app, `/api/seances/${id}/agenda.ics`, hote)).statusCode, 404);
    assert.equal((await get(env.app, '/api/seances/nimportequoi/agenda.ics', hote)).statusCode, 404);
  });
});
