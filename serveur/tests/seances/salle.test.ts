// Logique pure de la salle (portage des tests de `salon.js` de la 0.1) et du seau à jetons.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Salle } from '../../src/modules/seances/salle.ts';
import { Seau } from '../../src/modules/seances/salles.ts';
import { identifiantsTurn, serveursIce } from '../../src/modules/seances/turn.ts';

const u = (id: number, prenom: string) => ({ id, prenom, couleur: null });

function salle(film: string | null = 'f1') {
  let t = 1_000_000;
  const s = new Salle({ filmId: film, position: 0, pisteAudio: null, sousTitres: null }, () => t);
  s.ajouter('a', u(1, 'Ana'));
  s.ajouter('b', u(2, 'Ben'));
  return { s, avancer: (ms: number) => { t += ms; } };
}

describe('salle : état partagé', () => {
  test('lecture, pause et position qui avance', () => {
    const { s, avancer } = salle();
    assert.equal(s.lire('a', 10), 'lecture');
    avancer(2000);
    assert.equal(s.positionAttendue(), 12);
    assert.equal(s.pause('b', 12.5), 'pause');
    assert.equal(s.instantane().lecture, false);
    assert.equal(s.instantane().position, 12.5);
  });

  test('un inconnu ne peut rien commander', () => {
    const { s } = salle();
    assert.equal(s.lire('zz', 1), null);
    assert.equal(s.pause('zz'), null);
  });

  test('aller change la position sans toucher à la lecture', () => {
    const { s } = salle();
    s.lire('a', 0);
    assert.equal(s.aller('a', 300), 'aller');
    assert.equal(s.instantane().lecture, true);
    assert.equal(s.instantane().position, 300);
    assert.equal(s.aller('a', -4), null);
  });

  test('changer de film remet tout le monde en pause à 0, sans pistes', () => {
    const { s } = salle();
    s.lire('a', 50); s.audio('a', 2); s.sousTitresChoix('a', 'p1');
    assert.equal(s.film('a', 'f2'), 'film');
    const e = s.instantane();
    assert.deepEqual([e.filmId, e.lecture, e.position, e.pisteAudio, e.sousTitres], ['f2', false, 0, null, null]);
  });

  test('audio et sous-titres mettent en pause à la même position', () => {
    const { s, avancer } = salle();
    s.lire('a', 20); avancer(1000);
    assert.equal(s.audio('b', 1), 'audio');
    let e = s.instantane();
    assert.equal(e.lecture, false); assert.equal(e.position, 21); assert.equal(e.pisteAudio, 1);
    assert.equal(s.sousTitresChoix('a', 'e4'), 'sous_titres');
    e = s.instantane();
    assert.equal(e.sousTitres, 'e4'); assert.equal(e.position, 21);
  });

  test('version croissante à chaque changement', () => {
    const { s } = salle();
    const v0 = s.instantane().version;
    s.lire('a', 0); s.pause('a', 1);
    assert.equal(s.instantane().version, v0 + 2);
  });
});

describe('salle : attente mutuelle', () => {
  test('tampon arrête la lecture, la fin du tampon la reprend', () => {
    const { s } = salle();
    s.lire('a', 5);
    assert.equal(s.tampon('b', true), 'tampon');
    assert.equal(s.instantane().lecture, false);
    assert.deepEqual(s.instantane().attente, ['b']);
    assert.equal(s.tampon('b', false), 'reprise');
    assert.equal(s.instantane().lecture, true);
    assert.deepEqual(s.instantane().attente, []);
  });

  test('lecture demandée pendant un tampon : elle démarre quand il finit', () => {
    const { s } = salle();
    s.tampon('b', true);
    s.lire('a', 0);
    assert.equal(s.instantane().lecture, false);
    assert.equal(s.tampon('b', false), 'reprise');
    assert.equal(s.instantane().lecture, true);
  });

  test('une pause explicite annule la reprise', () => {
    const { s } = salle();
    s.lire('a', 5); s.tampon('b', true); s.pause('a', 5);
    assert.equal(s.tampon('b', false), 'tampon');
    assert.equal(s.instantane().lecture, false);
  });

  test('« ne plus attendre » : retire de l\'attente et reprend', () => {
    const { s } = salle();
    s.lire('a', 5); s.tampon('b', true);
    assert.equal(s.ignorerAttente('a', 'b'), 'reprise');
    assert.equal(s.instantane().lecture, true);
    assert.equal(s.ignorerAttente('a', 'b'), null);
  });

  test('« ne plus attendre » sans reprise attendue : attente-ignoree', () => {
    const { s } = salle();
    s.tampon('b', true);
    assert.equal(s.ignorerAttente('a', 'b'), 'attente-ignoree');
  });

  test('le film remet l\'attente à zéro', () => {
    const { s } = salle();
    s.tampon('b', true); s.film('a', 'f2');
    assert.deepEqual(s.instantane().attente, []);
  });
});

describe('salle : départ et retour', () => {
  test('le départ met la lecture en pause pour les restants', () => {
    const { s, avancer } = salle();
    s.lire('a', 0); avancer(3000);
    const r = s.retirer('b');
    assert.equal(r.raison, 'depart');
    assert.equal(s.instantane().lecture, false);
    assert.equal(s.instantane().position, 3);
  });

  test('départ en pause : rien à diffuser', () => {
    const { s } = salle();
    assert.equal(s.retirer('b').raison, null);
  });

  test('le départ de celui qu\'on attendait relance la lecture suspendue', () => {
    const { s } = salle();
    s.lire('a', 0); s.tampon('b', true);
    assert.equal(s.retirer('b').raison, 'reprise');
    assert.equal(s.instantane().lecture, true);
  });

  test('un autre onglet du même compte : pas de pause', () => {
    const { s } = salle();
    s.ajouter('b2', u(2, 'Ben'));
    s.lire('a', 0);
    assert.equal(s.retirer('b').raison, null);
    assert.equal(s.instantane().lecture, true);
  });

  test('le dernier à partir : l\'état est conservé', () => {
    const { s } = salle();
    s.aller('a', 77); s.retirer('b'); s.retirer('a');
    assert.equal(s.aEnregistrer().position, 77);
  });
});

describe('salle : compte à rebours', () => {
  test('pause, puis lecture à la fin, annulable', () => {
    const { s } = salle();
    s.lire('a', 30);
    assert.equal(s.demarrerCompteARebours('a'), 'compte_a_rebours');
    assert.equal(s.instantane().lecture, false);
    assert.equal(s.instantane().compteARebours, 3);
    const id = s.idCompte;
    assert.equal(s.finCompteARebours(id), 'compte_a_rebours');
    assert.equal(s.instantane().lecture, true);
    assert.equal(s.instantane().compteARebours, null);

    s.pause('a', 40);
    s.demarrerCompteARebours('a');
    const id2 = s.idCompte;
    s.pause('b', 40);
    assert.equal(s.finCompteARebours(id2), null);
    assert.equal(s.instantane().lecture, false);
  });

  test('sans film : refusé', () => {
    const { s } = salle(null);
    assert.equal(s.demarrerCompteARebours('a'), null);
  });

  test('quelqu\'un charge encore à la fin : attend', () => {
    const { s } = salle();
    s.demarrerCompteARebours('a'); s.tampon('b', true);
    s.finCompteARebours(s.idCompte);
    assert.equal(s.instantane().lecture, false);
    assert.equal(s.tampon('b', false), 'reprise');
    assert.equal(s.instantane().lecture, true);
  });
});

describe('seau à jetons', () => {
  test('5 d\'un coup puis 5 par seconde', () => {
    let t = 0;
    const seau = new Seau(5, 5, () => t);
    for (let i = 0; i < 5; i++) assert.equal(seau.prendre(), true);
    assert.equal(seau.prendre(), false);
    t += 400;
    assert.equal(seau.prendre(), true);
    assert.equal(seau.prendre(), true);
    assert.equal(seau.prendre(), false);
  });
});

describe('TURN', () => {
  test('identifiants temporaires façon coturn', () => {
    const a = identifiantsTurn('secret', 1_000_000_000, 3600);
    assert.equal(a.username, String(1_000_000 + 3600));
    assert.match(a.credential, /^[A-Za-z0-9+/]+=*$/);
    assert.notEqual(a.credential, identifiantsTurn('autre', 1_000_000_000, 3600).credential);
  });
  test('sans secret : STUN seulement', () => {
    const l = serveursIce({ ice: [{ urls: 'stun:x' }], turnUrls: ['turn:t'], turnSecret: '' });
    assert.equal(l.length, 1);
    assert.equal(serveursIce({ ice: [{ urls: 'stun:x' }], turnUrls: ['turn:t'], turnSecret: 's' }).length, 2);
  });
});
