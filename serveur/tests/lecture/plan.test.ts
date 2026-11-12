import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Analyse, PisteVideoAnalysee } from '@canape/partage';
import { argsHls, argsPreparation, dimensionsCible, filtreVideo, PRESETS, X264_HLS } from '../../src/modules/lecture/commandes.ts';
import { debutsSegmentsCopie, dureesDepuisDebuts, dureesFixes, listeDeLecture } from '../../src/modules/lecture/images-cles.ts';
import { libelleAudio, libelleSousTitres, nomLangue } from '../../src/modules/lecture/libelles.ts';
import { analyserPlage } from '../../src/modules/lecture/media.ts';
import { retirerListesEdition } from '../../src/modules/lecture/mp4.ts';
import { choisirPiste, decider } from '../../src/modules/lecture/plan.ts';

const video = (o: Partial<PisteVideoAnalysee> = {}): PisteVideoAnalysee => ({
  index: 0, codec: 'h264', profil: 'High', largeur: 1920, hauteur: 1080, profondeurBits: 8, pixFmt: 'yuv420p', hdr: false,
  hdrType: 'non', dvProfil: null, fps: 24, debit: null, ...o,
});
const analyse = (o: Partial<Analyse> = {}): Analyse => ({
  conteneur: 'mov,mp4,m4a,3gp,3g2,mj2', duree: 100, debit: null, video: video(),
  audio: [{ index: 1, codec: 'aac', langue: 'fra', titre: null, canaux: 2, debit: null, parDefaut: true }], sousTitres: [], ...o,
});

describe('lecture : choix du mode', () => {
  test('MP4 H.264 + AAC, première piste : direct', () => {
    const a = analyse();
    assert.deepEqual(decider(a, 'original.mp4', a.audio[0]!), { mode: 'direct', raison: 'Lu directement' });
  });

  test('WebM VP9 + Opus : direct ; MP4 avec Vorbis : son converti', () => {
    const w = analyse({ conteneur: 'matroska,webm', video: video({ codec: 'vp9' }), audio: [{ index: 1, codec: 'opus', langue: null, titre: null, canaux: 2, debit: null, parDefaut: true }] });
    assert.equal(decider(w, 'original.webm', w.audio[0]!).mode, 'direct');
    const m = analyse({ audio: [{ index: 1, codec: 'vorbis', langue: null, titre: null, canaux: 2, debit: null, parDefaut: true }] });
    assert.equal(decider(m, 'original.mp4', m.audio[0]!).mode, 'copie');
  });

  test('MKV H.264 8 bits : son seul converti (copie)', () => {
    const a = analyse({ conteneur: 'matroska,webm', audio: [{ index: 1, codec: 'ac3', langue: 'fra', titre: null, canaux: 6, debit: null, parDefaut: true }] });
    const d = decider(a, 'original.mkv', a.audio[0]!);
    assert.equal(d.mode, 'copie');
    assert.equal(d.raison, 'Son converti pour ton navigateur');
  });

  test('autre piste que la première : pas direct', () => {
    const a = analyse({
      audio: [
        { index: 1, codec: 'aac', langue: 'fra', titre: null, canaux: 2, debit: null, parDefaut: true },
        { index: 2, codec: 'aac', langue: 'eng', titre: null, canaux: 2, debit: null, parDefaut: false },
      ],
    });
    assert.equal(decider(a, 'original.mp4', a.audio[0]!).mode, 'direct');
    assert.equal(decider(a, 'original.mp4', a.audio[1]!).mode, 'copie');
  });

  test('HEVC 10 bits HDR : image convertie, raison en français', () => {
    const a = analyse({ conteneur: 'matroska,webm', video: video({ codec: 'hevc', profondeurBits: 10, pixFmt: 'yuv420p10le', hdr: true, hdrType: 'hdr10' }) });
    const d = decider(a, 'original.mkv', a.audio[0]!);
    assert.equal(d.mode, 'conversion');
    assert.equal(d.raison, 'Image convertie pendant la lecture (HEVC 10 bits, HDR)');
  });

  test('4K H.264, MPEG-4, Dolby Vision profil 5', () => {
    const k = analyse({ video: video({ largeur: 3840, hauteur: 2160 }) });
    assert.match(decider(k, 'a.mp4', k.audio[0]!).raison, /\(4K\)/);
    const m = analyse({ conteneur: 'matroska,webm', video: video({ codec: 'mpeg4' }) });
    assert.match(decider(m, 'a.mkv', m.audio[0]!).raison, /\(MPEG-4\)/);
    const dv = analyse({ video: video({ codec: 'hevc', profondeurBits: 10, hdr: true, hdrType: 'dolby-vision', dvProfil: 5 }) });
    assert.match(decider(dv, 'a.mkv', dv.audio[0]!).raison, /Dolby Vision profil 5/);
  });

  test('film sans piste audio', () => {
    const a = analyse({ audio: [] });
    assert.equal(choisirPiste(a, null), null);
    assert.equal(decider(a, 'a.mp4', null).mode, 'direct');
  });

  test('choisirPiste : défaut, demandée, inconnue', () => {
    const a = analyse({
      audio: [
        { index: 1, codec: 'aac', langue: 'eng', titre: null, canaux: 2, debit: null, parDefaut: false },
        { index: 2, codec: 'aac', langue: 'fra', titre: null, canaux: 2, debit: null, parDefaut: true },
      ],
    });
    assert.equal(choisirPiste(a, null)?.index, 2);
    assert.equal(choisirPiste(a, 1)?.index, 1);
    assert.equal(choisirPiste(a, 9), undefined);
  });
});

describe('lecture : libellés', () => {
  test('langues en français', () => {
    assert.equal(nomLangue('fra'), 'Français');
    assert.equal(nomLangue('fre'), 'Français');
    assert.equal(nomLangue('eng'), 'Anglais');
    assert.equal(nomLangue(null), null);
  });
  test('pistes', () => {
    assert.equal(libelleAudio({ index: 1, codec: 'eac3', langue: 'fra', titre: null, canaux: 6, debit: null, parDefaut: true }), 'Français · 5.1');
    assert.equal(libelleSousTitres('eng', true, false), 'Anglais (forcés)');
    assert.equal(libelleSousTitres('fra', false, true), 'Français (SDH)');
    assert.equal(libelleSousTitres(null, false, false), 'Langue inconnue');
  });
});

describe('lecture : segments et liste', () => {
  test('découpage sur les images clés (règle vérifiée sur ffmpeg 6.1)', () => {
    const cles = [0, 2.52, 5, 9, 12.2, 15, 21, 26, 31.52, 33, 40, 44, 50, 55];
    const debuts = debutsSegmentsCopie(cles);
    assert.deepEqual(debuts, [0, 9, 12.2, 21, 26, 31.52, 40, 44, 50, 55]);
    assert.deepEqual(dureesDepuisDebuts(debuts, 60), [9, 3.2, 8.8, 5, 5.52, 8.48, 4, 6, 5, 5]);
  });
  test('GOP de 10 s : un segment par image clé', () => {
    assert.deepEqual(debutsSegmentsCopie([0, 10, 20, 30]), [0, 10, 20, 30]);
  });
  test('segments fixes', () => {
    assert.deepEqual(dureesFixes(14), [6, 6, 2]);
    assert.deepEqual(dureesFixes(12), [6, 6]);
    assert.deepEqual(dureesFixes(0.5), [0.5]);
  });
  test('liste de lecture VOD complète', () => {
    const l = listeDeLecture([6, 6, 2.5]);
    assert.match(l, /^#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:6\n/);
    assert.match(l, /#EXT-X-PLAYLIST-TYPE:VOD/);
    assert.match(l, /#EXT-X-MAP:URI="init.mp4"/);
    assert.match(l, /#EXTINF:2.500,\n2.m4s\n#EXT-X-ENDLIST\n$/);
    assert.equal(listeDeLecture([9, 3]).includes('TARGETDURATION:9'), true);
  });
});

describe('lecture : commandes ffmpeg', () => {
  test('dimensions : 4K réduite à 1080p, paires', () => {
    assert.deepEqual(dimensionsCible(3840, 2160), { largeur: 1920, hauteur: 1080, reduit: true });
    assert.deepEqual(dimensionsCible(3840, 1600), { largeur: 1920, hauteur: 800, reduit: true });
    assert.equal(dimensionsCible(1280, 720).reduit, false);
  });
  test('HDR : réduction avant le calcul, puis tonemap mobius', () => {
    const f = filtreVideo(video({ largeur: 3840, hauteur: 2160, hdr: true, hdrType: 'hdr10', profondeurBits: 10, codec: 'hevc' }));
    assert.ok(f.indexOf('w=1920') < f.indexOf('tonemap'));
    assert.match(f, /tonemap=tonemap=mobius/);
    assert.match(f, /format=yuv420p$/);
    assert.match(filtreVideo(video({ hdr: true, hdrType: 'hlg' })), /tin=arib-std-b67/);
  });
  test('SDR 10 bits : conversion simple', () => {
    assert.equal(filtreVideo(video({ profondeurBits: 10, pixFmt: 'yuv420p10le' })), 'format=yuv420p');
  });
  const base = { entree: '/f.mkv', videoIndex: 0, audioIndex: 1, video: video(), preset: 'veryfast' as const, fils: 4, dossier: '/c', sequence: 3 };
  test('conversion à la volée au segment 5', () => {
    const a = argsHls({ ...base, mode: 'conversion', debut: 5 });
    const s = a.join(' ');
    assert.match(s, /-ss 30 -i \/f\.mkv/);
    assert.match(s, /-output_ts_offset 30/);
    assert.match(s, /-start_number 5/);
    assert.match(s, /-force_key_frames expr:gte\(t,n_forced\*6\)/);
    assert.match(s, /-hls_segment_type fmp4/);
    assert.ok(a.includes(X264_HLS));
    assert.match(s, /-c:a aac -b:a 160k -ac 2/);
  });
  test('son seul converti : copie vidéo, toujours depuis le début', () => {
    const s = argsHls({ ...base, mode: 'copie', debut: 0 }).join(' ');
    assert.match(s, /-c:v copy/);
    assert.ok(!s.includes('-ss'));
  });
  test('préréglages : tous les trois acceptés', () => {
    assert.deepEqual([...PRESETS], ['superfast', 'veryfast', 'faster']);
  });
  test('préparation : crf 20, faststart ; copie vidéo si possible', () => {
    const o = { entree: '/f.mkv', sortie: '/o.mp4', videoIndex: 0, audioIndex: 1, video: video(), fils: 2 };
    assert.match(argsPreparation({ ...o, copieVideo: false }).join(' '), /-crf 20.*-movflags \+faststart/);
    assert.match(argsPreparation({ ...o, copieVideo: true }).join(' '), /-c:v copy/);
  });
});

describe('lecture : Range et MP4', () => {
  test('plages', () => {
    assert.deepEqual(analyserPlage('bytes=0-99', 1000), { debut: 0, fin: 99 });
    assert.deepEqual(analyserPlage('bytes=900-', 1000), { debut: 900, fin: 999 });
    assert.deepEqual(analyserPlage('bytes=-100', 1000), { debut: 900, fin: 999 });
    assert.deepEqual(analyserPlage('bytes=500-5000', 1000), { debut: 500, fin: 999 });
    assert.equal(analyserPlage('bytes=1000-', 1000), 'invalide');
    assert.equal(analyserPlage(undefined, 1000), null);
    assert.equal(analyserPlage('bytes=0-1,5-6', 1000), null);
  });
  test('retirerListesEdition retire edts et corrige les tailles', () => {
    const boite = (type: string, ...enfants: Buffer[]) => {
      const c = Buffer.concat(enfants);
      const h = Buffer.alloc(8);
      h.writeUInt32BE(8 + c.length, 0);
      h.write(type, 4, 'latin1');
      return Buffer.concat([h, c]);
    };
    const feuille = (t: string) => boite(t, Buffer.from('xyz'));
    const init = Buffer.concat([feuille('ftyp'), boite('moov', feuille('mvhd'), boite('trak', feuille('tkhd'), boite('edts', feuille('elst')), feuille('mdia')))]);
    const sortie = retirerListesEdition(init);
    assert.equal(sortie.includes(Buffer.from('edts')), false);
    assert.equal(sortie.includes(Buffer.from('elst')), false);
    assert.equal(sortie.length, init.length - boite('edts', feuille('elst')).length);
    assert.equal(sortie.readUInt32BE(sortie.indexOf(Buffer.from('moov')) - 4), sortie.length - feuille('ftyp').length);
  });
});
