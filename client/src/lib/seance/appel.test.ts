import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estPoli, liaisonFaible } from './appel.ts';

test('un seul des deux pairs est poli', () => {
  assert.notEqual(estPoli('a', 'b'), estPoli('b', 'a'));
});

test('liaison faible : pertes de plus de 8 % ou aller-retour de plus de 600 ms', () => {
  assert.equal(liaisonFaible(null, { recus: 1000, perdus: 0, rtt: 0.7 }), true);
  assert.equal(liaisonFaible(null, { recus: 1000, perdus: 500, rtt: 0.05 }), false); // pas de période de référence
  const avant = { recus: 1000, perdus: 10, rtt: 0.05 };
  assert.equal(liaisonFaible(avant, { recus: 1180, perdus: 30, rtt: 0.05 }), true);
  assert.equal(liaisonFaible(avant, { recus: 1190, perdus: 11, rtt: 0.05 }), false);
  assert.equal(liaisonFaible(avant, { recus: 1003, perdus: 12, rtt: 0.05 }), false); // trop peu de paquets pour juger
});
