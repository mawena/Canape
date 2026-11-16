import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlanDeLecture, SousTitresPlan } from '@canape/partage';
import { choisirSousTitres, choixValide, decrireChoix, langueCommune, langueAudio, tailleValide } from './sous-titres.ts';
import { lirePrefs } from './prefs.ts';

const st = (cle: string, langue: string | null, force = false, sdh = false): SousTitresPlan =>
  ({ cle, langue, libelle: cle, force, sdh, url: `/st/${cle}.vtt` });

const plan = (sousTitres: SousTitresPlan[], audio: Array<[number, string | null, boolean]> = [[1, 'eng', true], [2, 'fre', false]]):
  Pick<PlanDeLecture, 'sousTitres' | 'pistesAudio'> => ({
  sousTitres,
  pistesAudio: audio.map(([index, langue, parDefaut]) => ({ index, langue, libelle: '', canaux: 2, parDefaut })),
});

test('langueCommune ramène les codes à deux lettres', () => {
  assert.equal(langueCommune('fre'), 'fr');
  assert.equal(langueCommune('fra'), 'fr');
  assert.equal(langueCommune('FR'), 'fr');
  assert.equal(langueCommune('eng'), 'en');
  assert.equal(langueCommune('und'), null);
  assert.equal(langueCommune(null), null);
  assert.equal(langueCommune('x!'), 'x!');
});

test('langueAudio : piste choisie, sinon par défaut, sinon la première', () => {
  const p = plan([]);
  assert.equal(langueAudio(p, 2), 'fr');
  assert.equal(langueAudio(p, null), 'en');
  assert.equal(langueAudio(plan([], [[0, 'ita', false]]), null), 'it');
  assert.equal(langueAudio(null, null), null);
});

test('jamais choisi : les forcés de la langue du film, sinon rien', () => {
  const p = plan([st('p3', 'fre'), st('p4', 'eng', true), st('e1', 'fr', true)]);
  assert.equal(choisirSousTitres(p, 'auto', null), 'p4');
  assert.equal(choisirSousTitres(p, 'auto', 2), 'e1');
  assert.equal(choisirSousTitres(plan([st('p3', 'fre')]), 'auto', null), null);
  assert.equal(choisirSousTitres(null, 'auto', null), null);
});

test('« Aucun » ne montre rien, même pas les forcés', () => {
  assert.equal(choisirSousTitres(plan([st('p4', 'eng', true)]), 'aucun', null), null);
});

test('une langue choisie est retrouvée dans un autre film, au plus près de la variante', () => {
  const choix = { langue: 'fr', force: false, sdh: false };
  assert.equal(choisirSousTitres(plan([st('p2', 'eng'), st('p3', 'fre', true), st('p4', 'fre')]), choix, null), 'p4');
  assert.equal(choisirSousTitres(plan([st('p3', 'fre', false, true), st('e1', 'fr', true)]), choix, null), 'p3');
  const sdh = { langue: 'fr', force: false, sdh: true };
  assert.equal(choisirSousTitres(plan([st('p3', 'fre'), st('p4', 'fra', false, true)]), sdh, null), 'p4');
  // Langue absente du film : comme si rien n'était choisi.
  assert.equal(choisirSousTitres(plan([st('p5', 'spa'), st('p6', 'eng', true)]), choix, null), 'p6');
});

test('decrireChoix retient la langue et la variante', () => {
  const p = plan([st('p3', 'fre', false, true)]);
  assert.deepEqual(decrireChoix(p, 'p3'), { langue: 'fr', force: false, sdh: true });
  assert.equal(decrireChoix(p, null), 'aucun');
  assert.equal(decrireChoix(p, 'inconnue'), 'auto');
});

test('préférences abîmées : retour aux valeurs par défaut', () => {
  assert.equal(choixValide('n’importe quoi'), 'auto');
  assert.equal(choixValide({ langue: 3, force: false, sdh: false }), 'auto');
  assert.deepEqual(choixValide({ langue: null, force: true, sdh: false }), { langue: null, force: true, sdh: false });
  assert.equal(tailleValide('géante'), 'normale');
  const prefs = lirePrefs({ getItem: () => JSON.stringify({ sousTitres: 42, tailleSousTitres: 'grande' }) });
  assert.equal(prefs.sousTitres, 'auto');
  assert.equal(prefs.tailleSousTitres, 'grande');
  assert.equal(lirePrefs(null).tailleSousTitres, 'normale');
});
