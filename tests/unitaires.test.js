'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { srtVersVtt, versVtt } = require('../src/srt');
const auth = require('../src/auth');
const { identifiantsTurn, serveursIce } = require('../src/turn');
const { Salon } = require('../src/salon');
const films = require('../src/films');
const { charger } = require('../src/config');
const Sync = require('../public/js/sync');
const Son = require('../public/js/son');

test('SRT -> WebVTT : en-tête, virgules en points, index conservés ou retirés', () => {
  const srt = '﻿1\r\n00:00:01,500 --> 00:00:03,000\r\nBonjour !\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,250\r\nÀ <i>bientôt</i>\r\nsuite\r\n';
  const vtt = srtVersVtt(srt);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.match(vtt, /00:00:01\.500 --> 00:00:03\.000\nBonjour !/);
  assert.match(vtt, /00:00:04\.000 --> 00:00:05\.250\nÀ <i>bientôt<\/i>\nsuite/);
  assert.ok(!vtt.includes(','), 'plus de virgule dans les minutages');
  assert.ok(!/^1$/m.test(vtt), 'index retirés');
});

test('SRT : repli Windows-1252 quand l\'UTF-8 est invalide, et .vtt laissé tel quel', () => {
  const latin = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nCaf\xe9\n', 'latin1');
  assert.match(versVtt(latin, '.srt'), /Café/);
  assert.equal(versVtt(Buffer.from('WEBVTT\n\n00:01.000 --> 00:02.000\nx\n'), '.vtt').slice(0, 6), 'WEBVTT');
});

test('cookies : jeton signé valide, falsifié, expiré, mauvais secret', () => {
  const j = auth.creerJeton('secret', { prenom: 'Ama' }, 1_000_000, 100);
  assert.equal(auth.verifierJeton('secret', j, 1_000_000).prenom, 'Ama');
  assert.equal(auth.verifierJeton('autre', j, 1_000_000), null);
  assert.equal(auth.verifierJeton('secret', j, 1_000_000 + 101_000), null);
  const [charge, sig] = j.split('.');
  const faux = Buffer.from(JSON.stringify({ prenom: 'Pirate', exp: 9e9 })).toString('base64url');
  assert.equal(auth.verifierJeton('secret', `${faux}.${sig}`), null);
  assert.equal(auth.verifierJeton('secret', charge), null);
  assert.equal(auth.verifierJeton('secret', 'n.importe.quoi'), null);
  assert.equal(auth.verifierJeton('secret', undefined), null);
});

test('cookie de session : HttpOnly, SameSite=Lax, Secure seulement en HTTPS', () => {
  assert.match(auth.cookieSession('x'), /HttpOnly; SameSite=Lax/);
  assert.ok(!/Secure/.test(auth.cookieSession('x')));
  assert.match(auth.cookieSession('x', { securise: true }), /; Secure$/);
  assert.equal(auth.lireCookies('a=1; canape_session=abc%3D; b=2').canape_session, 'abc=');
});

test('comparaison à temps constant et limiteur d\'essais', () => {
  assert.ok(auth.egauxTempsConstant('abc', 'abc'));
  assert.ok(!auth.egauxTempsConstant('abc', 'abd'));
  assert.ok(!auth.egauxTempsConstant('abc', 'abcd'));
  let t = 0;
  const l = new auth.Limiteur({ max: 5, fenetreMs: 60000, maintenant: () => t });
  for (let i = 0; i < 5; i++) { assert.ok(!l.bloque('ip')); l.echec('ip'); }
  assert.ok(l.bloque('ip'));
  assert.ok(!l.bloque('autre'));
  t = 61000;
  assert.ok(!l.bloque('ip'));
});

test('TURN : identifiants temporaires façon coturn use-auth-secret', () => {
  const maintenant = 1_700_000_000_000;
  const { username, credential } = identifiantsTurn('s3cret', maintenant, 3600);
  assert.equal(username, String(1_700_000_000 + 3600));
  assert.equal(credential, crypto.createHmac('sha1', 's3cret').update(username).digest('base64'));
  const ice = serveursIce({ ice: [{ urls: 'stun:x' }], turnUrls: ['turn:t:3478'], turnSecret: 's3cret' }, maintenant);
  assert.equal(ice.length, 2);
  assert.deepEqual(ice[1].urls, ['turn:t:3478']);
  assert.equal(ice[1].credential.length > 10, true);
  assert.equal(serveursIce({ ice: [{ urls: 'stun:x' }], turnUrls: ['turn:t'], turnSecret: '' }).length, 1);
});

test('configuration : défauts, fichier, priorité de l\'environnement', () => {
  const d = charger({});
  assert.equal(d.port, 8080); assert.equal(d.hote, '0.0.0.0'); assert.equal(d.motDePasse, '');
  assert.equal(d.secretAleatoire, true); assert.equal(d.ice[0].urls, 'stun:stun.l.google.com:19302');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'canape-')), 'c.conf');
  fs.writeFileSync(f, '# commentaire\nCANAPE_PORT=9000\nCANAPE_MOT_DE_PASSE="a b"\nCANAPE_SECRET=xyz\n');
  const c = charger({ CANAPE_PORT: '9100' }, f);
  assert.equal(c.port, 9100); assert.equal(c.motDePasse, 'a b'); assert.equal(c.secret, 'xyz'); assert.equal(c.secretAleatoire, false);
  assert.throws(() => charger({ CANAPE_ICE: 'pas du json' }), /CANAPE_ICE/);
  assert.throws(() => charger({ CANAPE_PORT: 'abc' }), /CANAPE_PORT/);
});

test('protection des chemins : .., absolu, octet nul, lien symbolique vers l\'extérieur', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canape-chemins-'));
  const racine = path.join(base, 'films'); fs.mkdirSync(path.join(racine, 'sous'), { recursive: true });
  fs.writeFileSync(path.join(base, 'secret.mp4'), 'secret');
  fs.writeFileSync(path.join(racine, 'ok.mp4'), 'ok');
  fs.writeFileSync(path.join(racine, 'sous', 'b.mp4'), 'b');
  fs.symlinkSync(path.join(base, 'secret.mp4'), path.join(racine, 'lien.mp4'));
  fs.symlinkSync(path.join(racine, 'ok.mp4'), path.join(racine, 'interne.mp4'));
  assert.ok(await films.resoudre(racine, 'ok.mp4'));
  assert.ok(await films.resoudre(racine, 'sous/b.mp4'));
  assert.ok(await films.resoudre(racine, 'interne.mp4'), 'lien interne autorisé');
  assert.equal(await films.resoudre(racine, '../secret.mp4'), null);
  assert.equal(await films.resoudre(racine, 'sous/../../secret.mp4'), null);
  assert.equal(await films.resoudre(racine, path.join(base, 'secret.mp4')), null);
  assert.equal(await films.resoudre(racine, 'lien.mp4'), null);
  assert.equal(await films.resoudre(racine, 'ok.mp4\0.txt'), null);
  assert.equal(await films.resoudre(racine, 'absent.mp4'), null);
  const liste = await films.lister(racine, { sonde: false });
  assert.deepEqual(liste.map((f) => f.chemin).sort(), ['interne.mp4', 'ok.mp4', 'sous/b.mp4']);
});

test('liste des films : sous-titres associés, langue, titre', async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'canape-liste-'));
  fs.mkdirSync(path.join(racine, 'Classiques'));
  for (const n of ['Mon_Film.mp4', 'Mon_Film.fr.srt', 'Mon_Film.en.vtt', 'Autre.mp4', 'Mon_Film_2.srt', 'notes.txt']) {
    fs.writeFileSync(path.join(racine, 'Classiques', n), 'x');
  }
  const [a, b] = await films.lister(racine, { sonde: false });
  assert.equal(a.titre, 'Autre'); assert.equal(a.sousTitres.length, 0);
  assert.equal(b.titre, 'Mon Film'); assert.equal(b.dossier, 'Classiques');
  assert.deepEqual(b.sousTitres.map((s) => s.langue).sort(), ['en', 'fr']);
  assert.equal(b.sousTitres.find((s) => s.langue === 'fr').chemin, 'Classiques/Mon_Film.fr.srt');
});

// ---- salon ----
function salonTest() {
  let t = 10_000;
  const s = new Salon({ maintenant: () => t });
  return { s, avancer: (ms) => { t += ms; }, a: s.ajouter('Ama'), b: s.ajouter('Kofi') };
}

test('salon : lecture, position attendue, pause', () => {
  const { s, avancer, a } = salonTest();
  s.action(a.id, { type: 'film', film: 'x.mp4' });
  assert.equal(s.action(a.id, { type: 'lecture', position: 5 }), 'lecture');
  avancer(2000);
  assert.equal(s.positionAttendue(), 7);
  assert.equal(s.action(a.id, { type: 'pause', position: 7.2 }), 'pause');
  avancer(5000);
  assert.equal(s.positionAttendue(), 7.2);
  assert.equal(s.action(a.id, { type: 'position', position: 30 }), 'position');
  assert.equal(s.instantane().position, 30);
  assert.equal(s.instantane().version, 4);
});

test('salon : choix de film remet à zéro, positions invalides ignorées, inconnu refusé', () => {
  const { s, a } = salonTest();
  s.action(a.id, { type: 'lecture', position: 50 });
  s.action(a.id, { type: 'film', film: 'y.mp4' });
  const e = s.instantane();
  assert.equal(e.film, 'y.mp4'); assert.equal(e.lecture, false); assert.equal(e.position, 0);
  s.action(a.id, { type: 'position', position: -5 }); // ignorée : repart de la position attendue
  assert.equal(s.instantane().position, 0);
  assert.equal(s.action(a.id, { type: 'danse' }), null);
  assert.equal(s.action(999, { type: 'pause' }), null);
});

test('salon : attente mutuelle quand un participant charge, reprise quand tous sont prêts', () => {
  const { s, avancer, a, b } = salonTest();
  s.action(a.id, { type: 'lecture', position: 0 });
  avancer(3000);
  assert.equal(s.tampon(b.id, true), 'attente');
  let e = s.instantane();
  assert.equal(e.lecture, false); assert.equal(e.position, 3); assert.deepEqual(e.attente, ['Kofi']);
  avancer(4000);
  assert.equal(s.positionAttendue(), 3, 'figé pendant l\'attente');
  assert.equal(s.tampon(b.id, false), 'reprise');
  e = s.instantane();
  assert.equal(e.lecture, true); assert.deepEqual(e.attente, []);
  assert.equal(s.tampon(b.id, false), null);
});

test('salon : lecture demandée pendant un chargement = reprise différée ; départ du retardataire = reprise', () => {
  const { s, a, b } = salonTest();
  s.tampon(b.id, true);
  assert.equal(s.action(a.id, { type: 'lecture', position: 1 }), 'lecture-attente');
  assert.equal(s.instantane().lecture, false);
  const { reprise } = s.retirer(b.id);
  assert.equal(reprise, 'reprise');
  assert.equal(s.instantane().lecture, true);
});

test('salon : 4 participants au plus, prénoms nettoyés', () => {
  const s = new Salon();
  for (let i = 0; i < 4; i++) assert.ok(s.ajouter('P' + i));
  assert.ok(s.complet);
  assert.equal(s.ajouter('Cinq'), null);
  const p = new Salon().ajouter('  <b>Ama</b>\n  ');
  assert.equal(p.prenom, 'bAma/b');
  assert.equal(new Salon().ajouter('').prenom, 'Invité');
});

// ---- synchronisation côté client ----
test('rattrapage : saut > 1 s, vitesse entre 0,3 et 1 s, retour à la normale', () => {
  assert.deepEqual(Sync.decision(1.5, true), { saut: true });
  assert.deepEqual(Sync.decision(-2, true), { saut: true });
  assert.deepEqual(Sync.decision(0.5, true), { vitesse: 1.05 });
  assert.deepEqual(Sync.decision(-0.5, true), { vitesse: 0.95 });
  assert.deepEqual(Sync.decision(0.05, true, 1.05), { vitesse: 1 });
  assert.deepEqual(Sync.decision(0.2, true, 1.05), { vitesse: 1.05 }, 'hystérésis');
  assert.deepEqual(Sync.decision(0.2, true, 1), { vitesse: 1 });
  assert.deepEqual(Sync.decision(0.4, false), { saut: true });
  assert.deepEqual(Sync.decision(0.01, false), { vitesse: 1 });
});

test('horloge : décalage estimé par ping/pong, meilleur échantillon (plus petit aller-retour)', () => {
  // horloge serveur en avance de 500 ms ; aller-retour 100 ms symétrique
  const e = Sync.echantillon(1000, 1000 + 50 + 500, 1100);
  assert.equal(e.rtt, 100); assert.equal(e.decalage, 500);
  const bruit = Sync.echantillon(1000, 1000 + 400 + 500, 1500); // aller-retour 500, asymétrique
  assert.equal(Sync.meilleurDecalage([bruit, e]), 500);
  assert.equal(Sync.meilleurDecalage([]), 0);
  assert.equal(Sync.positionAttendue({ lecture: true, position: 10, instant: 5000 }, 7500), 12.5);
  assert.equal(Sync.positionAttendue({ lecture: false, position: 10, instant: 5000 }, 9000), 10);
  assert.equal(Sync.formaterTemps(3725), '1:02:05'); assert.equal(Sync.formaterTemps(65), '1:05');
});

test('son : le film baisse d\'environ 40 % quand on parle, puis remonte en douceur', () => {
  let f = 1;
  for (let i = 0; i < 30; i++) f = Son.facteurSuivant(f, true, true);
  assert.ok(Math.abs(f - 0.6) < 0.01);
  for (let i = 0; i < 30; i++) f = Son.facteurSuivant(f, false, true);
  assert.ok(f > 0.99);
  assert.equal(Son.facteurSuivant(1, true, false), 1, 'option désactivée');
  const v = new Son.Voix(0.02, 700);
  assert.ok(v.mettreAJour(0.1, 1000)); assert.ok(v.parle(1500)); assert.ok(!v.parle(1800));
});
