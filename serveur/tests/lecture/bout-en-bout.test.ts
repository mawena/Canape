// Essais de bout en bout avec de petits fichiers fabriqués par ffmpeg.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { PlanDeLecture, Preparation } from '@canape/partage';
import { creerAppTest, creerUtilisateur, get, post, supprimer, requete, type AppTest, type UtilisateurTest } from '../aides.ts';
import {
  attendreQue, creerFilmDeTest, dossierMedias, fabriquerMkvH264, fabriquerMkvMpeg4, fabriquerMp4, fauxMediatheque, ffprobeSync,
  installerFaux, nettoyer, paquets, type FauxMediatheque,
} from './aides-lecture.ts';

const pgrep = (motif: string) => spawnSync('pgrep', ['-af', motif], { encoding: 'utf8' }).stdout.trim().split('\n').filter((l) => l && !/pgrep/.test(l));

describe('lecture : de bout en bout', () => {
  let dossier: string;
  let t: AppTest;
  let faux: FauxMediatheque;
  let u: UtilisateurTest;
  let admin: UtilisateurTest;
  let mpeg4: string, h264: string, direct: string;

  before(async () => {
    dossier = dossierMedias();
    fabriquerMkvMpeg4(path.join(dossier, 'mpeg4.mkv'), 20);
    writeFileSync(path.join(dossier, 'fr.srt'), '1\n00:00:01,000 --> 00:00:03,000\nBonjour le monde\n\n2\n00:00:04,000 --> 00:00:05,500\nAu revoir\n');
    fabriquerMkvH264(path.join(dossier, 'h264.mkv'), 26, path.join(dossier, 'fr.srt'));
    fabriquerMp4(path.join(dossier, 'direct.mp4'), 4);
    faux = fauxMediatheque();
    t = await creerAppTest({ env: { CANAPE_TRANSCODAGE_FILS: '2', CANAPE_PREPARATION_AUTO: '0' }, avantPret: (app) => installerFaux(app, faux) });
    u = await creerUtilisateur(t, { prenom: 'Awa' });
    admin = await creerUtilisateur(t, { role: 'admin' });
    mpeg4 = creerFilmDeTest(t, faux, u.id, path.join(dossier, 'mpeg4.mkv')).id;
    h264 = creerFilmDeTest(t, faux, u.id, path.join(dossier, 'h264.mkv')).id;
    direct = creerFilmDeTest(t, faux, u.id, path.join(dossier, 'direct.mp4')).id;
  });
  after(async () => {
    await t.fermer();
    nettoyer(dossier);
  });

  const corps = async (url: string, utilisateur = u) => {
    const r = await get(t.app, url, utilisateur);
    assert.equal(r.statusCode, 200, `${url} → ${r.statusCode} ${r.body.slice(0, 200)}`);
    return r.rawPayload;
  };

  test('MP4 H.264 + AAC : lecture directe', async () => {
    const p = JSON.parse((await corps(`/api/films/${direct}/lecture`)).toString()) as PlanDeLecture;
    assert.equal(p.mode, 'direct');
    assert.equal(p.raison, 'Lu directement');
  });

  test('image convertie : plan HLS, segment à la demande, vitesse suivie, arrêt quand plus personne ne lit', async () => {
    const p = JSON.parse((await corps(`/api/films/${mpeg4}/lecture`)).toString()) as PlanDeLecture;
    assert.equal(p.mode, 'hls');
    assert.match(p.raison, /^Image convertie pendant la lecture \(MPEG-4\)/);
    const init = await corps(p.url.replace('index.m3u8', 'init.mp4'));
    assert.equal(init.subarray(4, 8).toString(), 'ftyp');
    const s1 = await corps(p.url.replace('index.m3u8', '1.m4s'));
    assert.ok(s1.length > 500);
    assert.deepEqual(t.app.lecture.conversions.lister().map((c) => [c.filmId, c.mode]), [[mpeg4, 'conversion']]);
    // Un segment de ce film est maintenant demandé : une seule conversion par film et piste, jamais deux.
    await Promise.all([1, 2, 3].map((n) => corps(p.url.replace('index.m3u8', `${n}.m4s`))));
    assert.equal(t.app.lecture.conversions.lister().length, 1);
    await attendreQue(() => t.app.lecture.conversions.actives() === 0, 20_000);
    assert.deepEqual(pgrep(`ffmpeg.*${mpeg4}`), []);
  });

  test('son seul converti : copie vidéo, liste d\'après les images clés, segments aux durées annoncées', async (tc) => {
    const p = JSON.parse((await corps(`/api/films/${h264}/lecture`)).toString()) as PlanDeLecture;
    assert.equal(p.mode, 'hls');
    assert.equal(p.raison, 'Son converti pour ton navigateur');
    const base = p.url.replace('index.m3u8', '');
    const liste = (await corps(p.url)).toString();
    const durees = [...liste.matchAll(/#EXTINF:([\d.]+)/g)].map((m) => Number(m[1]));
    tc.diagnostic(`durées annoncées : ${durees.join(' ')}`);
    assert.deepEqual(durees.slice(0, 3), [9, 4, 7]);
    const init = await corps(`${base}init.mp4`);
    for (let n = 0; n < durees.length; n++) {
      const seg = await corps(`${base}${n}.m4s`);
      const f = path.join(dossier, `copie-${n}.mp4`);
      writeFileSync(f, Buffer.concat([init, seg]));
      const v = paquets(f).video;
      const pts = v.map((x) => x.pts).sort((a, b) => a - b);
      const reel = pts.at(-1)! - pts[0]! + 0.04;
      assert.ok(Math.abs(reel - durees[n]!) < 0.1, `segment ${n} : ${reel.toFixed(2)} s réels pour ${durees[n]} annoncés`);
    }
    const a = ffprobeSync(path.join(dossier, 'copie-0.mp4'));
    assert.deepEqual(a.streams.map((s: { codec_name: string }) => s.codec_name).sort(), ['aac', 'h264']);
  });

  test('sous-titres : piste texte extraite en WebVTT et mise en cache ; externe servi ; refus sans droit', async () => {
    const p = JSON.parse((await corps(`/api/films/${h264}/lecture`)).toString()) as PlanDeLecture;
    assert.equal(p.sousTitres.length, 1);
    const vtt = (await corps(p.sousTitres[0]!.url)).toString();
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /00:01\.00\d --> 00:03\.00\d\s+Bonjour le monde/, vtt);
    assert.ok(existsSync(path.join(t.config.cache, h264, 'sous-titres', `p${p.sousTitres[0]!.cle.slice(1)}.vtt`)));
    assert.equal((await get(t.app, `/media/${h264}/sous-titres/p0.vtt`, u)).statusCode, 404);
    // Externe
    mkdirSync(path.join(t.config.films, h264, 'sous-titres'), { recursive: true });
    writeFileSync(path.join(t.config.films, h264, 'sous-titres', 'en.vtt'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n');
    t.db.prepare("INSERT INTO sous_titres_externes (film_id, langue, libelle, fichier) VALUES (?, 'eng', 'Anglais', ?)").run(h264, `${h264}/sous-titres/en.vtt`);
    const plan2 = JSON.parse((await corps(`/api/films/${h264}/lecture`)).toString()) as PlanDeLecture;
    const ext = plan2.sousTitres.find((s) => s.cle.startsWith('e'))!;
    assert.match((await corps(ext.url)).toString(), /Hello/);
    t.db.prepare("INSERT INTO sous_titres_externes (film_id, langue, libelle, fichier) VALUES (?, 'fra', 'Piège', '../../../etc/passwd')").run(h264);
    const piege = t.db.prepare('SELECT MAX(id) AS id FROM sous_titres_externes').get() as { id: number };
    assert.equal((await get(t.app, `/media/${h264}/sous-titres/e${piege.id}.vtt`, u)).statusCode, 404);
    const autre = await creerUtilisateur(t);
    assert.equal((await get(t.app, `/media/${h264}/sous-titres/p2.vtt`, autre)).statusCode, 404);
  });

  test('préparation : file, progression, version lisible partout, lecture directe dessus, suppression', async () => {
    const r = await post(t.app, `/api/films/${mpeg4}/preparations`, {}, u);
    assert.equal(r.statusCode, 201);
    assert.equal((r.json() as Preparation).etat, 'attente');
    assert.equal((await post(t.app, `/api/films/${mpeg4}/preparations`, {}, u)).statusCode, 200);
    await attendreQue(async () => ((await get(t.app, `/api/films/${mpeg4}/preparations`, u)).json() as Preparation[])[0]?.etat === 'prete', 90_000, 300);
    const prep = ((await get(t.app, `/api/films/${mpeg4}/preparations`, u)).json() as Preparation[])[0]!;
    assert.equal(prep.progression, 1);
    assert.ok((prep.taille ?? 0) > 1000);
    const admin1 = (await get(t.app, '/api/admin/lecture', admin)).json();
    assert.equal(admin1.preparations.length, 1);

    const plan = JSON.parse((await corps(`/api/films/${mpeg4}/lecture`)).toString()) as PlanDeLecture;
    assert.equal(plan.mode, 'direct');
    assert.match(plan.url, /\/prepare\/1\.mp4$/);
    assert.equal(plan.preparation?.etat, 'prete');
    const fichier = path.join(t.config.films, mpeg4, 'preparations', '1.mp4');
    const info = ffprobeSync(fichier);
    assert.deepEqual(info.streams.map((s: { codec_name: string }) => s.codec_name).sort(), ['aac', 'h264']);
    const debut = readFileSync(fichier).subarray(0, 4096);
    assert.ok(debut.indexOf('moov') > 0 && debut.indexOf('moov') < debut.indexOf('mdat') || debut.indexOf('mdat') < 0, 'moov avant mdat (+faststart)');
    const part = await requete(t.app, 'GET', plan.url, { utilisateur: u, entetes: { range: 'bytes=0-99' } });
    assert.equal(part.statusCode, 206);
    assert.equal(part.rawPayload.length, 100);
    assert.equal((await supprimer(t.app, `/api/films/${mpeg4}/preparations/1`, u)).statusCode, 204);
    assert.equal(existsSync(fichier), false);
    assert.equal(((await corps(`/api/films/${mpeg4}/lecture`)).toString().includes('"mode":"hls"')), true);
  });

  test('film supprimé : conversions arrêtées, cache effacé', async () => {
    const p = JSON.parse((await corps(`/api/films/${h264}/lecture`)).toString()) as PlanDeLecture;
    await corps(p.url.replace('index.m3u8', '2.m4s'));
    assert.ok(existsSync(path.join(t.config.cache, h264)));
    faux.declencherSupprime(h264);
    await attendreQue(() => !existsSync(path.join(t.config.cache, h264)), 10_000);
    assert.equal(t.app.lecture.conversions.lister().some((c) => c.filmId === h264), false);
  });
});

describe('lecture : préparation automatique et arrêt du serveur', () => {
  let dossier: string;
  let t: AppTest;
  let faux: FauxMediatheque;
  let u: UtilisateurTest;

  before(async () => {
    dossier = dossierMedias();
    fabriquerMkvMpeg4(path.join(dossier, 'm.mkv'), 20);
    fabriquerMp4(path.join(dossier, 'd.mp4'), 3);
    faux = fauxMediatheque();
    t = await creerAppTest({ env: { CANAPE_TRANSCODAGE_FILS: '2', CANAPE_PREPARATION_AUTO: '1' }, avantPret: (app) => installerFaux(app, faux) });
    u = await creerUtilisateur(t);
  });
  after(async () => {
    await t.fermer().catch(() => undefined);
    nettoyer(dossier);
  });

  test('un film prêt qui ne se lit pas directement est mis en file ; un film direct, non ; reprise après redémarrage', async () => {
    const m = creerFilmDeTest(t, faux, u.id, path.join(dossier, 'm.mkv')).id;
    const d = creerFilmDeTest(t, faux, u.id, path.join(dossier, 'd.mp4')).id;
    faux.declencherPret(d);
    faux.declencherPret(m);
    assert.equal(t.app.lecture.preparations.ligne(d, 1), null);
    assert.ok(t.app.lecture.preparations.ligne(m, 1));
    // Redémarrage : une préparation « en cours » repart de la file.
    await t.app.lecture.preparations.retirer(m, 1);
    t.db.prepare("INSERT INTO preparations (film_id, piste_audio, etat, progression, cree_le) VALUES (?, 1, 'encours', 0.5, '2026-01-01T00:00:00Z')").run(m);
    t.app.lecture.preparations.demarrer();
    const l = t.app.lecture.preparations.ligne(m, 1)!;
    assert.ok(['attente', 'encours'].includes(l.etat));
    assert.ok(l.progression < 0.5);
  });

  test('arrêt du serveur : plus aucun ffmpeg', async () => {
    const m = [...faux.films.values()].find((f) => f.fichier.endsWith('.mkv'))!;
    const r1 = get(t.app, `/media/${m.id}/hls/1/1.m4s`, u);
    await attendreQue(() => t.app.lecture.conversions.actives() > 0 || t.app.lecture.preparations.lignes().some((p) => p.etat === 'encours'), 10_000);
    await r1.catch(() => undefined);
    await t.fermer();
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(pgrep('ffmpeg.*canape-test-'), [], 'aucun ffmpeg orphelin');
  });
});
