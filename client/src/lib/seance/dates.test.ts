import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ceSoir21h, dateEnLettres, messageInvitation, versIso } from './dates.ts';

test('ce soir 21 h, ou demain s’il est trop tard', () => {
  assert.equal(ceSoir21h(new Date(2026, 10, 12, 18, 30)), '2026-11-12T21:00');
  assert.equal(ceSoir21h(new Date(2026, 10, 12, 22, 0)), '2026-11-13T21:00');
});

test('date en lettres', () => {
  const t = dateEnLettres(new Date(2026, 10, 14, 21, 0).toISOString());
  assert.match(t, /^samedi 14 novembre, 21/);
  assert.equal(dateEnLettres(null), '');
  assert.equal(dateEnLettres('n’importe quoi'), '');
});

test('ISO et message d’invitation', () => {
  assert.equal(versIso('2026-11-14T21:00'), new Date(2026, 10, 14, 21, 0).toISOString());
  assert.equal(messageInvitation('Les Heures bleues', null, 'https://c/r/x'), 'Ce soir, on regarde Les Heures bleues. Voici le lien : https://c/r/x');
});
