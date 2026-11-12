import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decision, echantillon, formaterDuree, formaterTemps, Horloge, meilleurDecalage, positionAttendue } from './synchro.ts';

test('position attendue : figée en pause, avance en lecture', () => {
  assert.equal(positionAttendue({ lecture: false, position: 12, instant: 1000 }, 9000), 12);
  assert.equal(positionAttendue({ lecture: true, position: 12, instant: 1000 }, 4000), 15);
  assert.equal(positionAttendue({ lecture: true, position: 12, instant: 5000 }, 4000), 12);
});

test('décision : saut au-delà de 1 s, vitesse entre 0,3 et 1 s, rien sous 0,1 s', () => {
  assert.deepEqual(decision(1.5, true), { saut: true });
  assert.deepEqual(decision(-2, true), { saut: true });
  assert.deepEqual(decision(0.5, true), { saut: false, vitesse: 1.05 });
  assert.deepEqual(decision(-0.5, true), { saut: false, vitesse: 0.95 });
  assert.deepEqual(decision(0.05, true, 1.05), { saut: false, vitesse: 1 });
  // Hystérésis : entre 0,1 et 0,3 on garde la correction commencée, sans en lancer.
  assert.deepEqual(decision(0.2, true, 1), { saut: false, vitesse: 1 });
  assert.deepEqual(decision(0.2, true, 1.05), { saut: false, vitesse: 1.05 });
});

test('décision en pause : on saute sur la position, sans vitesse', () => {
  assert.deepEqual(decision(0.4, false), { saut: true });
  assert.deepEqual(decision(0.01, false), { saut: false, vitesse: 1 });
});

test('horloge : le plus petit aller-retour donne le décalage', () => {
  const a = echantillon(1000, 5100, 1200); // rtt 200, serveur = local + 4000
  const b = echantillon(2000, 6010, 2020); // rtt 20
  assert.equal(a.rtt, 200);
  assert.equal(meilleurDecalage([a, b]), b.decalage);
  assert.ok(Math.abs(b.decalage - 4000) < 20);
  assert.equal(meilleurDecalage([]), 0);
});

test('Horloge : amorçage, pong, cadence des pings', () => {
  let local = 1000;
  const h = new Horloge(() => local);
  h.amorcer(11_000);
  assert.equal(h.serveurMaintenant(), 11_000);
  local = 1040;
  h.surPong(1000, 11_020); // rtt 40, serveur ≈ local + 10 000
  assert.equal(h.rtt, 40);
  assert.equal(h.decalage, 11_020 + 20 - 1040);
  const delais = Array.from({ length: 7 }, () => h.prochainDelai());
  assert.deepEqual(delais, [300, 300, 300, 300, 300, 5000, 5000]);
  h.reinitialiserCadence();
  assert.equal(h.prochainDelai(), 300);
});

test('formats du temps', () => {
  assert.equal(formaterTemps(0), '0:00');
  assert.equal(formaterTemps(768), '12:48');
  assert.equal(formaterTemps(4368), '1:12:48');
  assert.equal(formaterTemps(-5), '0:00');
  assert.equal(formaterDuree(6720), '1 h 52 min');
  assert.equal(formaterDuree(3600), '1 h');
  assert.equal(formaterDuree(45), '45 s');
});
