import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Film, FilmAVoir, UtilisateurEnvie } from '@canape/partage';
import { appliquerEtat, autresEnvieux, estPlebiscite, libelleNombreEnvies, lireInvites, phraseEnvies, trierEnvies } from './envies.ts';
import { liens } from './liens.ts';

const p = (id: number, prenom: string): UtilisateurEnvie => ({ id, prenom, couleur: null });
function item(filmId: string, personnes: UtilisateurEnvie[], moiId = 1): FilmAVoir {
  const film = { id: filmId, titre: filmId, envie: personnes.some((x) => x.id === moiId), nbEnvies: personnes.length } as Film;
  return { film, personnes, moi: film.envie };
}

describe('envies : phrases', () => {
  it('moi seul', () => assert.equal(phraseEnvies(item('a', [p(1, 'Awa')]), 1), 'Tu as envie de le voir.'));
  it('moi et un autre', () => assert.equal(phraseEnvies(item('a', [p(2, 'Ben'), p(1, 'Awa')]), 1), 'Toi et Ben, vous avez envie de le voir.'));
  it('moi et deux autres', () => assert.equal(phraseEnvies(item('a', [p(2, 'Ben'), p(1, 'Awa'), p(3, 'Cléo')]), 1), 'Toi et Ben et Cléo, vous avez envie de le voir.'));
  it('un autre seul', () => assert.equal(phraseEnvies(item('a', [p(2, 'Ben')]), 1), 'Ben a envie de le voir.'));
  it('plusieurs autres', () => assert.equal(phraseEnvies(item('a', [p(2, 'Ben'), p(3, 'Cléo')]), 1), 'Ben et Cléo ont envie de le voir.'));
  it('nombre', () => { assert.equal(libelleNombreEnvies(1), '1 envie'); assert.equal(libelleNombreEnvies(3), '3 envies'); });
});

describe('envies : invités et plébiscite', () => {
  it('les autres envieux, sans moi', () => assert.deepEqual(autresEnvieux(item('a', [p(1, 'Awa'), p(2, 'Ben')]), 1).map((x) => x.id), [2]));
  it('plébiscité à partir de deux personnes', () => {
    assert.equal(estPlebiscite(item('a', [p(1, 'Awa')])), false);
    assert.equal(estPlebiscite(item('a', [p(1, 'Awa'), p(2, 'Ben')])), true);
  });
  it('lit ?invites sans doublon, sans valeur invalide ni moi', () => {
    assert.deepEqual(lireInvites('2,5,2, x,-3,0,1.5,1', 1), [2, 5]);
    assert.deepEqual(lireInvites(null), []);
    assert.deepEqual(lireInvites(''), []);
  });
  it('le lien de la séance porte le film et les invités', () => {
    assert.equal(liens.nouvelleSeance('f 1', [2, 5]), '/seances/nouvelle?film=f+1&invites=2%2C5');
    assert.equal(liens.nouvelleSeance('f1'), '/seances/nouvelle?film=f1');
    assert.equal(liens.nouvelleSeance(), '/seances/nouvelle');
    assert.equal(liens.nouvelleSeance(undefined, [3]), '/seances/nouvelle?invites=3');
  });
});

describe('envies : tri et mise à jour', () => {
  it('le plus d\'envies d\'abord, ordre du serveur à égalité', () => {
    const l = [item('a', [p(1, 'Awa')]), item('b', [p(1, 'Awa'), p(2, 'Ben')]), item('c', [p(2, 'Ben')])];
    assert.deepEqual(trierEnvies(l).map((x) => x.film.id), ['b', 'a', 'c']);
  });
  it('je retire mon envie : il reste les autres', () => {
    const l = appliquerEtat([item('a', [p(1, 'Awa'), p(2, 'Ben')])], { filmId: 'a', moi: false, nombre: 1 }, p(1, 'Awa'));
    assert.deepEqual(l[0]!.personnes.map((x) => x.id), [2]);
    assert.equal(l[0]!.moi, false);
    assert.equal(l[0]!.film.nbEnvies, 1);
  });
  it('je retire mon envie et personne d\'autre : le film disparaît', () => {
    assert.deepEqual(appliquerEtat([item('a', [p(1, 'Awa')])], { filmId: 'a', moi: false, nombre: 0 }, p(1, 'Awa')), []);
  });
  it('j\'ajoute mon envie : je suis dans la liste', () => {
    const l = appliquerEtat([item('a', [p(2, 'Ben')])], { filmId: 'a', moi: true, nombre: 2 }, p(1, 'Awa'));
    assert.deepEqual(l[0]!.personnes.map((x) => x.id), [2, 1]);
    assert.equal(l[0]!.moi, true);
    assert.equal(l[0]!.film.envie, true);
  });
  it('les autres films ne bougent pas', () => {
    const autre = item('z', [p(2, 'Ben')]);
    assert.equal(appliquerEtat([autre], { filmId: 'a', moi: true, nombre: 1 }, p(1, 'Awa'))[0], autre);
  });
});
