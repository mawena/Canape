import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Souvenir } from '@canape/partage';
import { emojiNote, estSeul, formaterTempsEnsemble, libelleNote, maNote, notesDesAutres, phraseTemps, presents } from './souvenir.ts';

const p = (id: number, prenom: string, present = true, note: 'coeur' | 'bien' | 'bof' | null = null) => ({ utilisateur: { id, prenom, couleur: null }, present, note });
const souvenir = (personnes: Souvenir['personnes'], secondesEnsemble = 6720): Pick<Souvenir, 'personnes' | 'secondesEnsemble'> => ({ personnes, secondesEnsemble });

describe('durée passée ensemble', () => {
  test('textes justes', () => {
    assert.equal(formaterTempsEnsemble(0), 'moins d’une minute');
    assert.equal(formaterTempsEnsemble(59), 'moins d’une minute');
    assert.equal(formaterTempsEnsemble(60), '1 min');
    assert.equal(formaterTempsEnsemble(45 * 60), '45 min');
    assert.equal(formaterTempsEnsemble(59 * 60 + 40), '1 h');
    assert.equal(formaterTempsEnsemble(3600), '1 h');
    assert.equal(formaterTempsEnsemble(3600 + 5 * 60), '1 h 05');
    assert.equal(formaterTempsEnsemble(6720), '1 h 52');
    assert.equal(formaterTempsEnsemble(2 * 3600 + 10), '2 h');
    assert.equal(formaterTempsEnsemble(Number.NaN), 'moins d’une minute');
  });
});

describe('phrase du souvenir', () => {
  test('à plusieurs : « ensemble »', () => {
    assert.equal(phraseTemps(souvenir([p(1, 'Ana'), p(2, 'Ben')])), '1 h 52 ensemble');
    assert.equal(phraseTemps(souvenir([p(1, 'Ana'), p(2, 'Ben')], 20)), 'moins d’une minute ensemble');
  });
  test('seul : « Tu as regardé seul·e », même avec une note d\'une personne absente', () => {
    assert.equal(phraseTemps(souvenir([p(1, 'Ana')])), 'Tu as regardé seul·e');
    assert.equal(phraseTemps(souvenir([p(1, 'Ana'), p(2, 'Ben', false, 'bof')])), 'Tu as regardé seul·e');
    assert.equal(estSeul(souvenir([])), true);
    assert.equal(estSeul(souvenir([p(1, 'Ana'), p(2, 'Ben')])), false);
  });
});

describe('notes', () => {
  const s = souvenir([p(1, 'Ana', true, 'coeur'), p(2, 'Ben', true, 'bof'), p(3, 'Cléo', false)]);
  test('ma note et celles des autres', () => {
    assert.equal(maNote(s, 1), 'coeur');
    assert.equal(maNote(s, 3), null);
    assert.equal(maNote(s, null), null);
    assert.deepEqual(notesDesAutres(s, 1), [{ prenom: 'Ben', note: 'bof' }]);
    assert.equal(presents(s).length, 2);
  });
  test('libellés', () => {
    assert.equal(libelleNote('coeur'), 'Coup de cœur');
    assert.equal(emojiNote('bien'), '👍');
  });
});
