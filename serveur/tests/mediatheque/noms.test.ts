import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { analyserNomFichier } from '../../src/modules/mediatheque/noms.ts';

const cas: Array<[string, string, number | null]> = [
  ['Tell.Me.What.You.Want.2024.MULTi.1080p.NF.WEB.H265-BYOR.mkv', 'Tell Me What You Want', 2024],
  ['The.Odyssey.2026.MULTI.VFQ.2160p.BluRay.4KLight.DV.HDR10+.DDP.5.1.x265-SpK79.mkv', 'The Odyssey', 2026],
  ['2001 A Space Odyssey 1968.mkv', '2001 A Space Odyssey', 1968],
  ['2001.A.Space.Odyssey.1968.1080p.BluRay.x264.mkv', '2001 A Space Odyssey', 1968],
  ['Mon Film (2019).mp4', 'Mon Film', 2019],
  ['Mon Film - 2019 - 1080p.mp4', 'Mon Film', 2019],
  ['Le Voyage de Chihiro.mp4', 'Le Voyage de Chihiro', null],
  ['Blade.Runner.2049.2017.2160p.UHD.BluRay.x265.mkv', 'Blade Runner 2049', 2017],
  ['[Groupe] Un Titre 2020 720p.mkv', 'Un Titre', 2020],
];

describe('médiathèque : titre et année depuis le nom de fichier', () => {
  for (const [nom, titre, annee] of cas) {
    test(nom, () => assert.deepEqual(analyserNomFichier(nom), { titre, annee }));
  }
});
