import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyserFichier, construireAnalyse } from '../../src/modules/mediatheque/analyse.ts';

const fixture = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

test('analyse d’un MP4 H.264 + AAC', async () => {
  const a = await analyserFichier(fixture('essai.mp4'));
  assert.match(a.conteneur, /mp4/);
  assert.ok(a.duree > 1.5 && a.duree < 3);
  assert.equal(a.video?.codec, 'h264');
  assert.equal(a.video?.largeur, 160);
  assert.equal(a.video?.hdrType, 'non');
  assert.equal(a.video?.profondeurBits, 8);
  assert.equal(a.audio.length, 1);
  assert.equal(a.audio[0]?.codec, 'aac');
  assert.equal(a.sousTitres.length, 0);
});

test('analyse d’un MKV HEVC, deux pistes audio, sous-titres SRT', async () => {
  const a = await analyserFichier(fixture('essai.mkv'));
  assert.match(a.conteneur, /matroska/);
  assert.equal(a.video?.codec, 'hevc');
  assert.equal(a.video?.profondeurBits, 10);
  assert.deepEqual(a.audio.map((p) => p.langue), ['fre', 'eng']);
  assert.equal(a.sousTitres.length, 1);
  assert.equal(a.sousTitres[0]?.texte, true);
  assert.equal(a.sousTitres[0]?.langue, 'fre');
});

test('HDR : PQ, HLG, Dolby Vision et pistes image', () => {
  const base = { codec_type: 'video', codec_name: 'hevc', width: 3840, height: 2160, pix_fmt: 'yuv420p10le' };
  const hdr10 = construireAnalyse({ format: { duration: '10' }, streams: [{ index: 0, ...base, color_transfer: 'smpte2084' }] });
  assert.equal(hdr10.video?.hdrType, 'hdr10');
  const hlg = construireAnalyse({ format: { duration: '10' }, streams: [{ index: 0, ...base, color_transfer: 'arib-std-b67' }] });
  assert.equal(hlg.video?.hdrType, 'hlg');
  const dv = construireAnalyse({
    format: { duration: '10' },
    streams: [
      { index: 0, ...base, color_transfer: 'smpte2084', side_data_list: [{ side_data_type: 'DOVI configuration record', dv_profile: 8 }] },
      { index: 1, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle', tags: { language: 'eng' } },
    ],
  });
  assert.equal(dv.video?.hdrType, 'dolby-vision');
  assert.equal(dv.video?.dvProfil, 8);
  assert.equal(dv.sousTitres[0]?.texte, false);
});

test('un fichier qui n’est pas une vidéo est refusé avec un message clair', async () => {
  await assert.rejects(analyserFichier(fixture('essai.srt')), /vidéo/);
});
