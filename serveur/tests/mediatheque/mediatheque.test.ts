import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { Upload } from 'tus-js-client';
import type { Film } from '@canape/partage';
import { importerFilmsCli } from '../../src/modules/mediatheque/cli.ts';
import type { Mediatheque } from '../../src/modules/mediatheque/mediatheque.ts';
import { creerAppTest, creerUtilisateur, faireConnaitre, get, patch, post, requete, supprimer, ORIGINE_TEST, type AppTest, type UtilisateurTest } from '../aides.ts';

const fixture = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const med = (t: AppTest) => t.app.mediatheque as unknown as Mediatheque;

function metadonnees(nom: string): string {
  return `filename ${Buffer.from(nom).toString('base64')}`;
}

/** Crée un envoi tus par une requête réelle ; rend l'URL de l'envoi et l'état. */
async function creerEnvoi(base: string, u: UtilisateurTest, nom: string, taille: number, extra: Record<string, string> = {}) {
  const r = await fetch(`${base}/api/televersement`, {
    method: 'POST',
    headers: { cookie: u.cookie, 'Tus-Resumable': '1.0.0', 'Upload-Length': String(taille), 'Upload-Metadata': metadonnees(nom), ...extra },
  });
  return r;
}

function envoyer(base: string, u: UtilisateurTest, octets: Buffer, nom: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const up = new Upload(octets as never, {
      endpoint: `${base}/api/televersement`,
      headers: { cookie: u.cookie },
      metadata: { filename: nom },
      chunkSize: 4096,
      retryDelays: null,
      onError: reject,
      onSuccess: () => resolve(up.url ?? ''),
    });
    up.start();
  });
}

async function attendreFilm(t: AppTest, u: UtilisateurTest, etat: string): Promise<Film> {
  await med(t).attendreTraitements();
  for (let i = 0; i < 100; i++) {
    const films = (await get(t.app, '/api/films?vue=miens', u)).json() as Film[];
    const f = films.find((x) => x.etat === etat);
    if (f) return f;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Aucun film à l'état ${etat}`);
}

describe('médiathèque : téléversement tus', () => {
  let t: AppTest;
  let base: string;
  let alice: UtilisateurTest;
  let bob: UtilisateurTest;
  let petit: UtilisateurTest;
  let sans: UtilisateurTest;
  before(async () => {
    t = await creerAppTest({ env: { CANAPE_TELEVERSEMENT_MAX: '1M' } });
    await t.app.listen({ host: '127.0.0.1', port: 0 });
    base = `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
    alice = await creerUtilisateur(t, { prenom: 'Alice' });
    bob = await creerUtilisateur(t, { prenom: 'Bob' });
    petit = await creerUtilisateur(t, { prenom: 'Petit', quotaOctets: 100_000 });
    sans = await creerUtilisateur(t, { prenom: 'Sans', peutTeleverser: false });
  });
  after(() => t.fermer());

  test('envoi complet par tus-js-client : film créé, analysé, prêt, abonnés prévenus', async () => {
    const prets: string[] = [];
    t.app.mediatheque.surFilmPret((id) => prets.push(id));
    await envoyer(base, alice, readFileSync(fixture('essai.mkv')), 'Mon.Petit.Film.2021.MULTi.1080p.WEB.x265-GRP.mkv');
    const f = await attendreFilm(t, alice, 'pret');
    assert.equal(f.titre, 'Mon Petit Film');
    assert.equal(f.annee, 2021);
    assert.equal(f.proprietaireId, alice.id);
    assert.ok(f.duree && f.duree > 1);
    assert.equal(f.aAffiche, true);
    assert.equal(f.aFond, true);
    assert.deepEqual(prets, [f.id]);
    assert.ok(existsSync(path.join(t.config.films, f.id, 'original.mkv')));
    assert.deepEqual(readdirSync(t.config.televersements), []);
    assert.equal((t.db.prepare('SELECT COUNT(*) AS n FROM televersements').get() as { n: number }).n, 0);
    const d = (await get(t.app, `/api/films/${f.id}`, alice)).json() as Film;
    assert.equal(d.analyse?.audio.length, 2);
    assert.equal(d.analyse?.video?.codec, 'hevc');
    for (const quoi of ['affiche', 'fond']) {
      const r = await get(t.app, `/api/films/${f.id}/${quoi}`, alice);
      assert.equal(r.statusCode, 200);
      assert.match(String(r.headers['content-type']), /image\/jpeg/);
    }
  });

  test('envoi repris après interruption', async () => {
    const octets = readFileSync(fixture('essai.mp4'));
    const r = await creerEnvoi(base, bob, 'Repris.2020.mp4', octets.length);
    assert.equal(r.status, 201);
    const url = new URL(r.headers.get('location')!, base).toString();
    const p = await fetch(url, {
      method: 'PATCH',
      headers: { cookie: bob.cookie, 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' },
      body: octets.subarray(0, 5000),
    });
    assert.equal(p.status, 204);
    assert.equal(p.headers.get('upload-offset'), '5000');
    // un autre utilisateur ne peut ni voir ni reprendre cet envoi
    const h = await fetch(url, { method: 'HEAD', headers: { cookie: alice.cookie, 'Tus-Resumable': '1.0.0' } });
    assert.equal(h.status, 404);
    await new Promise<void>((resolve, reject) => {
      const up = new Upload(octets as never, {
        endpoint: `${base}/api/televersement`, headers: { cookie: bob.cookie }, metadata: { filename: 'Repris.2020.mp4' },
        retryDelays: null, onError: reject, onSuccess: () => resolve(),
      });
      up.resumeFromPreviousUpload({ uploadUrl: url, size: octets.length, metadata: {}, creationTime: '', urlStorageKey: 'x', parallelUploadUrls: null } as never);
      up.start();
    });
    const f = await attendreFilm(t, bob, 'pret');
    assert.equal(f.titre, 'Repris');
    assert.equal(f.taille, octets.length);
  });

  test('refus : 401 sans session, 403 sans droit, 413 trop gros, 507 quota, 400 sans nom, 415 extension', async () => {
    const sansSession = await fetch(`${base}/api/televersement`, { method: 'POST', headers: { 'Tus-Resumable': '1.0.0', 'Upload-Length': '10', 'Upload-Metadata': metadonnees('a.mp4') } });
    assert.equal(sansSession.status, 401);
    assert.equal((await creerEnvoi(base, sans, 'a.mp4', 10)).status, 403);
    assert.equal((await creerEnvoi(base, alice, 'a.mp4', 2_000_000)).status, 413);
    assert.equal((await creerEnvoi(base, petit, 'a.mp4', 200_000)).status, 507);
    assert.equal((await creerEnvoi(base, alice, 'a.txt', 10)).status, 415);
    const sansNom = await fetch(`${base}/api/televersement`, { method: 'POST', headers: { cookie: alice.cookie, 'Tus-Resumable': '1.0.0', 'Upload-Length': '10' } });
    assert.equal(sansNom.status, 400);
    const sansLongueur = await fetch(`${base}/api/televersement`, { method: 'POST', headers: { cookie: alice.cookie, 'Tus-Resumable': '1.0.0', 'Upload-Metadata': metadonnees('a.mp4'), 'Upload-Defer-Length': '1' } });
    assert.equal(sansLongueur.status, 400);
  });

  test('le quota compte les envois en cours', async () => {
    assert.equal((await creerEnvoi(base, petit, 'a.mp4', 60_000)).status, 201);
    assert.equal((await creerEnvoi(base, petit, 'b.mp4', 60_000)).status, 507);
  });

  test('un fichier qui n’est pas une vidéo passe à l’état erreur avec un message', async () => {
    await envoyer(base, alice, Buffer.from('ceci n’est pas une video du tout'.repeat(20)), 'Faux.2020.mkv');
    const f = await attendreFilm(t, alice, 'erreur');
    assert.match(f.erreur ?? '', /vidéo/);
  });

  test('nettoyage des envois abandonnés depuis plus de 24 h', async () => {
    const r = await creerEnvoi(base, alice, 'Abandon.mp4', 100);
    const id = r.headers.get('location')!.split('/').pop()!;
    assert.equal(await med(t).nettoyerTeleversements(), 0);
    const vieux = new Date(Date.now() - 25 * 3600_000);
    const { utimesSync } = await import('node:fs');
    utimesSync(path.join(t.config.televersements, id), vieux, vieux);
    assert.ok((await med(t).nettoyerTeleversements()) >= 1);
    assert.equal(t.db.prepare('SELECT 1 FROM televersements WHERE id = ?').get(id), undefined);
  });
});

describe('médiathèque : routes, droits, sous-titres, suppression', () => {
  let t: AppTest;
  let proprio: UtilisateurTest;
  let ami: UtilisateurTest;
  let etranger: UtilisateurTest;
  let admin: UtilisateurTest;
  let id: string;
  before(async () => {
    t = await creerAppTest();
    proprio = await creerUtilisateur(t, { prenom: 'Proprio' });
    ami = await creerUtilisateur(t, { prenom: 'Ami' });
    etranger = await creerUtilisateur(t, { prenom: 'Etranger' });
    admin = await creerUtilisateur(t, { role: 'admin', prenom: 'Admin' });
    id = await med(t).creerFilm({ proprietaireId: proprio.id, nomOrigine: 'Le.Film.2022.1080p.mp4', source: fixture('essai.mp4'), copier: true });
    await med(t).attendreTraitements();
  });
  after(() => t.fermer());

  test('le film est prêt, privé : propriétaire et admin le voient, les autres reçoivent 404', async () => {
    assert.equal(((await get(t.app, `/api/films/${id}`, proprio)).json() as Film).etat, 'pret');
    assert.equal((await get(t.app, `/api/films/${id}`, admin)).statusCode, 200);
    for (const u of [ami, etranger]) {
      assert.equal((await get(t.app, `/api/films/${id}`, u)).statusCode, 404);
      assert.equal((await get(t.app, `/api/films/${id}/affiche`, u)).statusCode, 404);
      assert.equal((await patch(t.app, `/api/films/${id}`, { titre: 'x' }, u)).statusCode, 404);
    }
    assert.equal((await get(t.app, `/api/films/${id}`)).statusCode, 401);
    const s = t.app.mediatheque;
    assert.equal(s.peutVoir({ ...proprio, sessionId: '', peutTeleverser: true, quotaOctets: null, couleur: null, creeLe: '', derniereConnexion: null } as never, id), true);
    assert.equal(s.obtenir(id)?.etat, 'pret');
    assert.equal(s.obtenir('inconnu'), null);
  });

  test('modification : titre, année, résumé ; validation', async () => {
    const r = await patch(t.app, `/api/films/${id}`, { titre: 'Le Film', annee: 2023, resume: 'Un résumé.' }, proprio);
    assert.equal(r.statusCode, 200);
    const f = r.json() as Film;
    assert.deepEqual([f.titre, f.annee, f.resume, f.modifiable], ['Le Film', 2023, 'Un résumé.', true]);
    assert.equal((await patch(t.app, `/api/films/${id}`, { titre: '  ' }, proprio)).statusCode, 400);
    assert.equal((await patch(t.app, `/api/films/${id}`, { annee: 1500 }, proprio)).statusCode, 400);
    assert.equal((await patch(t.app, `/api/films/${id}`, { visibilite: 'secret' }, proprio)).statusCode, 400);
    assert.equal((await patch(t.app, `/api/films/${id}`, { partages: [99999] }, proprio)).statusCode, 400);
  });

  test('partage : l’ami voit le film mais ne peut pas le modifier ; vues de la galerie', async () => {
    await faireConnaitre(t.app, proprio, ami);
    const r = await patch(t.app, `/api/films/${id}`, { visibilite: 'partage', partages: [ami.id] }, proprio);
    assert.deepEqual((r.json() as Film).partages, [ami.id]);
    const vu = await get(t.app, `/api/films/${id}`, ami);
    assert.equal(vu.statusCode, 200);
    assert.equal((vu.json() as Film).modifiable, false);
    assert.deepEqual((vu.json() as Film).partages, []);
    assert.equal((await patch(t.app, `/api/films/${id}`, { titre: 'x' }, ami)).statusCode, 403);
    assert.equal((await supprimer(t.app, `/api/films/${id}`, ami)).statusCode, 403);
    assert.equal((await get(t.app, `/api/films/${id}`, etranger)).statusCode, 404);
    assert.equal(((await get(t.app, '/api/films?vue=partages', ami)).json() as Film[]).length, 1);
    assert.equal(((await get(t.app, '/api/films?vue=miens', ami)).json() as Film[]).length, 0);
    assert.equal(((await get(t.app, '/api/films?vue=tous', etranger)).json() as Film[]).length, 0);
    assert.equal(((await get(t.app, '/api/films?vue=miens&q=film', proprio)).json() as Film[]).length, 1);
    assert.equal(((await get(t.app, '/api/films?vue=miens&q=zzz', proprio)).json() as Film[]).length, 0);
    assert.equal((await get(t.app, '/api/films?vue=bizarre', proprio)).statusCode, 400);
    const tous = await patch(t.app, `/api/films/${id}`, { visibilite: 'tous' }, proprio);
    assert.equal(tous.statusCode, 200);
    assert.equal((await get(t.app, `/api/films/${id}`, etranger)).statusCode, 200);
    await patch(t.app, `/api/films/${id}`, { visibilite: 'prive' }, proprio);
  });

  test('règle d’accès ajoutée par un autre module (invité d’une séance)', async () => {
    assert.equal((await get(t.app, `/api/films/${id}`, etranger)).statusCode, 404);
    t.app.mediatheque.ajouterRegleAcces((u, filmId) => u.id === etranger.id && filmId === id);
    assert.equal((await get(t.app, `/api/films/${id}`, etranger)).statusCode, 200);
    assert.equal((await get(t.app, `/api/films/${id}`, ami)).statusCode, 404);
  });

  test('images : cache HTTP selon ?v=', async () => {
    const f = (await get(t.app, `/api/films/${id}`, proprio)).json() as Film;
    const sans = await get(t.app, `/api/films/${id}/affiche`, proprio);
    assert.match(String(sans.headers['cache-control']), /no-cache/);
    const avec = await get(t.app, `/api/films/${id}/fond?v=${f.versionImages}`, proprio);
    assert.match(String(avec.headers['cache-control']), /immutable/);
  });

  test('TMDB inactif sans clé', async () => {
    const r = await post(t.app, `/api/films/${id}/tmdb/recherche`, { requete: 'x' }, proprio);
    assert.equal(r.statusCode, 409);
  });

  test('sous-titres externes : .srt converti en .vtt, .vtt accepté, refus d’un autre format, suppression', async () => {
    const envoi = (nom: string, contenu: Buffer, u: UtilisateurTest) => {
      const b = '----canape';
      const corps = Buffer.concat([
        Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        contenu, Buffer.from(`\r\n--${b}--\r\n`),
      ]);
      return requete(t.app, 'POST', `/api/films/${id}/sous-titres`, { utilisateur: u, corps: corps as never, entetes: { 'content-type': `multipart/form-data; boundary=${b}` } });
    };
    const r = await envoi('Le.Film.fr.srt', readFileSync(fixture('essai.srt')), proprio);
    assert.equal(r.statusCode, 201);
    const st = r.json() as { id: number; langue: string; libelle: string };
    assert.equal(st.langue, 'fr');
    const vtt = readFileSync(path.join(t.config.films, id, 'sous-titres', `e${st.id}.vtt`), 'utf8');
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /00:00:00\.000 --> 00:00:01\.000/);
    // Windows-1252
    const w = await envoi('Le.Film.en.srt', Buffer.from('1\r\n00:00:00,000 --> 00:00:01,000\r\nCaf\xe9\r\n', 'latin1'), proprio);
    assert.equal(w.statusCode, 201);
    assert.match(readFileSync(path.join(t.config.films, id, 'sous-titres', `e${(w.json() as { id: number }).id}.vtt`), 'utf8'), /Café/);
    assert.equal((await envoi('x.vtt', Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n'), proprio)).statusCode, 201);
    assert.equal((await envoi('x.txt', Buffer.from('a'), proprio)).statusCode, 415);
    assert.equal((await envoi('x.srt', readFileSync(fixture('essai.srt')), ami)).statusCode, 404);
    const f = (await get(t.app, `/api/films/${id}`, proprio)).json() as Film;
    assert.equal(f.sousTitresExternes?.length, 3);
    assert.equal((await supprimer(t.app, `/api/films/${id}/sous-titres/${st.id}`, proprio)).statusCode, 204);
    assert.equal((await supprimer(t.app, `/api/films/${id}/sous-titres/${st.id}`, proprio)).statusCode, 404);
  });

  test('suppression : dossier, lignes, événement', async () => {
    const supprimes: string[] = [];
    t.app.mediatheque.surFilmSupprime((x) => supprimes.push(x));
    assert.equal((await supprimer(t.app, `/api/films/${id}`, proprio)).statusCode, 204);
    assert.deepEqual(supprimes, [id]);
    assert.equal(existsSync(path.join(t.config.films, id)), false);
    assert.equal(t.db.prepare('SELECT 1 FROM films WHERE id = ?').get(id), undefined);
    assert.equal((await get(t.app, `/api/films/${id}`, proprio)).statusCode, 404);
    assert.equal(ORIGINE_TEST.length > 0, true);
  });
});

describe('médiathèque : import des films de la 0.1', () => {
  let t: AppTest;
  before(async () => { t = await creerAppTest(); });
  after(() => t.fermer());

  test('chaque vidéo devient un film du propriétaire, avec ses sous-titres voisins', async () => {
    const u = await creerUtilisateur(t, { prenom: 'Importeur', identifiant: 'importeur' });
    const src = path.join(t.dossier, 'ancien');
    mkdirSync(src);
    copyFileSync(fixture('essai.mp4'), path.join(src, 'Premier.Film.2018.mp4'));
    copyFileSync(fixture('essai.srt'), path.join(src, 'Premier.Film.2018.fr.srt'));
    copyFileSync(fixture('essai.mkv'), path.join(src, 'Second Film (2020).mkv'));
    writeFileSync(path.join(src, 'notes.txt'), 'ignoré');
    const n = await importerFilmsCli({ config: t.config, db: t.db }, { dossier: src, proprietaire: 'importeur', copier: true });
    assert.equal(n, 2);
    assert.ok(existsSync(path.join(src, 'Premier.Film.2018.mp4')), 'avec --copier, la source reste');
    const films = (await get(t.app, '/api/films?vue=miens', u)).json() as Film[];
    assert.deepEqual(films.map((f) => f.titre).sort(), ['Premier Film', 'Second Film']);
    assert.ok(films.every((f) => f.etat === 'pret'));
    const premier = (await get(t.app, `/api/films/${films.find((f) => f.titre === 'Premier Film')!.id}`, u)).json() as Film;
    assert.equal(premier.sousTitresExternes?.length, 1);
    await assert.rejects(importerFilmsCli({ config: t.config, db: t.db }, { dossier: src, proprietaire: 'inconnu' }), /Aucun compte/);
    // sans --copier : déplacé
    const src2 = path.join(t.dossier, 'ancien2');
    mkdirSync(src2);
    copyFileSync(fixture('essai.mp4'), path.join(src2, 'Troisieme.mp4'));
    assert.equal(await importerFilmsCli({ config: t.config, db: t.db }, { dossier: src2, proprietaire: 'importeur' }), 1);
    assert.equal(existsSync(path.join(src2, 'Troisieme.mp4')), false);
  });
});
