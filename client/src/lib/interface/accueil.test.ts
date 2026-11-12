import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListeSeances, Seance } from '@canape/partage';
import { accroche, autresPersonnes, salleOuverte, seanceDeCeSoir } from './accueil.ts';

function seance(p: Partial<Seance>): Seance {
  return {
    id: 's1', hoteId: 2, hotePrenom: 'Léa', filmId: 'f1', filmTitre: 'Les Heures bleues', titre: null, prevueLe: null,
    aUnLien: false, pisteAudio: null, sousTitres: null, position: 0, creeLe: '2026-11-12T10:00:00Z', termineeLe: null,
    invites: [{ id: 1, prenom: 'Awa', couleur: null }], presents: 0, ...p,
  };
}
const maintenant = new Date(2026, 10, 13, 18, 30);
const ce21h = new Date(2026, 10, 13, 21, 0).toISOString();

describe('accueil', () => {
  it('choisit la séance de ce soir', () => {
    const liste: ListeSeances = { aVenir: [seance({ prevueLe: ce21h })], enCours: [], recentes: [] };
    assert.equal(seanceDeCeSoir(liste, maintenant)?.id, 's1');
    const lointaine: ListeSeances = { aVenir: [seance({ prevueLe: new Date(2026, 10, 20, 21).toISOString() })], enCours: [], recentes: [] };
    assert.equal(seanceDeCeSoir(lointaine, maintenant), null);
    assert.equal(seanceDeCeSoir(null, maintenant), null);
  });
  it('préfère une séance en cours', () => {
    const liste: ListeSeances = { aVenir: [seance({ prevueLe: ce21h })], enCours: [seance({ id: 'en-cours' })], recentes: [] };
    assert.equal(seanceDeCeSoir(liste, maintenant)?.id, 'en-cours');
  });
  it('ouvre la salle 15 minutes avant', () => {
    const s = seance({ prevueLe: ce21h });
    assert.equal(salleOuverte(s, new Date(2026, 10, 13, 20, 30)), false);
    assert.equal(salleOuverte(s, new Date(2026, 10, 13, 20, 46)), true);
    assert.equal(salleOuverte(seance({}), maintenant), true);
  });
  it('liste les autres personnes sans moi', () => {
    assert.deepEqual(autresPersonnes(seance({}), 1).map((p) => p.prenom), ['Léa']);
  });
  it('compose l’accroche', () => {
    assert.deepEqual(accroche('Awa', seance({ prevueLe: ce21h }), 1, false, maintenant), { salut: 'Bonsoir Awa,', suite: 'Léa arrive à 21 h.' });
    assert.equal(accroche('Awa', null, 1, false, maintenant).suite, 'qu’est-ce qu’on regarde\u00a0?');
    assert.equal(accroche('Awa', null, 1, true, maintenant).suite, 'reprends où tu t’étais arrêté.');
    assert.equal(accroche('Awa', seance({ presents: 1 }), 1, false, maintenant).suite, 'Léa est déjà là.');
  });
});
