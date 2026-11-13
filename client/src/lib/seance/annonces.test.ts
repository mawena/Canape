import assert from 'node:assert/strict';
import { test } from 'node:test';
import { etatSynchro, indexPisteTexte, phraseAttente, retiresAttente, texteAnnonce, type ContexteAnnonce } from './annonces.ts';
import type { EtatSeance } from './types.ts';

const etat = (p: Partial<EtatSeance> = {}): EtatSeance => ({
  filmId: 'f', lecture: false, position: 4440, instant: 0, version: 1, attente: [], pisteAudio: 2, sousTitres: 'p3', compteARebours: null, entracteFin: null, serveur: 0, ...p,
});
const plan = {
  pistesAudio: [{ index: 2, langue: 'eng', libelle: 'Anglais (VO)', canaux: 2, parDefaut: false }],
  sousTitres: [
    { cle: 'p3', langue: 'fra', libelle: 'Français', force: false, sdh: false, url: '/a.vtt' },
    { cle: 'e1', langue: 'eng', libelle: 'English', force: false, sdh: false, url: '/b.vtt' },
  ],
};
const ctx = (raison: ContexteAnnonce['raison'], p: Partial<ContexteAnnonce> = {}): ContexteAnnonce => ({ raison, nom: 'Léa', etat: etat(), avant: null, plan, ...p });

test('gestes nommés', () => {
  assert.equal(texteAnnonce(ctx('pause')), 'Léa a mis en pause');
  assert.equal(texteAnnonce(ctx('lecture')), 'Léa a lancé la lecture');
  assert.equal(texteAnnonce(ctx('aller', { avant: 100 })), 'Léa a avancé à 1 h 14 min');
  assert.equal(texteAnnonce(ctx('aller', { avant: 9000 })), 'Léa a reculé à 1 h 14 min');
  assert.equal(texteAnnonce(ctx('audio')), 'Léa a changé la langue : Anglais (VO). Tout le monde est en pause.');
  assert.equal(texteAnnonce(ctx('sous_titres')), 'Léa a mis les sous-titres : Français');
  assert.equal(texteAnnonce(ctx('sous_titres', { etat: etat({ sousTitres: null }) })), 'Léa a retiré les sous-titres');
});

test('départ : perte de connexion nommée ; fin du compte à rebours et tampon sans annonce', () => {
  assert.equal(texteAnnonce(ctx('depart', { nom: 'Léa' })), 'Léa a perdu la connexion. Tout le monde est en pause.');
  assert.equal(texteAnnonce(ctx('compte_a_rebours', { nom: null })), null);
  assert.equal(texteAnnonce(ctx('compte_a_rebours')), 'Léa a lancé le compte à rebours.');
  assert.equal(texteAnnonce(ctx('tampon')), null);
  assert.equal(texteAnnonce(ctx('fin')), null);
  assert.equal(texteAnnonce(ctx('attente-ignoree', { retires: ['Sam'] })), 'On n’attend plus Sam.');
});

test('attente mutuelle', () => {
  assert.equal(phraseAttente(['Sam']), 'On attend Sam…');
  assert.equal(phraseAttente(['Sam', 'Awa', 'Zoé']), 'On attend Sam, Awa et Zoé…');
  assert.deepEqual(retiresAttente(['a', 'b'], ['b']), ['a']);
});

test('indicateur de synchro', () => {
  const base = { ouvert: true, filmId: 'f', lecture: true, attente: false, ecart: 0.1, vitesse: 1 };
  assert.equal(etatSynchro(base).niveau, 'ok');
  assert.deepEqual(etatSynchro({ ...base, ecart: 0.6, vitesse: 1.05 }), { niveau: 'moyen', texte: 'Tu es 0,6 s en retard · rattrapage à 1,05×' });
  assert.equal(etatSynchro({ ...base, ecart: -2 }).texte, 'Tu es 2,0 s en avance');
  assert.equal(etatSynchro({ ...base, ecart: 5 }).niveau, 'mal');
  assert.equal(etatSynchro({ ...base, ouvert: false }).niveau, 'mal');
  assert.equal(etatSynchro({ ...base, attente: true }).niveau, 'moyen');
});

test('piste de texte : par identifiant, libellé, puis rang', () => {
  assert.equal(indexPisteTexte([{ id: 'e1', label: 'x' }, { id: '', label: 'y' }], plan, 'e1'), 0);
  assert.equal(indexPisteTexte([{ id: '', label: 'English' }, { id: '', label: 'Français' }], plan, 'p3'), 1);
  assert.equal(indexPisteTexte([{ id: '', label: '?' }, { id: '', label: '?' }], plan, 'e1'), 1);
  assert.equal(indexPisteTexte([{ id: '', label: '?' }], plan, 'e1'), -1);
  assert.equal(indexPisteTexte([], plan, null), -1);
});

test('soirée : enchaînement nommé, « +5 min » annoncé, ouverture de l’entracte sans annonce (elle a son voile)', () => {
  assert.equal(texteAnnonce(ctx('film', { nom: null, suite: 'Les Heures bleues' })), 'Fin de l’entracte : place à Les Heures bleues');
  assert.equal(texteAnnonce(ctx('film', { suite: 'Les Heures bleues' })), 'Léa a lancé le film suivant : Les Heures bleues');
  assert.equal(texteAnnonce(ctx('film')), 'Léa a changé de film. Tout le monde est en pause.');
  assert.equal(texteAnnonce(ctx('entracte', { nom: null })), null);
  assert.equal(texteAnnonce(ctx('entracte', { ajout: 300 })), 'Léa a rallongé l’entracte de 5 min');
});
