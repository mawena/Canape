// Raccord entre deux lancements de ffmpeg : segments produits par des lancements différents, lus à la suite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { creerAppTest, creerUtilisateur, type AppTest, type UtilisateurTest } from '../aides.ts';
import { attendreQue, creerFilmDeTest, dossierMedias, fabriquerMkvMpeg4, fauxMediatheque, installerFaux, nettoyer, paquets } from './aides-lecture.ts';

describe('lecture : raccord entre deux lancements de ffmpeg', () => {
  let dossier: string;
  let t: AppTest;
  let u: UtilisateurTest;
  let filmId: string;

  before(async () => {
    dossier = dossierMedias();
    fabriquerMkvMpeg4(path.join(dossier, 'film.mkv'), 30);
    const faux = fauxMediatheque();
    t = await creerAppTest({ env: { CANAPE_TRANSCODAGE_FILS: '2', CANAPE_PREPARATION_AUTO: '0' }, avantPret: (app) => installerFaux(app, faux) });
    u = await creerUtilisateur(t);
    filmId = creerFilmDeTest(t, faux, u.id, path.join(dossier, 'film.mkv')).id;
  });
  after(async () => {
    await t.fermer();
    nettoyer(dossier);
  });

  const obtenir = async (url: string) => {
    const r = await t.app.inject({ method: 'GET', url, headers: u.entetes });
    assert.equal(r.statusCode, 200, `${url} → ${r.statusCode} ${r.body.slice(0, 200)}`);
    return r.rawPayload;
  };

  test('lancements successifs (segment 3 d\'abord, puis 0) : tout se raccorde, horodatages continus', async (tc) => {
    const base = `/media/${filmId}/hls/1`;
    const liste = (await obtenir(`${base}/index.m3u8`)).toString();
    const total = (liste.match(/#EXTINF/g) ?? []).length;
    assert.ok(total >= 5 && total <= 6);
    const init = await obtenir(`${base}/init.mp4`);
    assert.equal(init.includes(Buffer.from('edts')), false, "pas de liste d'édition dans init.mp4");
    // Premier lancement à la position 3 (reprise au milieu du film), puis retour en arrière : second lancement.
    const s3 = await obtenir(`${base}/3.m4s`);
    assert.ok(s3.length > 1000);
    await obtenir(`${base}/0.m4s`);
    for (const n of [1, 2, ...Array.from({ length: total - 4 }, (_, i) => i + 4)]) await obtenir(`${base}/${n}.m4s`);
    await attendreQue(() => t.app.lecture.conversions.actives() === 0, 20_000);

    const tout = path.join(dossier, 'tout.mp4');
    const morceaux = [init];
    for (let n = 0; n < total; n++) morceaux.push(readFileSync(path.join(t.config.cache, filmId, 'hls', '1', `${n}.m4s`)));
    writeFileSync(tout, Buffer.concat(morceaux));

    const { video, audio } = paquets(tout);
    const pts = video.map((p) => p.pts).sort((a, b) => a - b);
    const pas = pts.slice(1).map((v, i) => v - pts[i]!);
    tc.diagnostic(`vidéo : ${pts.length} images de ${pts[0]} à ${pts.at(-1)}, pas min ${Math.min(...pas).toFixed(4)} max ${Math.max(...pas).toFixed(4)}`);
    assert.ok(pts.length >= 749 && pts.length <= 752, `${pts.length} images`);
    assert.ok(Math.min(...pas) > 0.015 && Math.max(...pas) < 0.045, 'images à intervalle régulier : ni trou ni doublon aux raccords');
    assert.ok(pts[0]! < 0.05 && pts.at(-1)! > 29.9, 'la vidéo couvre tout le film');

    const a = audio.map((p) => ({ t: p.pts, d: p.duree })).sort((x, y) => x.t - y.t);
    let pire = 0;
    for (let i = 1; i < a.length; i++) {
      const ecart = a[i]!.t - (a[i - 1]!.t + a[i - 1]!.d);
      if (Math.abs(ecart) > Math.abs(pire)) pire = ecart;
    }
    tc.diagnostic(`audio : ${a.length} paquets, pire écart ${(pire * 1000).toFixed(1)} ms`);
    assert.ok(Math.abs(pire) < 0.05, `écart audio au raccord inférieur à 50 ms (mesuré ${(pire * 1000).toFixed(1)} ms)`);

    // Décodage de la suite concaténée : seule tolérance, un raccord où deux images partagent le même instant (moins d'une
    // image d'écart entre deux lancements) ; aucune erreur de décodage.
    const lecture = spawnSync('ffmpeg', ['-v', 'error', '-i', tout, '-f', 'null', '-'], { encoding: 'utf8' });
    assert.equal(lecture.status, 0);
    const erreurs = lecture.stderr.split('\n').filter((l) => l.trim() && !/non monotonically increasing dts/.test(l));
    assert.deepEqual(erreurs, [], 'la suite concaténée se décode sans erreur');
  });
});
