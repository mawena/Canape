import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aUnCasque, BaisseFilm, contraintesMicro, estCasque, FACTEUR_BAISSE, niveauRms, SEUIL_VOIX, Voix, volumeFilm } from './son.ts';

function proche(a: number, b: number): void {
  assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
}

test('niveau RMS : silence = 0, signal plein ≈ 1', () => {
  assert.equal(niveauRms(new Uint8Array(100).fill(128)), 0);
  assert.ok(niveauRms(new Uint8Array(100).fill(255)) > 0.99);
});

test('voix : il faut 200 ms au-dessus de −45 dBFS, puis 600 ms de maintien', () => {
  const v = new Voix();
  const fort = SEUIL_VOIX * 3;
  assert.equal(v.mettreAJour(fort, 0), false);
  assert.equal(v.mettreAJour(fort, 100), false);
  assert.equal(v.mettreAJour(fort, 200), true);
  assert.equal(v.mettreAJour(0, 500), true);
  assert.equal(v.mettreAJour(0, 799), true);
  assert.equal(v.mettreAJour(0, 800), false);
});

test('un son bref ne déclenche pas la voix', () => {
  const v = new Voix();
  v.mettreAJour(SEUIL_VOIX * 3, 0);
  assert.equal(v.mettreAJour(0, 100), false);
  assert.equal(v.mettreAJour(SEUIL_VOIX * 3, 150), false);
});

test('baisse du film : 35 % en 150 ms, remontée en 400 ms, désactivable', () => {
  const b = new BaisseFilm();
  b.mettreAJour(false, true, 0);
  proche(b.mettreAJour(true, true, 75), 1 - (1 - FACTEUR_BAISSE) / 2);
  proche(b.mettreAJour(true, true, 150), FACTEUR_BAISSE);
  proche(b.mettreAJour(true, true, 1000), FACTEUR_BAISSE);
  const milieu = b.mettreAJour(false, true, 1200);
  assert.ok(milieu > FACTEUR_BAISSE && milieu < 1);
  proche(b.mettreAJour(false, true, 1700), 1);
  b.mettreAJour(true, true, 1800);
  assert.equal(b.mettreAJour(true, false, 2800), 1);
});

test('volume du film borné', () => {
  proche(volumeFilm(0.8, 0.35), 0.28);
  assert.equal(volumeFilm(2, 1), 1);
});

test('casque : indice par l’étiquette ; contraintes du micro', () => {
  assert.equal(estCasque('AirPods de Léa'), true);
  assert.equal(estCasque('Casque Bluetooth'), true);
  assert.equal(estCasque('Haut-parleurs intégrés'), false);
  assert.equal(aUnCasque([{ label: 'Speakers' }, { label: 'Headphones' }]), true);
  assert.deepEqual(contraintesMicro(false).echoCancellation, { ideal: 'all' });
  assert.equal(contraintesMicro(false).autoGainControl, true);
  const c = contraintesMicro(true, 'abc');
  assert.equal(c.echoCancellation, false);
  assert.equal(c.autoGainControl, false);
  assert.equal(c.noiseSuppression, true);
  assert.deepEqual(c.deviceId, { exact: 'abc' });
});
