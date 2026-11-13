import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  deplacer, estSoiree, filmEnCours, filmSuivant, filmsAVenir, formaterMinuteur, phraseNbFilms, phraseProgramme,
  positionDansProgramme, programmeTrie, tempsRestantEntracte, type FilmProgramme,
} from '@canape/partage';
import {
  ajouterFilm, deplacerFilm, dureeCourte, estEnchainement, etatFilm, filmsAjoutables, filmsDuCorps, filmsLances, idsAVenir,
  invitationNote, libelleRang, peutGererProgramme, phraseEntracte, phraseSoiree, retirerFilm, titresEnchaines,
} from './programme.ts';

const f = (rang: number, filmId: string, titre = filmId.toUpperCase()): FilmProgramme => ({
  rang, filmId, titre, annee: null, aAffiche: false, versionImages: 0, couleur: null,
});
// Dans le désordre, avec un trou (un film supprimé) : l'ordre vient du rang.
const prog = [f(3, 'c'), f(0, 'a'), f(1, 'b'), f(5, 'd')];

describe('programme : ordre et film suivant (partage)', () => {
  test('tri par rang, sans toucher à la liste d’origine', () => {
    assert.deepEqual(programmeTrie(prog).map((x) => x.filmId), ['a', 'b', 'c', 'd']);
    assert.equal(prog[0]?.filmId, 'c');
  });
  test('films à venir, film suivant, film en cours (malgré les trous)', () => {
    assert.deepEqual(filmsAVenir(prog, 1).map((x) => x.filmId), ['c', 'd']);
    assert.equal(filmSuivant(prog, 0)?.filmId, 'b');
    assert.equal(filmSuivant(prog, 1)?.filmId, 'c');
    assert.equal(filmSuivant(prog, 3)?.filmId, 'd');
    assert.equal(filmSuivant(prog, 5), null);
    assert.equal(filmEnCours(prog, 3)?.filmId, 'c');
    assert.equal(filmEnCours(prog, 2), null);
  });
  test('une soirée : plus d’un film', () => {
    assert.equal(estSoiree([f(0, 'a')]), false);
    assert.equal(estSoiree(prog), true);
  });
  test('déplacer : copie, gestes impossibles sans effet', () => {
    const l = ['a', 'b', 'c'];
    assert.deepEqual(deplacer(l, 0, 2), ['b', 'c', 'a']);
    assert.deepEqual(deplacer(l, 2, 0), ['c', 'a', 'b']);
    assert.deepEqual(deplacer(l, 0, -1), ['a', 'b', 'c']);
    assert.deepEqual(deplacer(l, 2, 3), ['a', 'b', 'c']);
    assert.deepEqual(l, ['a', 'b', 'c']);
  });
});

describe('programme : gestes de l’hôte', () => {
  test('seul l’hôte d’une séance pas terminée gère le programme', () => {
    assert.equal(peutGererProgramme({ hoteId: 1, termineeLe: null }, 1), true);
    assert.equal(peutGererProgramme({ hoteId: 1, termineeLe: null }, 2), false);
    assert.equal(peutGererProgramme({ hoteId: 1, termineeLe: '2026-11-13T22:00:00Z' }, 1), false);
    assert.equal(peutGererProgramme(null, 1), false);
    assert.equal(peutGererProgramme({ hoteId: 1, termineeLe: null }, null), false);
  });
  test('état de chaque film', () => {
    assert.equal(etatFilm(f(0, 'a'), 1), 'vu');
    assert.equal(etatFilm(f(1, 'b'), 1), 'en-cours');
    assert.equal(etatFilm(f(3, 'c'), 1), 'a-venir');
  });
  test('films à venir à envoyer, monter, descendre, ajouter, retirer', () => {
    assert.deepEqual(idsAVenir(prog, 1), ['c', 'd']);
    assert.deepEqual(deplacerFilm(['c', 'd', 'e'], 'd', -1), ['d', 'c', 'e']);
    assert.deepEqual(deplacerFilm(['c', 'd', 'e'], 'd', 1), ['c', 'e', 'd']);
    assert.deepEqual(deplacerFilm(['c', 'd'], 'c', -1), ['c', 'd']);
    assert.deepEqual(deplacerFilm(['c', 'd'], 'd', 1), ['c', 'd']);
    assert.deepEqual(deplacerFilm(['c', 'd'], 'z', 1), ['c', 'd']);
    assert.deepEqual(ajouterFilm(['c'], 'e'), ['c', 'e']);
    assert.deepEqual(ajouterFilm(['c', 'e'], 'e'), ['c', 'e']);
    assert.deepEqual(retirerFilm(['c', 'e'], 'c'), ['e']);
  });
  test('films ajoutables : prêts, ni en cours ni déjà prévus (un film déjà vu peut revenir)', () => {
    const films = [{ id: 'a', etat: 'pret' }, { id: 'b', etat: 'pret' }, { id: 'c', etat: 'pret' }, { id: 'x', etat: 'analyse' }, { id: 'y', etat: 'pret' }];
    assert.deepEqual(filmsAjoutables(films, prog, 1).map((x) => x.id), ['a', 'y']);
  });
  test('enchaînement : le nouveau film est le suivant du programme', () => {
    assert.equal(estEnchainement(prog, 1, 'c')?.titre, 'C');
    assert.equal(estEnchainement(prog, 1, 'd'), null);
    assert.equal(estEnchainement(prog, 5, 'a'), null);
    assert.equal(estEnchainement(prog, 1, null), null);
  });
});

describe('programme : création', () => {
  test('un seul film : `filmId` comme avant ; plusieurs : `filmIds` dans l’ordre', () => {
    assert.deepEqual(filmsDuCorps(['a']), { filmId: 'a' });
    assert.deepEqual(filmsDuCorps(['b', 'a']), { filmIds: ['b', 'a'] });
  });
  test('titres enchaînés pour le message d’invitation', () => {
    assert.equal(titresEnchaines(['Les Heures bleues']), 'Les Heures bleues');
    assert.equal(titresEnchaines(['A', 'B']), 'A puis B');
    assert.equal(titresEnchaines(['A', 'B', 'C']), 'A, B puis C');
    assert.equal(titresEnchaines([]), '');
  });
});

describe('programme : textes', () => {
  test('« 3 films : … » seulement pour une soirée', () => {
    assert.equal(phraseProgramme(['A']), null);
    assert.equal(phraseProgramme(['A', 'B']), '2 films : A, B');
    assert.equal(phraseProgramme(['A', 'B', 'C']), '3 films : A, B, C');
    assert.equal(phraseProgramme(['A', 'B', 'C', 'D']), '4 films : A, B, C et 1 autre');
    assert.equal(phraseProgramme(['A', 'B', 'C', 'D', 'E']), '5 films : A, B, C et 2 autres');
    assert.equal(phraseNbFilms(1), '1 film');
    assert.equal(phraseNbFilms(3), '3 films');
  });
  test('« Film 2 sur 3 »', () => {
    assert.equal(libelleRang(prog, 1), 'Film 2 sur 4');
    assert.equal(positionDansProgramme(prog, 5), 'Film 4 sur 4');
    assert.equal(libelleRang([f(0, 'a')], 0), null);
    assert.equal(libelleRang(prog, 2), null);
  });
  test('films lancés ce soir', () => {
    assert.equal(filmsLances(prog, 0), 1);
    assert.equal(filmsLances(prog, 3), 3);
  });
});

describe('entracte : temps restant', () => {
  test('arrondi au-dessus, jamais négatif, rien sans entracte', () => {
    assert.equal(tempsRestantEntracte(null, 1000), null);
    assert.equal(tempsRestantEntracte(301_000, 1000), 300);
    assert.equal(tempsRestantEntracte(301_000, 1001), 300);
    assert.equal(tempsRestantEntracte(301_000, 2000), 299);
    assert.equal(tempsRestantEntracte(301_000, 300_500), 1);
    assert.equal(tempsRestantEntracte(301_000, 400_000), 0);
  });
  test('minuteur « 4:59 »', () => {
    assert.equal(formaterMinuteur(300), '5:00');
    assert.equal(formaterMinuteur(299), '4:59');
    assert.equal(formaterMinuteur(7), '0:07');
    assert.equal(formaterMinuteur(720), '12:00');
    assert.equal(formaterMinuteur(-3), '0:00');
  });
  test('phrase pour les lecteurs d’écran (une par minute)', () => {
    assert.equal(phraseEntracte(null), '');
    assert.equal(phraseEntracte(300), 'Le film suivant commence dans 5 minutes.');
    assert.equal(phraseEntracte(241), 'Le film suivant commence dans 5 minutes.');
    assert.equal(phraseEntracte(240), 'Le film suivant commence dans 4 minutes.');
    assert.equal(phraseEntracte(60), 'Le film suivant commence dans 1 minute.');
    assert.equal(phraseEntracte(59), 'Le film suivant commence dans moins d’une minute.');
    assert.equal(phraseEntracte(0), 'Le film suivant commence.');
  });
  test('durée ajoutée', () => {
    assert.equal(dureeCourte(300), '5 min');
    assert.equal(dureeCourte(30), '30 s');
  });
});

describe('fin de soirée', () => {
  test('la question parle de la soirée s’il y a eu plusieurs films', () => {
    assert.equal(invitationNote(1), 'Un mot sur ce film ?');
    assert.equal(invitationNote(0), 'Un mot sur ce film ?');
    assert.equal(invitationNote(3), 'Un mot sur cette soirée ?');
  });
  test('le résumé cite le nombre de films', () => {
    assert.equal(phraseSoiree(1, 6720, false), null);
    assert.equal(phraseSoiree(3, 4 * 3600 + 12 * 60, false), '3 films, 4 h 12 ensemble');
    assert.equal(phraseSoiree(2, 0, true), '2 films, regardés seul·e');
  });
});
