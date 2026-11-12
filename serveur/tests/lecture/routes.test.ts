import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Analyse, PlanDeLecture } from '@canape/partage';
import { creerAppTest, creerUtilisateur, get, requete, supprimer, post, type AppTest, type UtilisateurTest } from '../aides.ts';
import { creerFilmDeTest, fauxMediatheque, installerFaux, type FauxMediatheque } from './aides-lecture.ts';

const audio = (index: number, codec: string, langue: string | null, parDefaut = false) =>
  ({ index, codec, langue, titre: null, canaux: 6, debit: null, parDefaut });
const video = { index: 0, codec: 'hevc', profil: 'Main 10', largeur: 1920, hauteur: 1080, profondeurBits: 10, pixFmt: 'yuv420p10le', hdr: true, hdrType: 'hdr10' as const, dvProfil: null, fps: 24, debit: null };
const analyseHevc: Analyse = {
  conteneur: 'matroska,webm', duree: 14, debit: null, video,
  audio: [audio(1, 'eac3', 'fra', true), audio(2, 'eac3', 'eng')],
  sousTitres: [
    { index: 3, codec: 'subrip', langue: 'fra', titre: null, texte: true, force: false, sdh: false, parDefaut: false },
    { index: 4, codec: 'subrip', langue: 'eng', titre: 'SDH', texte: true, force: false, sdh: true, parDefaut: false },
    { index: 5, codec: 'hdmv_pgs_subtitle', langue: 'fra', titre: null, texte: false, force: true, sdh: false, parDefaut: false },
  ],
};
const analyseMp4: Analyse = {
  conteneur: 'mov,mp4,m4a,3gp,3g2,mj2', duree: 5, debit: null, video: { ...video, codec: 'h264', profondeurBits: 8, pixFmt: 'yuv420p', hdr: false, hdrType: 'non' },
  audio: [audio(1, 'aac', 'fra', true)], sousTitres: [],
};

describe('lecture : routes (sans ffmpeg)', () => {
  let t: AppTest;
  let faux: FauxMediatheque;
  let proprio: UtilisateurTest, autre: UtilisateurTest, admin: UtilisateurTest;
  let hevc: string, direct: string, tous: string, enAnalyse: string;
  const contenu = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

  before(async () => {
    faux = fauxMediatheque();
    t = await creerAppTest({ avantPret: (app) => installerFaux(app, faux) });
    proprio = await creerUtilisateur(t, { prenom: 'Awa' });
    autre = await creerUtilisateur(t, { prenom: 'Léa' });
    admin = await creerUtilisateur(t, { role: 'admin' });
    hevc = creerFilmDeTest(t, faux, proprio.id, 'x.mkv', { analyse: analyseHevc, contenu }).id;
    direct = creerFilmDeTest(t, faux, proprio.id, 'x.mp4', { analyse: analyseMp4, contenu }).id;
    tous = creerFilmDeTest(t, faux, proprio.id, 'x.mp4', { analyse: analyseMp4, contenu, visibilite: 'tous' }).id;
    enAnalyse = creerFilmDeTest(t, faux, proprio.id, 'x.mkv', { analyse: analyseHevc, contenu, etat: 'analyse' }).id;
    t.db.prepare("INSERT INTO sous_titres_externes (film_id, langue, libelle, fichier) VALUES (?, 'fra', 'Français (fichier)', ?)").run(hevc, `${hevc}/sous-titres/fr.vtt`);
  });
  after(() => t.fermer());

  test('sans session : 401 ; sans droit : 404 ; film inconnu : 404', async () => {
    assert.equal((await get(t.app, `/api/films/${hevc}/lecture`)).statusCode, 401);
    assert.equal((await get(t.app, `/media/${hevc}/original`)).statusCode, 404);
    assert.equal((await get(t.app, `/api/films/${hevc}/lecture`, autre)).statusCode, 404);
    assert.equal((await get(t.app, '/api/films/inconnu/lecture', proprio)).statusCode, 404);
    assert.equal((await get(t.app, `/media/${hevc}/original`, autre)).statusCode, 404);
    assert.equal((await get(t.app, `/media/${hevc}/hls/1/index.m3u8`, autre)).statusCode, 404);
    assert.equal((await get(t.app, `/media/${hevc}/sous-titres/p3.vtt`, autre)).statusCode, 404);
    assert.equal((await get(t.app, `/api/films/${hevc}/preparations`, autre)).statusCode, 404);
    assert.equal((await get(t.app, `/media/${tous}/original`, autre)).statusCode, 200);
  });

  test('film pas prêt : 409', async () => {
    assert.equal((await get(t.app, `/api/films/${enAnalyse}/lecture`, proprio)).statusCode, 409);
  });

  test('plan : image convertie (HLS), pistes, sous-titres, pistes image signalées', async () => {
    const r = await get(t.app, `/api/films/${hevc}/lecture`, proprio);
    assert.equal(r.statusCode, 200);
    const p = r.json() as PlanDeLecture;
    assert.equal(p.mode, 'hls');
    assert.equal(p.url, `/media/${hevc}/hls/1/index.m3u8`);
    assert.equal(p.duree, 14);
    assert.equal(p.raison, 'Image convertie pendant la lecture (HEVC 10 bits, HDR)');
    assert.deepEqual(p.pistesAudio.map((a) => [a.index, a.libelle, a.parDefaut]), [[1, 'Français · 5.1', true], [2, 'Anglais · 5.1', false]]);
    assert.deepEqual(p.sousTitres.map((s) => [s.cle, s.libelle, s.sdh]), [['p3', 'Français', false], ['p4', 'Anglais (SDH)', true], ['e1', 'Français (fichier)', false]]);
    assert.equal(p.sousTitres[0]!.url, `/media/${hevc}/sous-titres/p3.vtt`);
    assert.deepEqual(p.sousTitresImage, [{ langue: 'fra', libelle: 'Français (forcés)' }]);
    assert.equal(p.preparation, null);
  });

  test('plan : piste choisie, piste inconnue, valeur négative = défaut', async () => {
    const p2 = (await get(t.app, `/api/films/${hevc}/lecture?audio=2`, proprio)).json() as PlanDeLecture;
    assert.equal(p2.url, `/media/${hevc}/hls/2/index.m3u8`);
    assert.equal((await get(t.app, `/api/films/${hevc}/lecture?audio=9`, proprio)).statusCode, 400);
    assert.equal((await get(t.app, `/api/films/${hevc}/lecture?audio=abc`, proprio)).statusCode, 400);
    const pd = (await get(t.app, `/api/films/${hevc}/lecture?audio=-1`, proprio)).json() as PlanDeLecture;
    assert.equal(pd.url, `/media/${hevc}/hls/1/index.m3u8`);
  });

  test('plan : MP4 lu directement ; l\'admin voit tout', async () => {
    const p = (await get(t.app, `/api/films/${direct}/lecture`, admin)).json() as PlanDeLecture;
    assert.equal(p.mode, 'direct');
    assert.equal(p.url, `/media/${direct}/original`);
    assert.equal(p.raison, 'Lu directement');
  });

  test('fichier direct : Range, 206, 416, HEAD, en-têtes privés', async () => {
    const complet = await get(t.app, `/media/${direct}/original`, proprio);
    assert.equal(complet.statusCode, 200);
    assert.equal(complet.headers['accept-ranges'], 'bytes');
    assert.match(String(complet.headers['cache-control']), /private/);
    assert.equal(complet.headers['content-type'], 'video/mp4');
    assert.equal(complet.rawPayload.length, 1000);
    const r = await requete(t.app, 'GET', `/media/${direct}/original`, { utilisateur: proprio, entetes: { range: 'bytes=10-19' } });
    assert.equal(r.statusCode, 206);
    assert.equal(r.headers['content-range'], 'bytes 10-19/1000');
    assert.deepEqual([...r.rawPayload], [...contenu.subarray(10, 20)]);
    const fin = await requete(t.app, 'GET', `/media/${direct}/original`, { utilisateur: proprio, entetes: { range: 'bytes=-5' } });
    assert.equal(fin.headers['content-range'], 'bytes 995-999/1000');
    const hors = await requete(t.app, 'GET', `/media/${direct}/original`, { utilisateur: proprio, entetes: { range: 'bytes=5000-' } });
    assert.equal(hors.statusCode, 416);
    assert.equal(hors.headers['content-range'], 'bytes */1000');
    const tete = await t.app.inject({ method: 'HEAD', url: `/media/${direct}/original`, headers: proprio.entetes });
    assert.equal(tete.statusCode, 200);
  });

  test('liste HLS complète et connue d\'avance', async () => {
    const r = await get(t.app, `/media/${hevc}/hls/1/index.m3u8`, proprio);
    assert.equal(r.statusCode, 200);
    assert.match(String(r.headers['content-type']), /mpegurl/);
    const l = r.body;
    assert.match(l, /#EXT-X-PLAYLIST-TYPE:VOD/);
    assert.match(l, /#EXT-X-ENDLIST/);
    assert.equal((l.match(/#EXTINF/g) ?? []).length, 3);
    assert.match(l, /#EXTINF:2.000,\n2.m4s/);
    assert.equal((await get(t.app, `/media/${hevc}/hls/7/index.m3u8`, proprio)).statusCode, 404);
    assert.equal((await get(t.app, `/media/${direct}/hls/1/index.m3u8`, proprio)).statusCode, 404);
    assert.equal((await get(t.app, `/media/${hevc}/hls/1/3.m4s`, proprio)).statusCode, 404);
    assert.equal((await get(t.app, `/media/${hevc}/hls/1/abc`, proprio)).statusCode, 404);
  });

  test('préparations : droits, film lu directement refusé', async () => {
    assert.equal((await post(t.app, `/api/films/${hevc}/preparations`, {}, autre)).statusCode, 404);
    assert.equal((await post(t.app, `/api/films/${direct}/preparations`, {}, proprio)).statusCode, 409);
    assert.equal((await post(t.app, `/api/films/${hevc}/preparations`, { pisteAudio: 9 }, proprio)).statusCode, 400);
    assert.equal((await supprimer(t.app, `/api/films/${hevc}/preparations/1`, proprio)).statusCode, 404);
    assert.deepEqual((await get(t.app, `/api/films/${hevc}/preparations`, proprio)).json(), []);
  });

  test('administration : réservée aux admins', async () => {
    assert.equal((await get(t.app, '/api/admin/lecture', proprio)).statusCode, 403);
    const r = await get(t.app, '/api/admin/lecture', admin);
    assert.equal(r.statusCode, 200);
    const j = r.json();
    assert.deepEqual(j.conversionsALaVolee, []);
    assert.ok(j.charge.coeurs >= 1);
    assert.equal(typeof j.cache.max, 'number');
  });
});
