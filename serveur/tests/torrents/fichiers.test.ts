import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decrire, appliquerChoix, associerSousTitres, analyserMagnet, choixParDefaut, estEchantillon } from '../../src/modules/mediatheque/torrents/fichiers.ts';
import { ErreurHttp } from '../../src/commun/erreurs.ts';

const HEX = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a';

test('lien magnet : hex de 40 caractères et base32 de 32 acceptés', () => {
  const a = analyserMagnet(`magnet:?xt=urn:btih:${HEX.toUpperCase()}&dn=Mon+Film%202020&tr=udp%3A%2F%2Ftracker.exemple%3A1337`);
  assert.equal(a.infoHash, HEX);
  assert.equal(a.nom, 'Mon Film 2020');
  assert.match(a.magnet, /^magnet:\?xt=urn%3Abtih%3Ac12fe1c0/);
  assert.match(a.magnet, /tr=udp%3A%2F%2Ftracker\.exemple%3A1337/);
  // « 77 » en base32 de 32 caractères : 20 octets 0x00 → 'a' * 32
  const b = analyserMagnet(`magnet:?xt=urn:btih:${'a'.repeat(32)}`);
  assert.equal(b.infoHash, '00'.repeat(20));
  // base32 de l'empreinte hex ci-dessus
  const b32 = Buffer.from(HEX, 'hex').reduce((acc, o) => acc + o.toString(2).padStart(8, '0'), '').match(/.{5}/g)!
    .map((c) => 'abcdefghijklmnopqrstuvwxyz234567'[parseInt(c, 2)]).join('');
  assert.equal(b32.length, 32);
  assert.equal(analyserMagnet(`magnet:?xt=urn:btih:${b32.toUpperCase()}`).infoHash, HEX);
});

test('lien magnet : refus des liens invalides et des paramètres qui font appeler une adresse', () => {
  for (const mauvais of [undefined, null, 42, '', 'http://exemple.fr', 'magnet:?dn=sans-empreinte', 'magnet:?xt=urn:btih:1234',
    `magnet:?xt=urn:btih:${'g'.repeat(40)}`, `magnet:?xt=urn:sha1:${HEX}`, `magnet:?xt=urn:btih:${HEX}${'x'.repeat(5000)}`]) {
    assert.throws(() => analyserMagnet(mauvais), (e) => e instanceof ErreurHttp && e.statut === 400, String(mauvais));
  }
  const m = analyserMagnet(`magnet:?xt=urn:btih:${HEX}&xs=http%3A%2F%2F127.0.0.1%2Fx.torrent&ws=http%3A%2F%2F10.0.0.1%2F&as=http%3A%2F%2Fa&tr=ws%3A%2F%2Ft&x.pe=127.0.0.1%3A6881&x.pe=pas-une-adresse`);
  assert.doesNotMatch(m.magnet, /xs=|ws=|as=|tr=/);
  assert.match(m.magnet, /x\.pe=127\.0\.0\.1%3A6881/);
  assert.doesNotMatch(m.magnet, /pas-une-adresse/);
});

const f = (index: number, chemin: string, taille: number) => ({ index, chemin, taille });

test('choix par défaut : la plus grosse vidéo et les sous-titres de son dossier, jamais un échantillon', () => {
  const fichiers = decrire([
    f(0, 'Film/Film.mkv', 5000), f(1, 'Film/Film.fr.srt', 10), f(2, 'Film/Film.en.vtt', 10), f(3, 'Film/sample.mkv', 9000),
    f(4, 'Film/Sample/film-sample.mkv', 9999), f(5, 'Film/info.nfo', 1), f(6, 'Autre/Autre.srt', 10), f(7, 'Film/Subs/fr.srt', 10), f(8, 'Film/Extras/bonus.mkv', 4000),
  ]);
  assert.deepEqual(choixParDefaut(fichiers), [0, 1, 2, 7]);
  const choisis = appliquerChoix(fichiers, [0, 1]);
  assert.deepEqual(choisis.filter((x) => x.choisi).map((x) => x.index), [0, 1]);
  assert.equal(choisis[0]?.video, true);
  assert.equal(choisis[1]?.sousTitres, true);
  assert.equal(choisis[5]?.video, false);
});

test('choix par défaut : sans vidéo, ou seulement des échantillons, rien n\'est choisi', () => {
  assert.deepEqual(choixParDefaut(decrire([f(0, 'a.nfo', 3), f(1, 'a.srt', 3)])), []);
  assert.deepEqual(choixParDefaut(decrire([f(0, 'Film/sample.mkv', 3), f(1, 'Film/Film.Sample.mp4', 9)])), []);
  assert.deepEqual(choixParDefaut(decrire([f(0, 'Resample.mkv', 3)])), [0]);
});

test('échantillons reconnus', () => {
  for (const c of ['sample.mkv', 'Film/Sample/x.mkv', 'Film/film-sample.mkv', 'Film/Film.SAMPLE.mp4', 'Film/(sample).mkv']) assert.equal(estEchantillon(c), true, c);
  for (const c of ['Film/Film.mkv', 'Film/Resampled.mkv', 'Samples of Love.mkv'.replace('Samples', 'Examples')]) assert.equal(estEchantillon(c), false, c);
});

test('sous-titres associés au film de leur dossier, ou au film dont ils portent le nom', () => {
  const t = decrire([f(0, 'A/A.mkv', 1), f(1, 'A/A.fr.srt', 1), f(2, 'B/B1.mkv', 1), f(3, 'B/B2.mkv', 1), f(4, 'B/B2.fr.srt', 1), f(5, 'B/autre.srt', 1)]);
  const r = associerSousTitres(t.filter((x) => x.video), t.filter((x) => x.sousTitres));
  assert.deepEqual(r.get(0)?.map((s) => s.index), [1]);
  assert.deepEqual(r.get(2)?.map((s) => s.index), []);
  assert.deepEqual(r.get(3)?.map((s) => s.index), [4]);
});
