// Films « à voir ensemble » : envie de chacun, visibilité, cascade, retrait une fois le film vu.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { EtatEnvie, Film, FilmAVoir } from '@canape/partage';
import { creerAppTest, creerUtilisateur, get, patch, put, supprimer, type AppTest, type UtilisateurTest } from '../aides.ts';
import { connecter, creerEnv, inserer, insererFilm, type Env } from '../seances/aides-seances.ts';

describe('envies : REST', () => {
  let t: AppTest;
  let ana: UtilisateurTest;
  let ben: UtilisateurTest;
  let cleo: UtilisateurTest;
  let admin: UtilisateurTest;
  let commun: string;
  let prive: string;

  before(async () => {
    t = await creerAppTest();
    ana = await creerUtilisateur(t, { prenom: 'Ana', couleur: '#ff8fb4' });
    ben = await creerUtilisateur(t, { prenom: 'Ben' });
    cleo = await creerUtilisateur(t, { prenom: 'Cléo' });
    admin = await creerUtilisateur(t, { role: 'admin', prenom: 'Admin' });
    commun = insererFilm(t, ana, { visibilite: 'tous' });
    prive = insererFilm(t, ana, { visibilite: 'prive' });
    // Ana connaît Ben et Cléo (un film partagé avec eux) ; Ben et Cléo ne se connaissent pas entre eux.
    const lien = insererFilm(t, ana, { visibilite: 'partage' });
    for (const u of [ben, cleo]) t.db.prepare('INSERT INTO films_partages (film_id, utilisateur_id) VALUES (?, ?)').run(lien, u.id);
  });
  after(async () => { await t.fermer(); });

  const liste = async (u: UtilisateurTest) => (await get(t.app, '/api/envies', u)).json() as FilmAVoir[];

  test('il faut être connecté', async () => {
    assert.equal((await put(t.app, `/api/films/${commun}/envie`, null, null)).statusCode, 401);
    assert.equal((await get(t.app, '/api/envies', null)).statusCode, 401);
    assert.equal((await supprimer(t.app, `/api/films/${commun}/envie`, null)).statusCode, 401);
  });

  test('PUT marque, est idempotent ; DELETE retire', async () => {
    let r = await put(t.app, `/api/films/${commun}/envie`, null, ben);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json() as EtatEnvie, { filmId: commun, moi: true, nombre: 1 });
    r = await put(t.app, `/api/films/${commun}/envie`, null, ben);
    assert.equal((r.json() as EtatEnvie).nombre, 1);
    r = await supprimer(t.app, `/api/films/${commun}/envie`, ben);
    assert.deepEqual(r.json() as EtatEnvie, { filmId: commun, moi: false, nombre: 0 });
    r = await supprimer(t.app, `/api/films/${commun}/envie`, ben);
    assert.equal(r.statusCode, 200, 'retirer une envie absente ne fait pas d\'erreur');
    assert.deepEqual(await liste(ben), []);
  });

  test('liste : trié par nombre d\'envies, avec les personnes et « moi »', async () => {
    const autre = insererFilm(t, ana, { visibilite: 'tous' });
    await put(t.app, `/api/films/${autre}/envie`, null, cleo);
    await put(t.app, `/api/films/${commun}/envie`, null, ana);
    await put(t.app, `/api/films/${commun}/envie`, null, ben);
    const l = await liste(ana);
    assert.deepEqual(l.map((x) => x.film.id), [commun, autre]);
    assert.deepEqual(l[0]!.personnes.map((p) => p.prenom), ['Ana', 'Ben']);
    assert.equal(l[0]!.personnes[0]!.couleur, '#ff8fb4');
    assert.equal(l[0]!.moi, true);
    assert.equal(l[1]!.moi, false);
    assert.equal(l[0]!.film.nbEnvies, 2);
    assert.equal(l[0]!.film.envie, true);
    assert.deepEqual((await liste(ben)).map((x) => x.film.id), [commun], 'Ben ne connaît pas Cléo : son envie ne ressort pas');
    for (const f of [autre, commun]) await supprimer(t.app, `/api/films/${f}/envie`, ana);
    await supprimer(t.app, `/api/films/${commun}/envie`, ben);
    await supprimer(t.app, `/api/films/${autre}/envie`, cleo);
  });

  test('un film privé reste invisible : pas d\'envie, pas dans la liste, 404 sans indice', async () => {
    const r = await put(t.app, `/api/films/${prive}/envie`, null, ben);
    assert.equal(r.statusCode, 404);
    assert.equal((await supprimer(t.app, `/api/films/${prive}/envie`, ben)).statusCode, 404);
    assert.equal((await put(t.app, '/api/films/inconnu/envie', null, ben)).statusCode, 404);
    // Le propriétaire marque son film privé : Ben ne le voit pas dans la liste, Ana si.
    assert.equal((await put(t.app, `/api/films/${prive}/envie`, null, ana)).statusCode, 200);
    assert.deepEqual(await liste(ben), []);
    assert.deepEqual((await liste(ana)).map((x) => x.film.id), [prive]);
    assert.equal((await liste(admin)).length, 1, 'l\'administrateur voit tous les films');
    // Partagé avec Ben : il le voit, avec Ana.
    t.db.prepare("UPDATE films SET visibilite = 'partage' WHERE id = ?").run(prive);
    t.db.prepare('INSERT INTO films_partages (film_id, utilisateur_id) VALUES (?, ?)').run(prive, ben.id);
    assert.equal((await liste(ben)).length, 1);
    assert.equal((await liste(cleo)).length, 0);
    // Redevenu privé : il disparaît pour Ben, sa propre envie ne ressort pas.
    t.db.prepare("UPDATE films SET visibilite = 'prive' WHERE id = ?").run(prive);
    t.db.prepare('DELETE FROM films_partages WHERE film_id = ?').run(prive);
    await put(t.app, `/api/films/${commun}/envie`, null, ben);
    assert.deepEqual((await liste(ben)).map((x) => x.film.id), [commun]);
    await supprimer(t.app, `/api/films/${prive}/envie`, ana);
    await supprimer(t.app, `/api/films/${commun}/envie`, ben);
  });

  test('vie privée : les comptes inconnus ne sont pas nommés, et un film voulu seulement par eux n\'apparaît pas', async () => {
    const f = insererFilm(t, ana, { visibilite: 'tous' });
    await put(t.app, `/api/films/${f}/envie`, null, cleo);
    // Ben ne connaît pas Cléo (aucun partage, aucune séance en commun).
    assert.ok(!(await liste(ben)).some((x) => x.film.id === f));
    await put(t.app, `/api/films/${f}/envie`, null, ben);
    const l = (await liste(ben)).find((x) => x.film.id === f)!;
    assert.deepEqual(l.personnes.map((p) => p.prenom), ['Ben']);
    assert.ok((await liste(admin)).some((x) => x.film.id === f && x.personnes.length === 2), 'l\'administrateur voit tout le monde');
    t.db.prepare('DELETE FROM envies WHERE film_id = ?').run(f);
  });

  test('les films pas prêts ne sont pas proposés', async () => {
    const f = insererFilm(t, ana, { visibilite: 'tous', etat: 'analyse' });
    t.db.prepare('INSERT INTO envies (utilisateur_id, film_id, cree_le) VALUES (?, ?, ?)').run(ben.id, f, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(await liste(ben), []);
    t.db.prepare('DELETE FROM envies WHERE film_id = ?').run(f);
  });

  test('la fiche et la liste de films portent l\'envie et le nombre', async () => {
    await put(t.app, `/api/films/${commun}/envie`, null, ben);
    await put(t.app, `/api/films/${commun}/envie`, null, cleo);
    const fiche = (await get(t.app, `/api/films/${commun}`, ben)).json() as Film;
    assert.equal(fiche.envie, true);
    assert.equal(fiche.nbEnvies, 2);
    const galerie = (await get(t.app, '/api/films?vue=tous', ana)).json() as Film[];
    const f = galerie.find((x) => x.id === commun)!;
    assert.equal(f.envie, false);
    assert.equal(f.nbEnvies, 2);
    await supprimer(t.app, `/api/films/${commun}/envie`, ben);
    await supprimer(t.app, `/api/films/${commun}/envie`, cleo);
  });

  test('cascade : l\'envie disparaît avec le film et avec le compte', async () => {
    const f = insererFilm(t, ana, { visibilite: 'tous' });
    const c = await creerUtilisateur(t, { prenom: 'Zoé' });
    await put(t.app, `/api/films/${f}/envie`, null, c);
    await put(t.app, `/api/films/${f}/envie`, null, ben);
    const n = (filtre: string, v: string | number) => (t.db.prepare(`SELECT COUNT(*) AS n FROM envies WHERE ${filtre} = ?`).get(v) as { n: number }).n;
    t.db.prepare('DELETE FROM utilisateurs WHERE id = ?').run(c.id);
    assert.equal(n('film_id', f), 1);
    t.db.prepare('DELETE FROM films WHERE id = ?').run(f);
    assert.equal(n('film_id', f), 0);
    assert.equal(n('utilisateur_id', ben.id), 0);
  });

  test('la clé unique empêche les doublons en base', async () => {
    t.db.prepare('INSERT INTO envies (utilisateur_id, film_id, cree_le) VALUES (?, ?, ?)').run(ben.id, commun, 'x');
    assert.throws(() => t.db.prepare('INSERT INTO envies (utilisateur_id, film_id, cree_le) VALUES (?, ?, ?)').run(ben.id, commun, 'y'));
    t.db.prepare('DELETE FROM envies WHERE film_id = ?').run(commun);
  });
});

describe('envies : retrait une fois le film vu', () => {
  let env: Env;
  let hote: UtilisateurTest;
  let invite: UtilisateurTest;
  let absent: UtilisateurTest;
  let film: string;

  before(async () => {
    env = await creerEnv();
    hote = await creerUtilisateur(env, { prenom: 'Hôte' });
    invite = await creerUtilisateur(env, { prenom: 'Invité' });
    absent = await creerUtilisateur(env, { prenom: 'Absent' });
    film = insererFilm(env, hote, { duree: 1000, visibilite: 'tous' });
  });
  after(async () => { await env.fermer(); });

  const envies = (f: string) => (env.db.prepare('SELECT utilisateur_id AS id FROM envies WHERE film_id = ? ORDER BY 1').all(f) as Array<{ id: number }>).map((x) => x.id);
  const vouloir = (f: string, ...us: UtilisateurTest[]) => {
    for (const u of us) env.db.prepare('INSERT OR IGNORE INTO envies (utilisateur_id, film_id, cree_le) VALUES (?, ?, ?)').run(u.id, f, '2026-01-01T00:00:00.000Z');
  };

  test('film regardé jusqu\'au bout : l\'envie des présents est retirée, pas celle de l\'absent', async () => {
    vouloir(film, hote, invite, absent);
    const id = inserer(env, hote, film, [invite, absent]);
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'progression', position: 500 });
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(envies(film), [hote.id, invite.id, absent.id].sort((x, y) => x - y), 'à mi-film, rien ne change');
    a.envoyer({ t: 'progression', position: 960 });
    b.envoyer({ t: 'progression', position: 990 });
    for (let i = 0; i < 50 && envies(film).length > 1; i++) await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(envies(film), [absent.id]);
    a.fermer(); b.fermer();
  });

  test('l\'hôte termine la séance : les présents qui ont fini le film perdent l\'envie, pas ceux qui ne l\'ont pas fini', async () => {
    const f = insererFilm(env, hote, { duree: 1000, visibilite: 'tous' });
    vouloir(f, hote, invite, absent);
    const id = inserer(env, hote, f, [invite, absent]);
    const maintenant = new Date().toISOString();
    for (const u of [hote, invite]) env.db.prepare('INSERT INTO seances_presences (seance_id, utilisateur_id, premiere_le) VALUES (?, ?, ?)').run(id, u.id, maintenant);
    const prog = env.db.prepare('INSERT INTO progression (utilisateur_id, film_id, position, duree, seance_id, termine, vu_le) VALUES (?, ?, ?, 1000, ?, ?, ?)');
    prog.run(hote.id, f, 1000, id, 1, maintenant);
    prog.run(invite.id, f, 400, id, 0, maintenant);
    prog.run(absent.id, f, 1000, id, 1, maintenant); // a vu le film ailleurs mais n'était pas dans la salle
    const r = await patch(env.app, `/api/seances/${id}`, { terminee: true }, hote);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(envies(f), [invite.id, absent.id].sort((x, y) => x - y));
  });
});
