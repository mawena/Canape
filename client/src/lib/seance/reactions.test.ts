import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ajouterReaction, annonceReactions, emojiDeTouche, FabriqueReactions, MAX_REACTIONS, purgerReactions } from './reactions.ts';

test('au plus 12 réactions : les plus anciennes disparaissent', () => {
  const f = new FabriqueReactions(() => 0.5);
  let liste = [] as ReturnType<FabriqueReactions['creer']>[];
  for (let i = 0; i < 15; i++) liste = ajouterReaction(liste, f.creer('a', '😂', false, i));
  assert.equal(liste.length, MAX_REACTIONS);
  assert.equal(liste[0]?.id, 4);
  assert.equal(liste.at(-1)?.id, 15);
});

test('dérive de ±24 px, départ entre 55 et 75 %', () => {
  const bas = new FabriqueReactions(() => 0).creer('a', '🔥', true, 0);
  const haut = new FabriqueReactions(() => 1).creer('a', '🔥', true, 0);
  assert.equal(bas.derive, -24);
  assert.equal(haut.derive, 24);
  assert.equal(bas.depart, 55);
  assert.equal(haut.depart, 75);
});

test('purge après 4,5 s', () => {
  const f = new FabriqueReactions();
  const liste = [f.creer('a', '❤️', false, 0), f.creer('a', '❤️', false, 3000)];
  assert.equal(purgerReactions(liste, 4600).length, 1);
});

test('annonce regroupée et touches 1 à 8', () => {
  assert.equal(annonceReactions('Léa', ['😂', '😂', '😂']), 'Léa a réagi 3 fois : rire');
  assert.equal(annonceReactions('Léa', ['🍿']), 'Léa a réagi : pop-corn');
  const liste = ['😂', '❤️', '😱', '😭', '🔥', '👏', '😮', '🍿'] as const;
  assert.equal(emojiDeTouche('1', liste), '😂');
  assert.equal(emojiDeTouche('8', liste), '🍿');
  assert.equal(emojiDeTouche('9', liste), null);
  assert.equal(emojiDeTouche('a', liste), null);
});
