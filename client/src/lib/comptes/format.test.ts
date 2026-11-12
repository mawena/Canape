import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aideMotDePasse, analyserTaille, expireDans, formaterOctets, jaugeMotDePasse, pourcentage, retourSur } from './format.ts';

test('formaterOctets', () => {
  assert.equal(formaterOctets(0), '0 o');
  assert.equal(formaterOctets(1536), '1,5 Ko');
  assert.equal(formaterOctets(1024 ** 3), '1 Go');
  assert.equal(formaterOctets(150 * 1024 ** 3), '150 Go');
  assert.equal(formaterOctets(-5), '0 o');
});

test('analyserTaille', () => {
  assert.equal(analyserTaille('100 Go'), 100 * 1024 ** 3);
  assert.equal(analyserTaille('1,5G'), 1.5 * 1024 ** 3);
  assert.equal(analyserTaille('512'), 512);
  assert.equal(analyserTaille('2 Mo'), 2 * 1024 ** 2);
  assert.equal(analyserTaille('10 GiB'), 10 * 1024 ** 3);
  assert.equal(analyserTaille('beaucoup'), null);
  assert.equal(analyserTaille(''), null);
  assert.equal(analyserTaille('5 parsecs'), null);
});

test('retourSur : uniquement des chemins internes', () => {
  assert.equal(retourSur('/seances/abc?x=1'), '/seances/abc?x=1');
  assert.equal(retourSur(null), '/');
  assert.equal(retourSur('https://evil.test'), '/');
  assert.equal(retourSur('//evil.test'), '/');
  assert.equal(retourSur('/\\evil.test'), '/');
  assert.equal(retourSur('/connexion?retour=/'), '/');
  assert.equal(retourSur('relatif'), '/');
});

test('mot de passe', () => {
  assert.equal(aideMotDePasse('court'), '10 caractères au minimum. Il en manque 5.');
  assert.equal(aideMotDePasse('assez-long-oui'), null);
  assert.equal(jaugeMotDePasse(''), 0);
  assert.equal(jaugeMotDePasse('x'.repeat(40)), 1);
});

test('expireDans et pourcentage', () => {
  const t = Date.parse('2026-11-12T12:00:00Z');
  assert.equal(expireDans('2026-11-11T12:00:00Z', t), 'expiré');
  assert.equal(expireDans('2026-11-12T20:00:00Z', t), "expire aujourd'hui");
  assert.equal(expireDans('2026-11-18T12:00:00Z', t), 'expire dans 6 jours');
  assert.equal(pourcentage(50, 200), 25);
  assert.equal(pourcentage(5, 0), 0);
  assert.equal(pourcentage(500, 200), 100);
});
