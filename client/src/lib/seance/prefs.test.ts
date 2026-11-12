import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coinLePlusProche, coteChat, ecrirePrefs, lirePrefs, PREFS_DEFAUT } from './prefs.ts';

test('préférences : valeurs par défaut, relecture, stockage cassé', () => {
  const mem = new Map<string, string>();
  const stock = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.deepEqual(lirePrefs(stock), PREFS_DEFAUT);
  ecrirePrefs({ ...PREFS_DEFAUT, volFilm: 0.3, coin: 'bas-gauche' }, stock);
  assert.equal(lirePrefs(stock).volFilm, 0.3);
  assert.equal(lirePrefs(stock).baisseFilm, true);
  mem.set('canape.salle.prefs', '{pas du json');
  assert.deepEqual(lirePrefs(stock), PREFS_DEFAUT);
  assert.deepEqual(lirePrefs({ getItem: () => { throw new Error('refusé'); } }), PREFS_DEFAUT);
  assert.deepEqual(lirePrefs(null), PREFS_DEFAUT);
});

test('aimantation aux coins, chat du côté opposé', () => {
  assert.equal(coinLePlusProche(900, 100, 1000, 600), 'haut-droite');
  assert.equal(coinLePlusProche(100, 500, 1000, 600), 'bas-gauche');
  assert.equal(coteChat('haut-droite'), 'gauche');
  assert.equal(coteChat('bas-gauche'), 'droite');
});
