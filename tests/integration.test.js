'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { charger } = require('../src/config');
const { creer } = require('../src/serveur');
const journal = require('../src/journal');
journal.silence(true);

const CONTENU = Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 251));

function preparerFilms() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canape-int-'));
  const racine = path.join(base, 'films');
  fs.mkdirSync(path.join(racine, 'sous'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'film.mp4'), CONTENU);
  fs.writeFileSync(path.join(racine, 'film.fr.srt'), '1\n00:00:01,000 --> 00:00:02,000\nSalut\n');
  fs.writeFileSync(path.join(racine, 'sous', 'autre.webm'), 'webm');
  fs.writeFileSync(path.join(base, 'secret.txt'), 'SECRET');
  fs.writeFileSync(path.join(base, 'secret.mp4'), 'SECRET');
  fs.symlinkSync(path.join(base, 'secret.mp4'), path.join(racine, 'evasion.mp4'));
  return { base, racine };
}

async function lancer(extra = {}) {
  const { racine } = preparerFilms();
  const config = charger({ CANAPE_FILMS: racine, CANAPE_MOT_DE_PASSE: 'sesame', CANAPE_SECRET: 'abc', CANAPE_HOTE: '127.0.0.1', CANAPE_PORT: '0', ...extra });
  const app = creer(config);
  const { port } = await app.demarrer();
  const url = `http://127.0.0.1:${port}`;
  return { app, port, url, config };
}

async function connexion(url, prenom = 'Ama', mdp = 'sesame') {
  const r = await fetch(url + '/api/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prenom, motDePasse: mdp }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { r, cookie };
}

// Requête brute : fetch normalise les « .. » dans l'URL, pas http.request.
function brut(port, chemin, cookie) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: chemin, headers: cookie ? { Cookie: cookie } : {} }, (res) => {
      const morceaux = []; res.on('data', (c) => morceaux.push(c));
      res.on('end', () => resolve({ status: res.statusCode, corps: Buffer.concat(morceaux).toString() }));
    });
    req.on('error', reject); req.end();
  });
}

class Client {
  constructor(port, cookie, entetes = {}) {
    this.msgs = []; this.attentes = [];
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: cookie, ...entetes } });
    this.ws.on('message', (d) => { const m = JSON.parse(d); this.msgs.push(m); this.attentes = this.attentes.filter((a) => !a(m)); });
    this.ouvert = new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); this.ws.on('unexpected-response', (q, r) => rej(Object.assign(new Error('refus'), { status: r.statusCode }))); });
  }
  recevoir(pred, ms = 3000) {
    const deja = this.msgs.find(pred); if (deja) return Promise.resolve(deja);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('délai dépassé')), ms);
      this.attentes.push((m) => { if (pred(m)) { clearTimeout(t); resolve(m); return true; } return false; });
    });
  }
  envoyer(m) { this.ws.send(JSON.stringify(m)); }
  fermer() { this.ws.close(); }
}

test('santé et connexion : /api/etat libre, 401 sans session, cookie HttpOnly après connexion', async () => {
  const { app, url } = await lancer();
  try {
    const etat = await (await fetch(url + '/api/etat')).json();
    assert.deepEqual({ ...etat, version: undefined }, { version: undefined, connecte: false, motDePasseRequis: true, prenom: null });
    assert.equal((await fetch(url + '/api/films')).status, 401);
    assert.equal((await fetch(url + '/films/film.mp4')).status, 401);
    const { r, cookie } = await connexion(url);
    assert.equal(r.status, 204);
    assert.match(r.headers.get('set-cookie'), /HttpOnly/);
    assert.match(r.headers.get('set-cookie'), /SameSite=Lax/);
    assert.ok(!/Secure/.test(r.headers.get('set-cookie')));
    const e2 = await (await fetch(url + '/api/etat', { headers: { Cookie: cookie } })).json();
    assert.equal(e2.connecte, true); assert.equal(e2.prenom, 'Ama');
    const pageAccueil = await fetch(url + '/');
    assert.equal(pageAccueil.status, 200);
    assert.match(await pageAccueil.text(), /Canapé/);
    assert.equal((await fetch(url + '/js/app.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  } finally { await app.arreter(); }
});

test('mot de passe erroné : 401 puis 429 après 5 essais par minute', async () => {
  const { app, url } = await lancer();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await connexion(url, 'X', 'faux')).r.status, 401);
    const bloque = await connexion(url, 'X', 'sesame');
    assert.equal(bloque.r.status, 429);
    assert.ok(bloque.r.headers.get('retry-after'));
  } finally { await app.arreter(); }
});

test('Secure derrière un proxy HTTPS (X-Forwarded-Proto)', async () => {
  const { app, url } = await lancer({ CANAPE_DERRIERE_PROXY: '1' });
  try {
    const r = await fetch(url + '/api/connexion', { method: 'POST', headers: { 'x-forwarded-proto': 'https', 'Content-Type': 'application/json' }, body: JSON.stringify({ motDePasse: 'sesame', prenom: 'A' }) });
    assert.match(r.headers.get('set-cookie'), /; Secure/);
  } finally { await app.arreter(); }
});

test('accès libre : sans mot de passe configuré, tout passe', async () => {
  const { app, url } = await lancer({ CANAPE_MOT_DE_PASSE: '' });
  try {
    assert.equal((await fetch(url + '/api/films')).status, 200);
    assert.equal((await connexion(url, 'Libre', '')).r.status, 204);
  } finally { await app.arreter(); }
});

test('films : liste avec sous-titres, Range -> 206 avec les bons octets, HEAD, 416', async () => {
  const { app, url } = await lancer();
  try {
    const { cookie } = await connexion(url);
    const h = { Cookie: cookie };
    const { films } = await (await fetch(url + '/api/films', { headers: h })).json();
    assert.deepEqual(films.map((f) => f.chemin), ['film.mp4', 'sous/autre.webm']);
    assert.equal(films[0].sousTitres[0].chemin, 'film.fr.srt');

    const plein = await fetch(url + '/films/film.mp4', { headers: h });
    assert.equal(plein.status, 200);
    assert.equal(plein.headers.get('accept-ranges'), 'bytes');
    assert.equal(plein.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(Buffer.from(await plein.arrayBuffer()), CONTENU);

    const r1 = await fetch(url + '/films/film.mp4', { headers: { ...h, Range: 'bytes=100-199' } });
    assert.equal(r1.status, 206);
    assert.equal(r1.headers.get('content-range'), 'bytes 100-199/2000');
    assert.equal(r1.headers.get('content-length'), '100');
    assert.deepEqual(Buffer.from(await r1.arrayBuffer()), CONTENU.subarray(100, 200));

    const r2 = await fetch(url + '/films/film.mp4', { headers: { ...h, Range: 'bytes=1900-' } });
    assert.equal(r2.status, 206);
    assert.deepEqual(Buffer.from(await r2.arrayBuffer()), CONTENU.subarray(1900));
    const r3 = await fetch(url + '/films/film.mp4', { headers: { ...h, Range: 'bytes=-50' } });
    assert.deepEqual(Buffer.from(await r3.arrayBuffer()), CONTENU.subarray(1950));
    assert.equal((await fetch(url + '/films/film.mp4', { headers: { ...h, Range: 'bytes=5000-6000' } })).status, 416);
    const tete = await fetch(url + '/films/film.mp4', { method: 'HEAD', headers: h });
    assert.equal(tete.headers.get('content-length'), '2000');
    assert.equal((await fetch(url + '/films/sous/autre.webm', { headers: h })).headers.get('content-type'), 'video/webm');
  } finally { await app.arreter(); }
});

test('sous-titres : .srt servi en WebVTT', async () => {
  const { app, url } = await lancer();
  try {
    const { cookie } = await connexion(url);
    const r = await fetch(url + '/sous-titres/film.fr.srt', { headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/vtt/);
    const t = await r.text();
    assert.ok(t.startsWith('WEBVTT'));
    assert.match(t, /00:00:01\.000 --> 00:00:02\.000\nSalut/);
  } finally { await app.arreter(); }
});

test('sécurité des chemins : ../, %2e%2e, lien symbolique, fichiers non vidéo refusés', async () => {
  const { app, url, port } = await lancer();
  try {
    const { cookie } = await connexion(url);
    for (const chemin of ['/films/../secret.mp4', '/films/%2e%2e/secret.mp4', '/films/..%2fsecret.mp4', '/films/sous/..%2f..%2fsecret.mp4',
      '/films/evasion.mp4', '/films/%2Fetc%2Fpasswd', '/sous-titres/..%2fsecret.txt', '/films/film.mp4%00.txt', '/%2e%2e/%2e%2e/etc/passwd', '/../package.json']) {
      const r = await brut(port, chemin, cookie);
      assert.ok([400, 403, 404].includes(r.status), `${chemin} -> ${r.status}`);
      assert.ok(!r.corps.includes('SECRET'), `${chemin} fuit le contenu`);
    }
    const lien = (await (await fetch(url + '/api/films', { headers: { Cookie: cookie } })).json()).films.map((f) => f.chemin);
    assert.ok(!lien.includes('evasion.mp4'), 'le lien vers l\'extérieur n\'est pas listé');
  } finally { await app.arreter(); }
});

test('/api/config : serveurs ICE avec identifiants TURN temporaires', async () => {
  const { app, url } = await lancer({ CANAPE_TURN_URLS: 'turn:exemple.fr:3478', CANAPE_TURN_SECRET: 'partage' });
  try {
    const { cookie } = await connexion(url);
    const { iceServers } = await (await fetch(url + '/api/config', { headers: { Cookie: cookie } })).json();
    const turn = iceServers.find((s) => s.username);
    assert.deepEqual(turn.urls, ['turn:exemple.fr:3478']);
    assert.ok(Number(turn.username) * 1000 > Date.now());
    assert.equal((await fetch(url + '/api/config')).status, 401);
  } finally { await app.arreter(); }
});

test('WebSocket : refus sans session, Origin étrangère, et au-delà de 4 participants', async () => {
  const { app, port, url } = await lancer();
  try {
    await assert.rejects(new Client(port, 'canape_session=nimporte').ouvert, (e) => e.status === 401);
    const { cookie } = await connexion(url);
    await assert.rejects(new Client(port, cookie, { Origin: 'http://pirate.example' }).ouvert, (e) => e.status === 403);
    const ok = new Client(port, cookie, { Origin: `http://127.0.0.1:${port}` });
    await ok.ouvert; ok.fermer();
    const clients = [];
    for (let i = 0; i < 4; i++) { const c = new Client(port, cookie); await c.ouvert; clients.push(c); }
    await assert.rejects(new Client(port, cookie).ouvert, (e) => e.status === 503);
    clients.forEach((c) => c.fermer());
  } finally { await app.arreter(); }
});

test('WebSocket : deux clients, bienvenue, pause relayée, film, attente mutuelle, départ', async () => {
  const { app, port, url } = await lancer();
  try {
    const a = new Client(port, (await connexion(url, 'Ama')).cookie); await a.ouvert;
    const bienvenueA = await a.recevoir((m) => m.type === 'bienvenue');
    assert.equal(bienvenueA.participants.length, 0);
    const b = new Client(port, (await connexion(url, 'Kofi')).cookie); await b.ouvert;
    const bienvenueB = await b.recevoir((m) => m.type === 'bienvenue');
    assert.deepEqual(bienvenueB.participants.map((p) => p.prenom), ['Ama']);
    const arrivee = await a.recevoir((m) => m.type === 'arrivee');
    assert.equal(arrivee.participant.prenom, 'Kofi');

    a.envoyer({ type: 'film', film: 'film.mp4' });
    const e1 = await b.recevoir((m) => m.type === 'etat' && m.raison === 'film');
    assert.equal(e1.etat.film, 'film.mp4');
    assert.equal(e1.par, bienvenueA.id);
    a.envoyer({ type: 'film', film: '../secret.mp4' });
    assert.equal((await a.recevoir((m) => m.type === 'erreur')).message, 'Film introuvable.');

    a.envoyer({ type: 'lecture', position: 12 });
    const e2 = await b.recevoir((m) => m.type === 'etat' && m.raison === 'lecture');
    assert.equal(e2.etat.lecture, true); assert.equal(e2.etat.position, 12);

    a.envoyer({ type: 'pause', position: 13.5 });
    const e3 = await b.recevoir((m) => m.type === 'etat' && m.raison === 'pause');
    assert.equal(e3.etat.lecture, false); assert.equal(e3.etat.position, 13.5);

    a.envoyer({ type: 'lecture', position: 13.5 });
    await b.recevoir((m) => m.type === 'etat' && m.raison === 'lecture' && m.etat.version > e3.etat.version);
    b.envoyer({ type: 'tampon', enCours: true });
    const att = await a.recevoir((m) => m.type === 'etat' && m.raison === 'attente');
    assert.equal(att.etat.lecture, false); assert.deepEqual(att.etat.attente, ['Kofi']);
    b.envoyer({ type: 'tampon', enCours: false });
    const rep = await a.recevoir((m) => m.type === 'etat' && m.raison === 'reprise');
    assert.equal(rep.etat.lecture, true);

    b.envoyer({ type: 'ping', t: 42 });
    const pong = await b.recevoir((m) => m.type === 'pong');
    assert.equal(pong.t, 42); assert.ok(Math.abs(pong.serveur - Date.now()) < 2000);

    b.envoyer({ type: 'media', micro: true, camera: false });
    const media = await a.recevoir((m) => m.type === 'media');
    assert.equal(media.micro, true); assert.equal(media.id, bienvenueB.id);

    b.fermer();
    const depart = await a.recevoir((m) => m.type === 'depart');
    assert.equal(depart.prenom, 'Kofi');
    a.fermer();
  } finally { await app.arreter(); }
});

test('WebSocket : signalisation WebRTC relayée à la bonne personne seulement', async () => {
  const { app, port, url } = await lancer();
  try {
    const [a, b, c] = [];
    const cs = [];
    for (const n of ['Ama', 'Kofi', 'Yaw']) { const cl = new Client(port, (await connexion(url, n)).cookie); await cl.ouvert; cs.push(cl); }
    const ids = [];
    for (const cl of cs) ids.push((await cl.recevoir((m) => m.type === 'bienvenue')).id);
    cs[0].envoyer({ type: 'signal', a: ids[1], donnees: { description: { type: 'offer', sdp: 'v=0' } } });
    const recu = await cs[1].recevoir((m) => m.type === 'signal');
    assert.equal(recu.de, ids[0]); assert.equal(recu.donnees.description.sdp, 'v=0');
    cs[1].envoyer({ type: 'signal', a: ids[0], donnees: { candidate: { candidate: 'x' } } });
    assert.equal((await cs[0].recevoir((m) => m.type === 'signal')).donnees.candidate.candidate, 'x');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(cs[2].msgs.filter((m) => m.type === 'signal').length, 0, 'le troisième ne reçoit rien');
    cs[0].envoyer({ type: 'signal', a: 9999, donnees: {} }); // cible inconnue : ignoré sans planter
    cs.forEach((x) => x.fermer());
  } finally { await app.arreter(); }
});

test('WebSocket : message trop gros -> connexion fermée (1009)', async () => {
  const { app, port, url } = await lancer();
  try {
    const c = new Client(port, (await connexion(url)).cookie); await c.ouvert;
    const code = await new Promise((res) => { c.ws.on('close', (k) => res(k)); c.ws.send('x'.repeat(70 * 1024)); });
    assert.equal(code, 1009);
  } finally { await app.arreter(); }
});
