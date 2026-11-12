import assert from 'node:assert/strict';
import { test } from 'node:test';
import { peutInviter, texteDePartage } from './inviter.ts';

const seance = { hoteId: 7, termineeLe: null as string | null, titre: null, filmTitre: 'Les Heures bleues', prevueLe: null };

test('seul l’hôte peut inviter', () => {
  assert.equal(peutInviter(seance, 7), true);
  assert.equal(peutInviter(seance, 8), false);
  assert.equal(peutInviter(seance, null), false);
  assert.equal(peutInviter(null, 7), false);
});

test('plus d’invitation une fois la séance terminée', () => {
  assert.equal(peutInviter({ ...seance, termineeLe: '2026-11-12T22:00:00Z' }, 7), false);
});

test('le texte de partage reprend le message d’invitation', () => {
  assert.equal(texteDePartage(seance, 'https://c/r/x'), 'Ce soir, on regarde Les Heures bleues. Voici le lien : https://c/r/x');
  assert.match(texteDePartage({ ...seance, filmTitre: null, titre: 'Soirée' }, 'https://c/r/x'), /on regarde Soirée\./);
});
