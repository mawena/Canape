import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bornerDecalage, decalerPiste, lireDecalage, retenirDecalage, texteDecalage, type PisteDecalable } from './decalage.ts';

function memoire(): Pick<Storage, 'getItem' | 'setItem'> & { donnees: Map<string, string> } {
  const donnees = new Map<string, string>();
  return { donnees, getItem: (k) => donnees.get(k) ?? null, setItem: (k, v) => void donnees.set(k, v) };
}

test('bornerDecalage arrondit au dixième et borne à ± 60 s', () => {
  assert.equal(bornerDecalage(1.26), 1.3);
  assert.equal(bornerDecalage(-0.04), 0);
  assert.equal(bornerDecalage(90), 60);
  assert.equal(bornerDecalage(-90), -60);
  assert.equal(bornerDecalage('2'), 0);
  assert.equal(bornerDecalage(Number.NaN), 0);
});

test('texteDecalage écrit le sens et la virgule', () => {
  assert.equal(texteDecalage(0), '0 s');
  assert.equal(texteDecalage(1.5), '+1,5 s');
  assert.equal(texteDecalage(-0.5), '−0,5 s');
  assert.equal(texteDecalage(12), '+12 s');
});

test('le décalage est retenu par film et par piste ; 0 l’oublie', () => {
  const s = memoire();
  assert.equal(lireDecalage('f1', 'p3', s), 0);
  retenirDecalage('f1', 'p3', 1.5, s);
  retenirDecalage('f1', 'e2', -2, s);
  assert.equal(lireDecalage('f1', 'p3', s), 1.5);
  assert.equal(lireDecalage('f1', 'e2', s), -2);
  assert.equal(lireDecalage('f2', 'p3', s), 0);
  assert.equal(lireDecalage('f1', null, s), 0);
  retenirDecalage('f1', 'p3', 0, s);
  assert.equal(lireDecalage('f1', 'p3', s), 0);
  assert.deepEqual(Object.keys(JSON.parse(s.donnees.values().next().value!)), ['f1:e2']);
});

test('au-delà de 100 films, les plus anciens sont oubliés', () => {
  const s = memoire();
  for (let i = 0; i < 105; i++) retenirDecalage(`f${i}`, 'p1', 1, s);
  assert.equal(lireDecalage('f0', 'p1', s), 0);
  assert.equal(lireDecalage('f4', 'p1', s), 0);
  assert.equal(lireDecalage('f5', 'p1', s), 1);
  assert.equal(lireDecalage('f104', 'p1', s), 1);
});

test('stockage abîmé ou absent : pas de décalage, pas d’erreur', () => {
  assert.equal(lireDecalage('f1', 'p1', { getItem: () => '{oups', setItem: () => {} }), 0);
  assert.equal(lireDecalage('f1', 'p1', { getItem: () => '[1]', setItem: () => {} }), 0);
  assert.equal(lireDecalage('f1', 'p1', null), 0);
  retenirDecalage('f1', 'p1', 1, { getItem: () => null, setItem: () => { throw new Error('plein'); } });
});

test('decalerPiste décale depuis les horaires d’origine, et à nouveau au chargement', () => {
  let surCharge: (() => void) | null = null;
  const cues = [{ startTime: 10, endTime: 12 }, { startTime: 0.2, endTime: 1 }];
  const piste: PisteDecalable = { track: { cues: null }, addEventListener: (_t, f) => { surCharge = f; } };
  decalerPiste(piste, 2); // pas encore chargée : rien à faire
  piste.track.cues = cues;
  surCharge!();
  assert.deepEqual(cues, [{ startTime: 12, endTime: 14 }, { startTime: 2.2, endTime: 3 }]);
  decalerPiste(piste, -0.5); // jamais cumulé : toujours depuis l'origine
  assert.deepEqual(cues, [{ startTime: 9.5, endTime: 11.5 }, { startTime: 0, endTime: 0.5 }]);
  decalerPiste(piste, 0);
  assert.deepEqual(cues, [{ startTime: 10, endTime: 12 }, { startTime: 0.2, endTime: 1 }]);
});
