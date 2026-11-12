#!/usr/bin/env node
'use strict';
// Essai de bout en bout de Canapé dans un vrai Chrome (headless), avec deux participants dans deux contextes de
// navigation séparés. Hors de `npm test` (lourd) : `npm run essai-navigateur`.
//
// Variables : CHROME (défaut /usr/bin/google-chrome), CAPTURES (dossier des PNG), ESSAI_VISIBLE=1 (fenêtre visible).
// Chrome simule la caméra et le micro (--use-fake-device-for-media-stream) ; la lecture automatique garde sa
// politique par défaut : seuls de vrais clics (gestes) autorisent le son.

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const net = require('net');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const RACINE = path.join(__dirname, '..');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const MOT_DE_PASSE = 'essai-canape';
const CAPTURES = process.env.CAPTURES || path.join(os.tmpdir(), 'canape-captures');
const FILM = 'Essai.mp4';
const DUREE_FILM = 30;

const resultats = []; // { n, texte, ok, detail }
const erreursPages = []; // { qui, texte }
const acteurs = {}; // nom -> { page, ctx }
const consoles = []; // tous les messages de console, pour le diagnostic en cas d'échec
let serveur = null;
let navigateur = null;
let urlBase = '';
let dossierFilms = '';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- vérifications
class Echec extends Error {}
function verifier(condition, message) { if (!condition) throw new Echec(message); }

async function point(n, texte, fn) {
  let detail = '';
  try {
    detail = (await fn()) || '';
    resultats.push({ n, texte, ok: true, detail });
    log(`  [OK]  ${n}. ${texte}${detail ? ' — ' + detail : ''}`);
  } catch (e) {
    const d = e instanceof Echec ? e.message : `${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`;
    resultats.push({ n, texte, ok: false, detail: d });
    log(`  [ÉCHEC] ${n}. ${texte} — ${d}`);
  }
}

async function attendre(page, fn, arg, delai = 15000, description = 'condition') {
  try {
    return await page.waitForFunction(fn, { timeout: delai, polling: 100 }, arg);
  } catch (e) {
    throw new Echec(`délai dépassé (${delai} ms) : ${description}`);
  }
}

// ---------------------------------------------------------------- serveur
function portLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function demarrerServeur() {
  dossierFilms = await fsp.mkdtemp(path.join(os.tmpdir(), 'canape-essai-films-'));
  for (const f of await fsp.readdir(path.join(RACINE, 'films'))) {
    if (f.startsWith('Essai.')) await fsp.copyFile(path.join(RACINE, 'films', f), path.join(dossierFilms, f));
  }
  verifier(fs.existsSync(path.join(dossierFilms, FILM)), `film d'essai absent : films/${FILM}`);
  const port = await portLibre();
  serveur = spawn(process.execPath, [path.join(RACINE, 'bin', 'canape')], {
    env: { ...process.env, CANAPE_HOTE: '127.0.0.1', CANAPE_PORT: String(port), CANAPE_FILMS: dossierFilms,
      CANAPE_MOT_DE_PASSE: MOT_DE_PASSE, CANAPE_SECRET: 'secret-essai', CANAPE_ICE: '[]' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sortieServeur = [];
  serveur.stdout.on('data', (d) => sortieServeur.push(String(d)));
  serveur.stderr.on('data', (d) => sortieServeur.push(String(d)));
  serveur.sortie = sortieServeur;
  urlBase = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/etat`); if (r.ok) return; } catch (e) { /* pas encore prêt */ }
    if (serveur.exitCode !== null) throw new Error('le serveur s\'est arrêté : ' + sortieServeur.join(''));
    await dormir(100);
  }
  throw new Error('le serveur ne démarre pas');
}

// ---------------------------------------------------------------- navigateur
// Chaque RTCPeerConnection est consignée dans window.__pcs pour pouvoir lire son état dans les assertions.
const ESPION = () => {
  window.__ev = [];
  document.addEventListener('DOMContentLoaded', () => {
    const v = document.getElementById('film'); const t0 = performance.now();
    for (const e of ['loadstart', 'seeking', 'seeked', 'waiting', 'playing', 'stalled', 'pause', 'play', 'ratechange', 'canplay', 'ended', 'error', 'emptied', 'suspend']) {
      v.addEventListener(e, () => { window.__ev.push(`${((performance.now() - t0) / 1000).toFixed(2)} ${e} t=${v.currentTime.toFixed(2)} rs=${v.readyState}`); if (window.__ev.length > 80) window.__ev.shift(); });
    }
  });
  window.__pcs = [];
  window.__sig = [];
  const t00 = performance.now();
  const note = (x) => { window.__sig.push(`${((performance.now() - t00) / 1000).toFixed(2)} ${x}`); if (window.__sig.length > 400) window.__sig.shift(); };
  const envoiOrigine = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); if (m.type === 'signal') note(`->${m.a} ${m.donnees.description ? m.donnees.description.type : 'ice'}`); else if (m.type !== 'ping') note(`-> ${m.type}`); } catch (e) { /* ignoré */ } return envoiOrigine.call(this, d); };
  const ajoutEcoute = WebSocket.prototype.addEventListener;
  const ouvrir = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', { set(f) { ouvrir.set.call(this, (e) => { try { const m = JSON.parse(e.data); if (m.type === 'signal') note(`<-${m.de} ${m.donnees.description ? m.donnees.description.type : 'ice'}`); else if (m.type !== 'pong') note(`<- ${m.type}`); } catch (x) { /* ignoré */ } f(e); }); }, get() { return ouvrir.get.call(this); } });
  const Origine = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...a) { const pc = new Origine(...a); window.__pcs.push(pc); pc.addEventListener('negotiationneeded', () => note('negotiationneeded')); pc.addEventListener('signalingstatechange', () => note('signaling ' + pc.signalingState)); return pc; };
  window.RTCPeerConnection.prototype = Origine.prototype;
  window.RTCPeerConnection.generateCertificate = Origine.generateCertificate;
};

async function nouvelActeur(nom, { ignorerErreurs = [] } = {}) {
  const ctx = await navigateur.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(ESPION);
  page.on('console', (m) => {
    consoles.push(`${nom} ${m.type()}: ${m.text()}`.slice(0, 300));
    if (m.type() === 'error' || m.type() === 'assert') {
      const t = m.text();
      if (!ignorerErreurs.some((re) => re.test(t))) erreursPages.push({ qui: nom, texte: `console.${m.type()}: ${t}` });
    }
  });
  page.on('pageerror', (e) => erreursPages.push({ qui: nom, texte: `exception: ${e.message}` }));
  page.on('requestfailed', (r) => {
    const echec = r.failure() && r.failure().errorText;
    if (echec && !/ERR_ABORTED/.test(echec)) erreursPages.push({ qui: nom, texte: `requête échouée : ${r.url()} (${echec})` });
  });
  acteurs[nom] = { page, ctx, nom };
  return acteurs[nom];
}

async function lancerNavigateur() {
  navigateur = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.ESSAI_VISIBLE ? false : 'new',
    args: [
      '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
      '--disable-features=Translate', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
}

// ---------------------------------------------------------------- captures (ordinateur et téléphone)
async function capturer(acteur, nom) {
  const { page } = acteur;
  await page.mouse.move(400, 400); await page.mouse.move(420, 420); // réveille les commandes masquées au repos
  await fsp.mkdir(CAPTURES, { recursive: true });
  const fichier = (type) => path.join(CAPTURES, `${type}-${String(++capturer.n).padStart(2, '0')}-${acteur.nom.toLowerCase()}-${nom}.png`);
  await page.screenshot({ path: fichier('ordinateur') });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await dormir(250);
  capturer.n--;
  await page.screenshot({ path: fichier('telephone') });
  capturer.n++;
  await page.setViewport({ width: 1440, height: 900 });
  await dormir(250);
}
capturer.n = 0;

// ---------------------------------------------------------------- gestes utilisateur
async function connecter(acteur, prenom, mdp = MOT_DE_PASSE) {
  const { page } = acteur;
  await page.goto(urlBase + '/', { waitUntil: 'domcontentloaded' });
  await attendre(page, () => document.getElementById('version').textContent.startsWith('Canapé'), null, 10000, 'page d\'entrée chargée');
  if (await page.$eval('#champ-prenom', (e) => !e.hidden)) await page.type('#prenom', prenom);
  if (await page.$eval('#champ-mdp', (e) => !e.hidden)) await page.type('#mdp', mdp);
  await page.click('#entrer');
}
async function dansLeSalon(acteur) {
  await attendre(acteur.page, () => !document.getElementById('ecran-salon').hidden, null, 10000, 'écran du salon');
  await attendre(acteur.page, () => document.querySelectorAll('#presents li').length >= 1 && !document.querySelector('#synchro[data-niveau=mal]'), null, 10000, 'WebSocket ouvert');
}
const lire = (acteur) => acteur.page.evaluate(() => {
  const v = document.getElementById('film');
  return { t: v.currentTime, pause: v.paused, fin: v.ended, rate: v.playbackRate, vol: v.volume, src: v.getAttribute('src'),
    duree: v.duration, etat: v.readyState, seeking: v.seeking, tampon: v.buffered.length ? [v.buffered.start(0), v.buffered.end(v.buffered.length - 1)] : null, synchro: document.getElementById('synchro-texte').textContent };
});
async function ecart(a, b) {
  const [x, y] = await Promise.all([lire(a), lire(b)]);
  return { e: Math.abs(x.t - y.t), x, y };
}
async function attendreEcart(a, b, max, delai = 12000) {
  const fin = Date.now() + delai; let der;
  while (Date.now() < fin) { der = await ecart(a, b); if (der.e < max) return der; await dormir(200); }
  throw new Echec(`écart toujours ${der.e.toFixed(2)} s après ${delai} ms (${a.nom} ${der.x.t.toFixed(2)} / ${b.nom} ${der.y.t.toFixed(2)})`);
}
const toastContient = (acteur, motif, delai = 6000) =>
  attendre(acteur.page, (m) => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes(m)), motif, delai, `message « ${motif} »`);

// Ramène la lecture près du début (le film d'essai ne dure que 30 s) en cliquant sur la barre de position.
async function replacer(acteur, seconde) {
  const boite = await (await acteur.page.$('#barre')).boundingBox();
  await acteur.page.mouse.click(boite.x + 9 + (boite.width - 18) * (seconde / DUREE_FILM), boite.y + boite.height / 2);
  await attendre(acteur.page, (s) => Math.abs(document.getElementById('film').currentTime - s) < 1.5, seconde, 8000, `position près de ${seconde} s`);
}

// ---------------------------------------------------------------- scénario
async function scenario() {
  const ama = await nouvelActeur('Ama');
  const kofi = await nouvelActeur('Kofi');
  const intrus = await nouvelActeur('Intrus', { ignorerErreurs: [/status of 401/, /WebSocket connection to .* failed/] });

  log('\n1. Connexion');
  await point(1, 'mauvais mot de passe refusé, bon mot de passe accepté pour Ama et Kofi', async () => {
    await connecter(intrus, 'Intrus', 'pas-le-bon');
    await attendre(intrus.page, () => { const e = document.getElementById('erreur-entree'); return !e.hidden && /incorrect/i.test(e.textContent); }, null, 5000, 'message « Mot de passe incorrect »');
    verifier(await intrus.page.$eval('#ecran-salon', (e) => e.hidden), 'l\'intrus est entré dans le salon');
    const ws = await intrus.page.evaluate((u) => new Promise((r) => { const s = new WebSocket(u.replace('http', 'ws') + '/ws'); s.onopen = () => r('ouvert'); s.onerror = () => r('refusé'); }), urlBase);
    verifier(ws === 'refusé', 'WebSocket accepté sans session');
    await capturer(intrus, 'connexion-mauvais-mot-de-passe');
    await ama.page.goto(urlBase + '/', { waitUntil: 'domcontentloaded' });
    await attendre(ama.page, () => document.getElementById('version').textContent.startsWith('Canapé'), null, 10000, 'entrée');
    await capturer(ama, 'connexion');
    await connecter(ama, 'Ama');
    await dansLeSalon(ama);
    await connecter(kofi, 'Kofi');
    await dansLeSalon(kofi);
    await attendre(ama.page, () => [...document.querySelectorAll('#presents li')].some((l) => l.textContent.includes('Kofi')), null, 8000, 'Kofi dans la liste d\'Ama');
    await attendre(kofi.page, () => [...document.querySelectorAll('#presents li')].some((l) => l.textContent.includes('Ama')), null, 8000, 'Ama dans la liste de Kofi');
    return 'Ama et Kofi présents des deux côtés';
  });

  log('\n2. Choix du film');
  await point(2, 'Ama choisit le film, Kofi le voit chargé, sous-titres disponibles', async () => {
    await attendre(ama.page, () => !document.getElementById('choix').hidden, null, 5000, 'liste des films ouverte');
    await attendre(ama.page, () => document.querySelectorAll('#liste-films .film').length > 0, null, 5000, 'films listés');
    await capturer(ama, 'choix-du-film');
    await ama.page.click('#liste-films .film');
    for (const a of [ama, kofi]) {
      await attendre(a.page, () => { const v = document.getElementById('film'); return v.readyState >= 3 && v.duration > 1; }, null, 15000, `film chargé chez ${a.nom}`);
    }
    const x = await lire(kofi);
    verifier(x.src && x.src.includes(FILM), `src chez Kofi : ${x.src}`);
    verifier(Math.abs(x.duree - DUREE_FILM) < 1, `durée ${x.duree}`);
    for (const a of [ama, kofi]) {
      const st = await a.page.evaluate(() => ({ bouton: !document.getElementById('b-st').hidden, pistes: document.getElementById('film').textTracks.length }));
      verifier(st.bouton && st.pistes >= 1, `sous-titres chez ${a.nom} : ${JSON.stringify(st)}`);
    }
    // Les sous-titres sont réellement servis en WebVTT et le bouton les active.
    await ama.page.click('#b-st');
    const mode = await ama.page.evaluate(() => document.getElementById('film').textTracks[0].mode);
    verifier(mode === 'showing', `piste de sous-titres : ${mode}`);
    await ama.page.click('#b-st'); // les retire
    return `${x.duree.toFixed(1)} s, sous-titres présents`;
  });

  log('\n3. Lecture synchronisée');
  await point(3, 'Ama lance la lecture : les deux lisent, écart < 0,5 s', async () => {
    await ama.page.click('#b-lecture');
    for (const a of [ama, kofi]) await attendre(a.page, () => { const v = document.getElementById('film'); return !v.paused && v.currentTime > 1.5; }, null, 15000, `lecture chez ${a.nom}`);
    await dormir(3000);
    const r = await ecart(ama, kofi);
    verifier(!r.x.pause && !r.y.pause, 'une des deux lectures est en pause');
    verifier(r.e < 0.5, `écart ${r.e.toFixed(2)} s`);
    // échantillon sur quelques secondes : le pire écart
    let pire = r.e;
    for (let i = 0; i < 6; i++) { await dormir(500); pire = Math.max(pire, (await ecart(ama, kofi)).e); }
    verifier(pire < 0.5, `pire écart ${pire.toFixed(2)} s`);
    await capturer(ama, 'lecture-vignettes');
    await capturer(kofi, 'lecture-vignettes');
    return `écart ${r.e.toFixed(2)} s, pire ${pire.toFixed(2)} s`;
  });

  log('\n4. Pause par Kofi');
  await point(4, 'Kofi met en pause : Ama est en pause, avec le message', async () => {
    await kofi.page.click('#b-lecture');
    await attendre(ama.page, () => document.getElementById('film').paused, null, 8000, 'pause chez Ama');
    await attendre(kofi.page, () => document.getElementById('film').paused, null, 8000, 'pause chez Kofi');
    await toastContient(ama, 'Kofi a mis en pause');
    await dormir(500);
    const r = await ecart(ama, kofi);
    verifier(r.e < 0.5, `positions en pause : écart ${r.e.toFixed(2)} s`);
    await capturer(ama, 'pause-par-kofi');
    return `message affiché, écart ${r.e.toFixed(2)} s`;
  });

  log('\n5. Déplacement à 20 s');
  await point(5, 'Ama va à 20 s : Kofi suit (< 0,5 s) ; reprise de la lecture', async () => {
    const boite = await (await ama.page.$('#barre')).boundingBox();
    // 20 s / 30 s : on clique à 2/3 de la barre (la poignée du curseur réduit un peu la course utile)
    await ama.page.mouse.click(boite.x + 9 + (boite.width - 18) * (20 / DUREE_FILM), boite.y + boite.height / 2);
    await attendre(ama.page, () => Math.abs(document.getElementById('film').currentTime - 20) < 1.5, null, 8000, 'Ama près de 20 s');
    const r = await attendreEcart(ama, kofi, 0.5, 8000);
    verifier(Math.abs(r.x.t - 20) < 1.5, `Ama à ${r.x.t.toFixed(2)} s`);
    await toastContient(kofi, 'Ama est allé à');
    // reprise : Kofi relance cette fois, pour croiser les rôles
    await kofi.page.click('#b-lecture');
    for (const a of [ama, kofi]) await attendre(a.page, () => { const v = document.getElementById('film'); return !v.paused && v.currentTime > 21.5; }, null, 10000, `reprise chez ${a.nom}`);
    await dormir(2500);
    const f = await ecart(ama, kofi);
    verifier(f.e < 0.5, `écart après reprise ${f.e.toFixed(2)} s`);
    // Déplacements répétés PENDANT la lecture (cas fréquent : on tire la barre en plein film)
    for (const cible of [4, 12, 2, 9, 5]) {
      await replacer(kofi, cible);
      await attendreEcart(ama, kofi, 0.5, 10000);
      const a0 = (await lire(ama)).t;
      await dormir(1500);
      const a1 = await lire(ama); const k1 = await lire(kofi);
      verifier(a1.t - a0 > 0.8 && !a1.pause && !k1.pause, `lecture figée après un saut à ${cible} s : ${JSON.stringify({ a1, k1 })}`);
      verifier(Math.abs(a1.t - k1.t) < 0.5, `écart ${Math.abs(a1.t - k1.t).toFixed(2)} s après un saut à ${cible} s`);
    }
    return `positions ${f.x.t.toFixed(2)} / ${f.y.t.toFixed(2)} s, 5 sauts en pleine lecture suivis`;
  });

  log('\n6. Appel vidéo WebRTC');
  await point(6, 'WebRTC connecté des deux côtés, vignettes vivantes, piste audio distante, coupure micro/caméra', async () => {
    for (const a of [ama, kofi]) {
      await attendre(a.page, () => window.__pcs.length === 1 && window.__pcs.every((pc) => pc.connectionState === 'connected'), null, 25000, `connectionState « connected » chez ${a.nom}`);
      const info = await a.page.evaluate(() => {
        const tuile = document.querySelector('.tuile:not(.moi)');
        const v = tuile.querySelector('video');
        const pc = window.__pcs[0];
        return {
          etat: pc.connectionState, ice: pc.iceConnectionState, tuileEtat: tuile.dataset.etat,
          largeur: v.videoWidth, hauteur: v.videoHeight, enLecture: !v.paused && v.readyState >= 2, tuileSansImage: tuile.classList.contains('sans-image'),
          audioDistant: pc.getReceivers().filter((r) => r.track.kind === 'audio' && r.track.readyState === 'live').length,
          videoDistante: pc.getReceivers().filter((r) => r.track.kind === 'video' && r.track.readyState === 'live').length,
          elementsAudio: [...document.querySelectorAll('audio')].filter((x) => x.srcObject && x.srcObject.getAudioTracks().length && !x.paused).length,
        };
      });
      verifier(info.etat === 'connected', `${a.nom} : connectionState ${info.etat}`);
      verifier(info.largeur > 0 && info.hauteur > 0 && info.enLecture && !info.tuileSansImage, `${a.nom} : vignette de l'autre sans image ${JSON.stringify(info)}`);
      verifier(info.audioDistant >= 1 && info.elementsAudio >= 1, `${a.nom} : pas de piste audio distante lue ${JSON.stringify(info)}`);
    }
    // Les images changent vraiment (le flux n'est pas figé) : currentTime de la vignette avance.
    const avance = await kofi.page.evaluate(async () => {
      const v = document.querySelector('.tuile:not(.moi) video'); const t0 = v.currentTime; await new Promise((r) => setTimeout(r, 800)); return v.currentTime - t0;
    });
    verifier(avance > 0.3, `vignette figée (avance ${avance.toFixed(2)} s)`);

    // Couper le micro d'Ama : Kofi le voit, et la piste émise est désactivée.
    await ama.page.click('#b-micro');
    await attendre(kofi.page, () => document.querySelector('.tuile:not(.moi) .coupe').textContent.includes('micro coupé'), null, 5000, 'micro coupé visible chez Kofi');
    verifier(await ama.page.evaluate(() => window.__pcs[0].getSenders().find((s) => s.track && s.track.kind === 'audio').track.enabled === false), 'piste audio d\'Ama encore active');
    await ama.page.click('#b-micro');
    await attendre(kofi.page, () => document.querySelector('.tuile:not(.moi) .coupe').textContent === '', null, 5000, 'micro rétabli visible chez Kofi');
    // Couper la caméra d'Ama
    await ama.page.click('#b-camera');
    await attendre(kofi.page, () => document.querySelector('.tuile:not(.moi)').classList.contains('sans-image'), null, 5000, 'caméra coupée visible chez Kofi');
    await capturer(kofi, 'camera-d-ama-coupee');
    await ama.page.click('#b-camera');
    await attendre(kofi.page, () => !document.querySelector('.tuile:not(.moi)').classList.contains('sans-image'), null, 5000, 'caméra rétablie chez Kofi');
    return 'connected x2, vidéo 640x360 en lecture, audio distant lu, coupures reflétées';
  });

  log('\n7. Volumes et baisse du film');
  await point(7, 'volumes séparés ; le film baisse quand l\'autre parle (bip du micro simulé)', async () => {
    if (process.env.ESSAI_DEBUG) for (let i = 0; i < 3; i++) { log('   debug7', JSON.stringify(await lire(ama)), JSON.stringify(await lire(kofi))); await dormir(700); }
    await replacer(ama, 2);
    // Volumes séparés
    await ama.page.$eval('#vol-film', (e) => { e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await ama.page.$eval('#vol-voix', (e) => { e.value = 55; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await ama.page.$eval('#duck', (e) => { if (e.checked) e.click(); }); // sans baisse automatique pour lire le volume brut
    await dormir(600);
    const sep = await ama.page.evaluate(() => ({ film: document.getElementById('film').volume, voix: [...document.querySelectorAll('audio')].map((a) => a.volume) }));
    verifier(Math.abs(sep.film - 0.4) < 0.01, `volume du film ${sep.film}`);
    verifier(sep.voix.length >= 1 && sep.voix.every((v) => Math.abs(v - 0.55) < 0.01), `volume des voix ${sep.voix}`);
    await ama.page.$eval('#vol-film', (e) => { e.value = 90; e.dispatchEvent(new Event('input', { bubbles: true })); });
    const sep2 = await ama.page.evaluate(() => ({ film: document.getElementById('film').volume, voix: [...document.querySelectorAll('audio')].map((a) => a.volume) }));
    verifier(Math.abs(sep2.film - 0.9) < 0.01 && sep2.voix.every((v) => Math.abs(v - 0.55) < 0.01), `volumes non indépendants : ${JSON.stringify(sep2)}`);

    // Baisse du film : Kofi émet un bip régulier (micro simulé). Ama règle le film à 90 % et active la baisse.
    await ama.page.$eval('#duck', (e) => { if (!e.checked) e.click(); });
    const suivi = await ama.page.evaluate(() => new Promise((resolve) => {
      const v = document.getElementById('film'); let min = 1; let max = 0; let parle = false; const fin = performance.now() + 7000;
      const t = setInterval(() => {
        min = Math.min(min, v.volume); max = Math.max(max, v.volume);
        if (document.querySelector('.tuile:not(.moi)').classList.contains('parle')) parle = true;
        if (performance.now() > fin) { clearInterval(t); resolve({ min, max, parle }); }
      }, 50);
    }));
    verifier(suivi.parle, 'la vignette de Kofi n\'a jamais été marquée « parle » (détection de voix)');
    verifier(suivi.min < 0.9 * 0.75, `le film n'a pas baissé (min ${suivi.min.toFixed(2)} pour une base de 0,90)`);
    // Sans baisse automatique, le volume reste à la valeur réglée.
    await ama.page.$eval('#duck', (e) => e.click());
    await dormir(1500);
    const sans = await ama.page.evaluate(() => document.getElementById('film').volume);
    verifier(Math.abs(sans - 0.9) < 0.02, `volume avec baisse désactivée : ${sans}`);
    await ama.page.$eval('#duck', (e) => e.click());
    return `film 0,90 -> minimum ${suivi.min.toFixed(2)} pendant le bip de Kofi`;
  });

  log('\n8. Départ et retour de Kofi');
  await point(8, 'Kofi part : Ama prévenue ; Kofi revient : état récupéré, appel rétabli', async () => {
    if (process.env.ESSAI_DEBUG) for (let i = 0; i < 4; i++) { log('   debug', JSON.stringify(await lire(ama)), JSON.stringify(await lire(kofi))); await dormir(1000); }
    await replacer(ama, 3);
    await attendreEcart(ama, kofi, 0.5, 8000);
    for (const a of [ama, kofi]) await attendre(a.page, () => { const v = document.getElementById('film'); return !v.paused && v.currentTime > 4.5 && v.currentTime < 20; }, null, 8000, `lecture en cours chez ${a.nom} après le saut`);
    const avant = await lire(ama);
    verifier(!avant.pause, 'la lecture devait être en cours');
    await kofi.page.close();
    await toastContient(ama, 'Kofi a quitté le salon');
    await attendre(ama.page, () => ![...document.querySelectorAll('#presents li')].some((l) => l.textContent.includes('Kofi')) && !document.querySelector('.tuile:not(.moi)'), null, 5000, 'Kofi retiré de la liste et des vignettes');
    await dormir(1200);
    const pendant = await lire(ama);
    verifier(pendant.t > avant.t && !pendant.pause, `la lecture d'Ama s'est arrêtée : ${JSON.stringify({ avant, pendant })}`);
    await capturer(ama, 'kofi-parti');
    // Retour : même contexte (même cookie) mais nouvelle page ; passe par « Entrer dans le salon » (vrai clic)
    const page = await acteurs.Kofi.ctx.newPage();
    acteurs.Kofi.page = page;
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(ESPION);
    page.on('console', (m) => { consoles.push(`Kofi(retour) ${m.type()}: ${m.text()}`.slice(0, 300)); if (m.type() === 'error') erreursPages.push({ qui: 'Kofi (retour)', texte: `console.error: ${m.text()}` }); });
    page.on('pageerror', (e) => erreursPages.push({ qui: 'Kofi (retour)', texte: `exception: ${e.message}` }));
    await page.goto(urlBase + '/', { waitUntil: 'domcontentloaded' });
    await attendre(page, () => !document.getElementById('bonjour').hidden && document.getElementById('bonjour').textContent.includes('Kofi'), null, 8000, 'retour reconnu (« Bonsoir Kofi »)');
    await page.click('#entrer');
    await dansLeSalon(acteurs.Kofi);
    await attendre(page, () => { const v = document.getElementById('film'); return v.readyState >= 3 && !v.paused && v.currentTime > 10; }, null, 20000, 'film chargé et en lecture chez Kofi au retour');
    const r = await attendreEcart(ama, acteurs.Kofi, 0.6, 12000);
    verifier(r.y.t > 3, `position récupérée trop basse : ${r.y.t}`);
    await attendre(page, () => window.__pcs.length === 1 && window.__pcs[0].connectionState === 'connected', null, 25000, 'appel rétabli chez Kofi');
    await attendre(ama.page, () => window.__pcs.length >= 1 && window.__pcs.some((pc) => pc.connectionState === 'connected'), null, 25000, 'appel rétabli chez Ama');
    await attendre(page, () => { const v = document.querySelector('.tuile:not(.moi) video'); return v && v.videoWidth > 0 && !v.paused; }, null, 15000, 'vignette d\'Ama revenue chez Kofi');
    await attendre(ama.page, () => { const v = document.querySelector('.tuile:not(.moi) video'); return v && v.videoWidth > 0 && !v.paused; }, null, 15000, 'vignette de Kofi revenue chez Ama');
    await capturer(acteurs.Kofi, 'retour-de-kofi');
    return `Kofi revient à ${r.y.t.toFixed(1)} s (Ama ${r.x.t.toFixed(1)} s), appel rétabli`;
  });
}

// ---------------------------------------------------------------- point 9 et fin
function bilan() {
  const erreurs = erreursPages;
  const ok = erreurs.length === 0;
  resultats.push({ n: 9, texte: 'aucune erreur de console ni exception non gérée', ok, detail: ok ? '0 erreur' : erreurs.map((e) => `${e.qui} : ${e.texte}`).join(' | ') });
  log(`\n9. Console`);
  log(ok ? '  [OK]  9. aucune erreur de console ni exception non gérée' : `  [ÉCHEC] 9. ${erreurs.length} erreur(s) :\n     ${erreurs.map((e) => `${e.qui} : ${e.texte}`).join('\n     ')}`);
  resultats.sort((a, b) => a.n - b.n);
  log('\n================ Résumé ================');
  for (const r of resultats) log(`${r.ok ? 'RÉUSSI' : 'ÉCHEC '}  ${r.n}. ${r.texte}${r.ok ? '' : '\n         -> ' + r.detail}`);
  log(`10. Captures : ${CAPTURES}`);
  const echecs = resultats.filter((r) => !r.ok).length;
  log(`\n${resultats.length - echecs}/${resultats.length} points réussis.`);
  return echecs === 0;
}

async function nettoyer() {
  try { if (navigateur) await Promise.race([navigateur.close(), dormir(8000)]); } catch (e) { /* déjà fermé */ }
  try { if (navigateur && navigateur.process()) navigateur.process().kill('SIGKILL'); } catch (e) { /* déjà mort */ }
  if (serveur && serveur.exitCode === null) {
    serveur.kill('SIGTERM');
    await Promise.race([new Promise((r) => serveur.once('exit', r)), dormir(4000)]);
    if (serveur.exitCode === null) serveur.kill('SIGKILL');
  }
  if (dossierFilms) await fsp.rm(dossierFilms, { recursive: true, force: true }).catch(() => {});
}

let sortieDemandee = false;
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { if (sortieDemandee) return; sortieDemandee = true; await nettoyer(); process.exit(130); });

(async () => {
  let reussi = false;
  try {
    await fsp.rm(CAPTURES, { recursive: true, force: true });
    await fsp.mkdir(CAPTURES, { recursive: true });
    log(`Essai navigateur de Canapé — ${execFileSync(CHROME, ['--version']).toString().trim()}`);
    await demarrerServeur();
    log(`Serveur : ${urlBase}`);
    await lancerNavigateur();
    await scenario();
  } catch (e) {
    log(`\nERREUR DE L'ESSAI : ${e && e.stack ? e.stack : e}`);
    resultats.push({ n: 0, texte: 'déroulement de l\'essai', ok: false, detail: String(e && e.message) });
  } finally {
    // Captures de diagnostic si quelque chose a échoué
    if (resultats.some((r) => !r.ok)) {
      for (const a of Object.values(acteurs)) { try { await a.page.screenshot({ path: path.join(CAPTURES, `diagnostic-${a.nom.toLowerCase()}.png`) }); } catch (e) { /* page fermée */ } }
      for (const a of Object.values(acteurs)) { try { log(`\nÉvénements vidéo de ${a.nom} :\n  ` + (await a.page.evaluate(() => window.__ev.slice(-40))).join('\n  ')); } catch (e) { /* page fermée */ } }
      for (const a of Object.values(acteurs)) { try { log(`\nSignalisation vue par ${a.nom} :\n  ` + (await a.page.evaluate(() => window.__sig.slice(-70))).join('\n  ')); } catch (e) { /* page fermée */ } }
      log('\nConsoles (derniers messages) :\n  ' + consoles.slice(-40).join('\n  '));
      for (const a of Object.values(acteurs)) { try { log(`Pairs de ${a.nom} : ` + JSON.stringify(await a.page.evaluate(() => (window.__pcs || []).map((pc) => [pc.connectionState, pc.iceConnectionState, pc.signalingState])))); } catch (e) { /* page fermée */ } }
      if (serveur && serveur.sortie) log('\nJournal du serveur :\n' + serveur.sortie.join('').split('\n').slice(-15).join('\n'));
    }
    reussi = bilan();
    await nettoyer();
  }
  process.exit(reussi ? 0 : 1);
})();
