import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { DELAI_TAMPON, MoteurSynchro } from './moteur.ts';
import type { EtatSeance, LecteurVideo, MessageClient } from './types.ts';

class FauxLecteur implements LecteurVideo {
  currentTime = 0;
  paused = true;
  playbackRate = 1;
  readyState = 4;
  seeking = false;
  duration = 7200;
  refuser = false;
  lancements = 0;
  play(): Promise<void> {
    this.lancements++;
    if (this.refuser) return Promise.reject(new DOMException('refus', 'NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void { this.paused = true; }
}

function etat(p: Partial<EtatSeance> = {}): EtatSeance {
  return { filmId: 'f1', lecture: false, position: 0, instant: 0, version: 1, attente: [], pisteAudio: null, sousTitres: null, compteARebours: null, serveur: 0, ...p };
}

let maintenant = 100_000;
let video: FauxLecteur;
let envoyes: MessageClient[];
let bloques: boolean[];
let m: MoteurSynchro;

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  maintenant = 100_000;
  video = new FauxLecteur();
  envoyes = [];
  bloques = [];
  m = new MoteurSynchro({ video, horloge: { serveurMaintenant: () => maintenant }, envoyer: (x) => envoyes.push(x), cid: () => 'moi', surBloque: (b) => bloques.push(b) });
});
afterEach(() => mock.timers.reset());

test('un état en lecture lance le lecteur et le cale sur la position attendue, sans rien renvoyer', () => {
  m.appliquerEtat(etat({ lecture: true, position: 60, instant: maintenant - 2000 }));
  assert.equal(video.paused, false);
  assert.equal(video.currentTime, 62);
  assert.deepEqual(envoyes, []);
});

test('un état en pause arrête le lecteur et le cale', () => {
  video.paused = false;
  video.currentTime = 10;
  m.appliquerEtat(etat({ lecture: false, position: 30 }));
  assert.equal(video.paused, true);
  assert.equal(video.currentTime, 30);
});

test('petit écart : vitesse 1,05 ou 0,95, retour à 1 quand c’est rattrapé', () => {
  video.paused = false;
  video.currentTime = 59.5;
  m.appliquerEtat(etat({ lecture: true, position: 60, instant: maintenant }));
  assert.equal(video.playbackRate, 1.05);
  video.currentTime = 60.52;
  m.tic();
  assert.equal(video.playbackRate, 0.95);
  video.currentTime = 60;
  m.tic();
  assert.equal(video.playbackRate, 1);
});

test('lecture automatique bloquée : surBloque, plus de nouvel essai, puis « Reprendre ici »', async () => {
  video.refuser = true;
  m.appliquerEtat(etat({ lecture: true, position: 0, instant: maintenant }));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(m.bloque, true);
  assert.deepEqual(bloques, [true]);
  m.tic();
  assert.equal(video.lancements, 1);
  video.refuser = false;
  m.reprendreIci();
  assert.equal(m.bloque, false);
  assert.equal(video.lancements, 2);
  assert.deepEqual(bloques, [true, false]);
});

test('pas de saut pendant un seek ni de correction pendant que le film charge', () => {
  video.seeking = true;
  video.currentTime = 0;
  m.appliquerEtat(etat({ lecture: true, position: 50, instant: maintenant }));
  assert.equal(video.currentTime, 0);
  video.seeking = false;
  video.paused = false;
  video.readyState = 2;
  m.tic();
  assert.equal(video.currentTime, 0);
});

test('tampon : signalé après 1 s de chargement seulement, levé quand le lecteur est prêt', () => {
  m.surWaiting();
  mock.timers.tick(DELAI_TAMPON - 1);
  assert.deepEqual(envoyes, []);
  video.readyState = 2;
  mock.timers.tick(1);
  assert.deepEqual(envoyes, [{ t: 'tampon', enCours: true }]);
  video.readyState = 4;
  m.surPret();
  assert.deepEqual(envoyes.at(-1), { t: 'tampon', enCours: false });
  assert.equal(envoyes.length, 2);
});

test('un chargement bref ne signale rien', () => {
  m.surWaiting();
  mock.timers.tick(400);
  m.surPret();
  mock.timers.tick(5000);
  assert.deepEqual(envoyes, []);
});

test('nouveau film : tampon tout de suite ; à la reconnexion on le redit si on charge encore', () => {
  m.surChargement();
  assert.deepEqual(envoyes, [{ t: 'tampon', enCours: true }]);
  video.readyState = 1;
  m.surReconnexion();
  assert.equal(envoyes.length, 2);
  assert.deepEqual(envoyes[1], { t: 'tampon', enCours: true });
});

test('attente périmée : le serveur nous croit en chargement alors qu’on est prêt', () => {
  m.tamponEnvoye = true;
  m.appliquerEtat(etat({ attente: ['moi'] }));
  assert.deepEqual(envoyes, [{ t: 'tampon', enCours: false }]);
});

test('commandes : lecture, pause, aller bornés', () => {
  video.currentTime = 33;
  m.appliquerEtat(etat({ lecture: false, position: 33 }));
  m.basculer();
  assert.deepEqual(envoyes.at(-1), { t: 'lecture', position: 33 });
  m.appliquerEtat(etat({ lecture: true, position: 33, instant: maintenant }));
  m.basculer();
  assert.deepEqual(envoyes.at(-1), { t: 'pause', position: video.currentTime });
  m.aller(-4);
  assert.deepEqual(envoyes.at(-1), { t: 'aller', position: 0 });
  m.aller(99_999);
  assert.deepEqual(envoyes.at(-1), { t: 'aller', position: 7200 });
});

test('fin du film : pause avec fin, seulement si la lecture tournait', () => {
  m.appliquerEtat(etat({ lecture: false }));
  m.surFin();
  assert.deepEqual(envoyes, []);
  m.appliquerEtat(etat({ lecture: true, position: 7200, instant: maintenant }));
  m.surFin();
  assert.deepEqual(envoyes, [{ t: 'pause', position: 7200, fin: true }]);
});

test('resynchroniser : saute à la position du groupe', () => {
  m.appliquerEtat(etat({ lecture: true, position: 100, instant: maintenant }));
  video.currentTime = 90;
  m.resynchroniser();
  assert.equal(video.currentTime, 100);
});
