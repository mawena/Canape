import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  couleurValide, formaterChrono, formaterDans, formaterDateSeance, formaterDuree, formaterTaille, listerNoms, salutation, teinteTitre,
} from './format.ts';

describe('format', () => {
  it('formate les durées', () => {
    assert.equal(formaterDuree(6720), '1 h 52');
    assert.equal(formaterDuree(2520), '42 min');
    assert.equal(formaterDuree(null), '');
  });
  it('formate le chrono', () => {
    assert.equal(formaterChrono(4368), '1:12:48');
    assert.equal(formaterChrono(95), '1:35');
  });
  it('formate les tailles avec espace fine', () => {
    assert.equal(formaterTaille(4_200_000_000), '4,2 Go');
    assert.equal(formaterTaille(512), '512 o');
    assert.equal(formaterTaille(31_000_000_000), '31 Go');
  });
  it('formate les dates de séance', () => {
    const maintenant = new Date(2026, 10, 13, 12, 0);
    assert.equal(formaterDateSeance(new Date(2026, 10, 13, 21, 0).toISOString(), maintenant), 'Ce soir, 21 h');
    assert.equal(formaterDateSeance(new Date(2026, 10, 14, 21, 0).toISOString(), maintenant), 'Demain, 21 h');
    assert.equal(formaterDateSeance(new Date(2026, 10, 20, 21, 30).toISOString(), maintenant), 'vendredi 20 novembre, 21 h 30');
  });
  it('formate « dans »', () => {
    const maintenant = new Date(2026, 10, 13, 18, 50);
    assert.equal(formaterDans(new Date(2026, 10, 13, 21, 0).toISOString(), maintenant), 'dans 2 h 10');
    assert.equal(formaterDans(new Date(2026, 10, 13, 19, 2).toISOString(), maintenant), 'dans 12 min');
  });
  it('salue selon l’heure', () => {
    assert.equal(salutation(new Date(2026, 10, 13, 20)), 'Bonsoir');
    assert.equal(salutation(new Date(2026, 10, 13, 9)), 'Bonjour');
  });
  it('donne une teinte stable', () => {
    assert.equal(teinteTitre('Les Heures bleues'), teinteTitre('Les Heures bleues'));
    assert.ok(teinteTitre('X') >= 0 && teinteTitre('X') < 360);
  });
  it('valide les couleurs', () => {
    assert.equal(couleurValide('#f4a85b'), '#f4a85b');
    assert.equal(couleurValide('rouge'), null);
  });
  it('liste les noms', () => {
    assert.equal(listerNoms(['Awa', 'Léa']), 'Awa et Léa');
    assert.equal(listerNoms(['Awa', 'Léa', 'Sam', 'Mehdi']), 'Awa, Léa et 2 autres');
  });
});
