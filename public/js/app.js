'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const video = $('film');
  const scene = $('scene');

  const svg = (corps) => `<svg viewBox="0 0 24 24" aria-hidden="true">${corps}</svg>`;
  const BARRE = '<path d="M4 4l16 16"/>';
  const ICONES = {
    lecture: svg('<path class="plein" d="M7 4.5v15l12-7.5z"/>'),
    pause: svg('<path class="plein" d="M6 4h4v16H6zM14 4h4v16h-4z"/>'),
    micro: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    microCoupe: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>' + BARRE),
    camera: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
    cameraCoupee: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>' + BARRE),
    plein: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    reduire: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  };

  const S = {
    connecte: false, prenom: '', moi: null, ws: null, sortie: false, tentatives: 0,
    participants: new Map(), etat: null, films: [], ice: [], appel: null, ctx: null,
    decalage: 0, echantillons: [], rtt: null,
    filmCharge: null, bloque: false, glisse: false,
    tamponEnvoye: false, minuterieTampon: null,
    audios: new Map(), detecteurs: new Map(), voix: new Map(), duck: 1,
    micro: { piste: null, actif: false }, camera: { piste: null, actif: false }, fluxLocal: null,
    st: -1, volFilm: 0.8, volVoix: 1, duckActif: true, choixOuvert: false,
  };

  const stock = {
    lire(k, defaut) { try { const v = localStorage.getItem(k); return v === null ? defaut : v; } catch (e) { return defaut; } },
    ecrire(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
  };

  // ------------------------------------------------------------------ utilitaires
  function toast(texte, duree = 4000) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = texte;
    $('toasts').appendChild(t);
    setTimeout(() => { t.classList.add('sortie'); setTimeout(() => t.remove(), 450); }, duree);
  }
  const nomDe = (id) => (S.participants.get(id) || {}).prenom || 'Quelqu\'un';
  const serveurMaintenant = () => Date.now() + S.decalage;
  const urlFilm = (chemin) => '/films/' + chemin.split('/').map(encodeURIComponent).join('/');
  const urlST = (chemin) => '/sous-titres/' + chemin.split('/').map(encodeURIComponent).join('/');
  const envoyer = (msg) => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(msg)); };
  const filmCourant = () => S.films.find((f) => f.chemin === (S.etat && S.etat.film));

  function taille(o) {
    return o > 1e9 ? (o / 1e9).toFixed(1).replace('.', ',') + ' Go' : Math.max(1, Math.round(o / 1e6)) + ' Mo';
  }

  // ------------------------------------------------------------------ entrée
  async function init() {
    $('prenom').value = stock.lire('prenom', '');
    let etat = null;
    try { etat = await (await fetch('/api/etat')).json(); } catch (e) { /* serveur injoignable */ }
    if (!etat) { montrerErreur('Le serveur ne répond pas.'); return; }
    $('version').textContent = 'Canapé ' + etat.version;
    S.connecte = etat.connecte;
    $('champ-mdp').hidden = !etat.motDePasseRequis || etat.connecte;
    if (etat.connecte) {
      S.prenom = etat.prenom;
      $('bonjour').hidden = false;
      $('bonjour').textContent = 'Bonsoir ' + etat.prenom + '.';
      $('champ-prenom').hidden = true; $('prenom').required = false;
      $('autre-personne').hidden = false;
    }
    $('prenom').focus();
  }
  function montrerErreur(t) { const e = $('erreur-entree'); e.textContent = t; e.hidden = !t; }

  $('autre-personne').addEventListener('click', async () => {
    try { await fetch('/api/deconnexion', { method: 'POST' }); } catch (e) { /* ignoré */ }
    location.reload();
  });

  $('formulaire-entree').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    montrerErreur('');
    // Ce geste autorise le son : on prépare le contexte audio tout de suite.
    try { S.ctx = new (window.AudioContext || window.webkitAudioContext)(); S.ctx.resume(); } catch (e) { S.ctx = null; }
    if (!S.connecte) {
      const prenom = $('prenom').value.trim();
      $('entrer').disabled = true;
      try {
        const r = await fetch('/api/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prenom, motDePasse: $('mdp').value }) });
        if (r.status === 401) { montrerErreur('Mot de passe incorrect.'); return; }
        if (r.status === 429) { montrerErreur('Trop d\'essais : patientez une minute.'); return; }
        if (!r.ok) { montrerErreur('Connexion impossible (' + r.status + ').'); return; }
        stock.ecrire('prenom', prenom);
        S.prenom = prenom;
      } catch (e) { montrerErreur('Le serveur ne répond pas.'); return; } finally { $('entrer').disabled = false; }
    }
    entrer();
  });

  async function entrer() {
    $('ecran-entree').hidden = true;
    $('ecran-salon').hidden = false;
    document.title = 'Canapé — salon';
    $('conseil-casque').hidden = stock.lire('casqueVu', '') === '1';
    initCommandes();
    try {
      const [cfg, films] = await Promise.all([
        fetch('/api/config').then((r) => r.json()),
        fetch('/api/films').then((r) => r.json()),
      ]);
      S.ice = cfg.iceServers || [];
      S.films = films.films || [];
    } catch (e) { toast('Impossible de lire la liste des films.'); }
    connecter();
    demarrerMedias();
  }

  // ------------------------------------------------------------------ WebSocket
  function connecter() {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    S.ws = ws;
    let ouvert = false;
    ws.onopen = () => { ouvert = true; S.tentatives = 0; lancerPings(); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } recevoir(m); };
    ws.onclose = async () => {
      arreterPings();
      if (S.ws !== ws) return;
      remettreAZero();
      if (S.sortie) return;
      majSynchro();
      S.tentatives = ouvert ? 1 : S.tentatives + 1;
      if (S.tentatives === 1) toast('Connexion perdue, nouvelle tentative…');
      try {
        const e = await (await fetch('/api/etat')).json();
        if (!e.connecte && e.motDePasseRequis) { location.reload(); return; }
      } catch (x) { /* serveur injoignable */ }
      if (S.tentatives === 4) toast('Le salon est complet ou injoignable. On continue d\'essayer…', 6000);
      setTimeout(() => { if (!S.sortie) connecter(); }, Math.min(1000 * 2 ** Math.min(S.tentatives, 4), 10000));
    };
  }

  function remettreAZero() {
    S.tamponEnvoye = false;
    if (S.appel) { S.appel.fermer(); S.appel = null; }
    for (const id of [...S.audios.keys()]) retirerFlux(id);
    $('vignettes').querySelectorAll('.tuile:not(.moi)').forEach((t) => t.remove());
    S.participants.clear(); S.moi = null; majPresents();
  }

  function recevoir(m) {
    switch (m.type) {
      case 'bienvenue': {
        S.moi = m.id;
        S.decalage = m.etat.serveur - Date.now();
        S.echantillons = [];
        S.appel = new window.Appel({
          moi: m.id, ice: S.ice,
          envoyer: (a, donnees) => envoyer({ type: 'signal', a, donnees }),
          auFlux: ajouterFlux, auEtat: etatPair, auRetrait: retirerFlux,
        });
        S.appel.definirLocal({ audio: S.micro.piste, video: S.camera.piste });
        for (const p of m.participants) { S.participants.set(p.id, p); creerTuile(p.id, p.prenom); majTuileMedia(p.id); S.appel.ajouter(p.id); }
        majPresents();
        envoyerMedia();
        appliquerEtat(m.etat, null, null);
        if (!m.etat.film) ouvrirChoix();
        break;
      }
      case 'arrivee':
        S.participants.set(m.participant.id, m.participant);
        creerTuile(m.participant.id, m.participant.prenom);
        S.appel && S.appel.ajouter(m.participant.id);
        majPresents(); envoyerMedia();
        toast(m.participant.prenom + ' est arrivé·e dans le salon');
        break;
      case 'depart':
        toast(nomDe(m.id) + ' a quitté le salon');
        S.appel && S.appel.retirer(m.id);
        S.participants.delete(m.id);
        majPresents();
        break;
      case 'etat': appliquerEtat(m.etat, m.raison, m.par); break;
      case 'media': {
        const p = S.participants.get(m.id);
        if (p) { p.micro = m.micro; p.camera = m.camera; majTuileMedia(m.id); }
        break;
      }
      case 'signal': S.appel && S.appel.signal(m.de, m.donnees); break;
      case 'pong': {
        const e = window.Sync.echantillon(m.t, m.serveur, Date.now());
        S.echantillons.push(e);
        if (S.echantillons.length > 10) S.echantillons.shift();
        S.decalage = window.Sync.meilleurDecalage(S.echantillons);
        S.rtt = Math.min(...S.echantillons.map((x) => x.rtt));
        break;
      }
      case 'erreur': toast(m.message); break;
      default: break;
    }
  }

  let minuteriePing = null;
  function lancerPings() {
    arreterPings();
    let n = 0;
    const tic = () => { envoyer({ type: 'ping', t: Date.now() }); n++; minuteriePing = setTimeout(tic, n < 6 ? 300 : 5000); };
    tic();
  }
  function arreterPings() { clearTimeout(minuteriePing); }

  // ------------------------------------------------------------------ état partagé et lecteur
  const MESSAGES = {
    lecture: (n) => n + ' a lancé la lecture',
    pause: (n) => n + ' a mis en pause',
    attente: (n) => n + ' charge le film…',
    'lecture-attente': () => 'On attend que tout le monde ait chargé',
    reprise: () => 'Tout le monde est prêt, on reprend',
  };

  function appliquerEtat(etat, raison, par) {
    const ancien = S.etat;
    S.etat = etat;
    if (raison && par !== S.moi) {
      if (MESSAGES[raison]) toast(MESSAGES[raison](nomDe(par)));
      else if (raison === 'position') toast(nomDe(par) + ' est allé à ' + window.Sync.formaterTemps(etat.position));
      else if (raison === 'film') { const f = S.films.find((x) => x.chemin === etat.film); toast(nomDe(par) + (f ? ' a choisi « ' + f.titre + ' »' : ' a retiré le film')); }
    }
    if (etat.film !== S.filmCharge) chargerFilm(etat.film);
    if (!etat.lecture) { S.bloque = false; $('reprendre').hidden = true; }
    const attendent = etat.attente || [];
    $('voile-attente').hidden = !attendent.length;
    if (attendent.length) $('texte-attente').textContent = (attendent.length === 1 ? attendent[0] + ' charge' : attendent.join(', ') + ' chargent') + ' le film…';
    majBoutonLecture();
    synchroniser();
    if (!ancien || ancien.lecture !== etat.lecture) reveiller();
  }

  async function chargerFilm(chemin) {
    S.filmCharge = chemin;
    S.st = -1;
    video.querySelectorAll('track').forEach((t) => t.remove());
    video.pause();
    if (!chemin) {
      video.removeAttribute('src'); video.load();
      $('vide').hidden = false; $('b-st').hidden = true;
      majTemps();
      return;
    }
    $('vide').hidden = true;
    fermerChoix();
    if (!S.films.find((f) => f.chemin === chemin)) { try { S.films = (await (await fetch('/api/films')).json()).films; } catch (e) { /* ignoré */ } }
    if (S.filmCharge !== chemin) return;
    video.src = urlFilm(chemin);
    video.load();
    S.tamponEnvoye = false;
    marquerTampon(true);
    const f = S.films.find((x) => x.chemin === chemin);
    const sts = f ? f.sousTitres : [];
    for (const s of sts) {
      const t = document.createElement('track');
      t.kind = 'subtitles'; t.label = s.libelle; t.srclang = s.langue || 'fr'; t.src = urlST(s.chemin);
      video.appendChild(t);
    }
    for (const t of video.textTracks) t.mode = 'disabled';
    $('b-st').hidden = sts.length === 0;
    const pref = stock.lire('stLangue', '');
    const i = pref ? sts.findIndex((s) => s.langue === pref) : -1;
    choisirST(i);
    if (f && f.compatible === false) toast('Ce film est peut-être illisible dans votre navigateur : voir canape-convertir.', 7000);
  }

  function choisirST(i) {
    const f = filmCourant();
    const sts = f ? f.sousTitres : [];
    S.st = i;
    const pistes = video.textTracks;
    for (let k = 0; k < pistes.length; k++) pistes[k].mode = k === i ? 'showing' : 'disabled';
    $('b-st').textContent = i >= 0 && sts[i] ? sts[i].libelle : 'Sous-titres';
    if (i >= 0 && sts[i]) stock.ecrire('stLangue', sts[i].langue); else if (i < 0 && sts.length) stock.ecrire('stLangue', '');
  }

  // Aligne la lecture locale sur l'état du serveur. Aucune action locale n'est renvoyée au serveur ici :
  // seules les commandes de l'interface envoient des messages, donc pas d'écho.
  function synchroniser() {
    const etat = S.etat;
    if (!etat || !etat.film || !video.getAttribute('src')) return;
    let attendu = window.Sync.positionAttendue(etat, serveurMaintenant());
    if (Number.isFinite(video.duration)) attendu = Math.min(attendu, video.duration);
    if (video.readyState === 0) return;
    if (etat.lecture) {
      if (video.paused && !S.bloque) {
        const p = video.play();
        if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') { S.bloque = true; $('reprendre').hidden = false; } });
      }
    } else if (!video.paused) video.pause();
    if (video.seeking) return;
    if (etat.lecture && video.readyState < 3 && !video.paused) { majSynchro(); return; } // en train de charger
    const ecart = attendu - video.currentTime;
    S.ecart = ecart;
    const d = window.Sync.decision(ecart, etat.lecture, video.playbackRate);
    if (d.saut) { video.currentTime = attendu; if (video.playbackRate !== 1) video.playbackRate = 1; }
    else if (video.playbackRate !== d.vitesse) video.playbackRate = d.vitesse;
    majSynchro();
  }
  setInterval(synchroniser, 500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) synchroniser(); });

  function majSynchro() {
    const el = $('synchro'); const txt = $('synchro-texte');
    if (!S.ws || S.ws.readyState !== 1) { el.dataset.niveau = 'mal'; txt.textContent = 'hors ligne'; return; }
    if (!S.etat || !S.etat.film) { el.dataset.niveau = ''; txt.textContent = 'aucun film'; return; }
    if ((S.etat.attente || []).length) { el.dataset.niveau = 'moyen'; txt.textContent = 'attente du chargement'; return; }
    if (!S.etat.lecture) { el.dataset.niveau = 'ok'; txt.textContent = 'en pause'; return; }
    const a = Math.abs(S.ecart || 0);
    el.dataset.niveau = a < 0.3 ? 'ok' : a < 1 ? 'moyen' : 'mal';
    txt.textContent = (a < 0.3 ? 'synchro ' : 'rattrape ') + '±' + a.toFixed(2).replace('.', ',') + ' s';
    el.title = 'Écart avec la position attendue' + (S.rtt !== null ? ' · latence ' + S.rtt + ' ms' : '');
  }

  // Attente mutuelle : on annonce un chargement de plus d'une seconde, et la fin du chargement.
  function marquerTampon(enCours) {
    if (enCours === S.tamponEnvoye) return;
    S.tamponEnvoye = enCours;
    envoyer({ type: 'tampon', enCours });
  }
  video.addEventListener('waiting', () => {
    clearTimeout(S.minuterieTampon);
    S.minuterieTampon = setTimeout(() => marquerTampon(true), 1000);
  });
  const pret = () => { clearTimeout(S.minuterieTampon); if (video.readyState >= 3) marquerTampon(false); };
  video.addEventListener('canplay', pret);
  video.addEventListener('playing', pret);
  video.addEventListener('loadedmetadata', () => { majTemps(); synchroniser(); });
  video.addEventListener('error', () => {
    toast('Ce film ne peut pas être lu par votre navigateur.', 7000);
    marquerTampon(false);
  });
  video.addEventListener('ended', () => { if (S.etat && S.etat.lecture) envoyer({ type: 'pause', position: video.duration, fin: true }); });
  video.addEventListener('timeupdate', majTemps);
  video.addEventListener('ratechange', () => {});

  function majTemps() {
    const d = Number.isFinite(video.duration) ? video.duration : 0;
    $('temps').textContent = window.Sync.formaterTemps(video.currentTime) + ' / ' + window.Sync.formaterTemps(d);
    if (!S.glisse && d) $('barre').value = Math.round((video.currentTime / d) * 1000);
  }

  // ------------------------------------------------------------------ commandes
  let commandesPretes = false;
  function initCommandes() {
    if (commandesPretes) return;
    commandesPretes = true;
    $('b-lecture').innerHTML = ICONES.lecture;
    $('b-micro').innerHTML = ICONES.micro;
    $('b-camera').innerHTML = ICONES.camera;
    $('b-plein').innerHTML = ICONES.plein;
    if (!(scene.requestFullscreen || scene.webkitRequestFullscreen)) $('b-plein').hidden = true;

    $('b-lecture').addEventListener('click', basculerLecture);
    video.addEventListener('click', basculerLecture);
    $('reprendre').addEventListener('click', () => {
      S.bloque = false; $('reprendre').hidden = true;
      video.play().catch(() => { S.bloque = true; $('reprendre').hidden = false; });
      reprendreAudios();
      synchroniser();
    });

    const barre = $('barre');
    barre.addEventListener('input', () => {
      S.glisse = true;
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      $('temps').textContent = window.Sync.formaterTemps(barre.value / 1000 * d) + ' / ' + window.Sync.formaterTemps(d);
    });
    barre.addEventListener('change', () => {
      S.glisse = false;
      if (Number.isFinite(video.duration)) aller(barre.value / 1000 * video.duration);
    });

    $('b-st').addEventListener('click', () => {
      const f = filmCourant(); const n = f ? f.sousTitres.length : 0;
      choisirST(S.st + 1 >= n ? -1 : S.st + 1);
    });
    $('b-film').addEventListener('click', ouvrirChoix);
    $('ouvrir-choix-vide').addEventListener('click', ouvrirChoix);
    $('fermer-choix').addEventListener('click', fermerChoix);
    $('b-plein').addEventListener('click', basculerPleinEcran);
    document.addEventListener('fullscreenchange', () => { $('b-plein').innerHTML = document.fullscreenElement ? ICONES.reduire : ICONES.plein; });
    $('b-micro').addEventListener('click', () => basculerPiste(S.micro));
    $('b-camera').addEventListener('click', () => basculerPiste(S.camera));
    $('quitter').addEventListener('click', quitter);
    $('fermer-conseil').addEventListener('click', () => { $('conseil-casque').hidden = true; stock.ecrire('casqueVu', '1'); });

    S.volFilm = Number(stock.lire('volFilm', '80')) / 100;
    S.volVoix = Number(stock.lire('volVoix', '100')) / 100;
    S.duckActif = stock.lire('duck', '1') === '1';
    $('vol-film').value = S.volFilm * 100; $('vol-voix').value = S.volVoix * 100; $('duck').checked = S.duckActif;
    $('vol-film').addEventListener('input', (e) => { S.volFilm = e.target.value / 100; stock.ecrire('volFilm', e.target.value); appliquerVolumes(); });
    $('vol-voix').addEventListener('input', (e) => { S.volVoix = e.target.value / 100; stock.ecrire('volVoix', e.target.value); appliquerVolumes(); });
    $('duck').addEventListener('change', (e) => { S.duckActif = e.target.checked; stock.ecrire('duck', e.target.checked ? '1' : '0'); });
    appliquerVolumes();

    scene.addEventListener('pointermove', reveiller);
    scene.addEventListener('pointerdown', reveiller);
    document.addEventListener('keydown', raccourcis);
    document.addEventListener('click', reprendreAudios);
    initVignettes();
  }

  function basculerLecture() {
    if (!S.etat || !S.etat.film) return ouvrirChoix();
    if (S.etat.lecture) envoyer({ type: 'pause', position: video.currentTime });
    else {
      video.play().catch(() => {});
      envoyer({ type: 'lecture', position: video.currentTime });
    }
  }
  function aller(position) {
    position = Math.max(0, Math.min(position, Number.isFinite(video.duration) ? video.duration : position));
    envoyer({ type: 'position', position });
  }
  function majBoutonLecture() {
    const joue = S.etat && S.etat.lecture;
    $('b-lecture').innerHTML = joue ? ICONES.pause : ICONES.lecture;
    $('b-lecture').setAttribute('aria-label', joue ? 'Pause' : 'Lecture');
  }
  function basculerPleinEcran() {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (scene.requestFullscreen || scene.webkitRequestFullscreen).call(scene); // le conteneur entier : film, vignettes, commandes
  }
  function raccourcis(e) {
    if (e.target.matches('input[type=text], input[type=password]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (S.choixOuvert) { if (e.key === 'Escape') fermerChoix(); return; }
    if (e.key === ' ' && !e.target.matches('button, input')) { e.preventDefault(); basculerLecture(); }
    else if (e.key === 'ArrowLeft' && !e.target.matches('input')) aller(video.currentTime - 10);
    else if (e.key === 'ArrowRight' && !e.target.matches('input')) aller(video.currentTime + 10);
    else if (e.key === 'f') basculerPleinEcran();
    else if (e.key === 'm') basculerPiste(S.micro);
  }
  let minuterieRepos = null;
  function reveiller() {
    scene.classList.remove('repos');
    clearTimeout(minuterieRepos);
    minuterieRepos = setTimeout(() => { if (S.etat && S.etat.lecture && !S.choixOuvert) scene.classList.add('repos'); }, 3000);
  }
  function quitter() {
    S.sortie = true;
    arreterPings();
    if (S.ws) S.ws.close();
    if (S.fluxLocal) S.fluxLocal.getTracks().forEach((t) => t.stop());
    location.reload();
  }

  // ------------------------------------------------------------------ choix du film
  async function ouvrirChoix() {
    S.choixOuvert = true;
    $('choix').hidden = false;
    $('fermer-choix').hidden = !(S.etat && S.etat.film);
    $('choix-info').textContent = 'Chargement de la liste…';
    try { S.films = (await (await fetch('/api/films')).json()).films; } catch (e) { /* on garde la liste connue */ }
    const liste = $('liste-films');
    liste.textContent = '';
    $('choix-info').textContent = S.films.length ? 'Le choix est partagé : tout le monde passera sur ce film.' : 'Aucun film dans le dossier du serveur. Ajoutez-en (mp4, webm, mkv…) puis rouvrez cette liste.';
    for (const f of S.films) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'film' + (S.etat && S.etat.film === f.chemin ? ' courant' : '');
      const t = document.createElement('span'); t.className = 'titre'; t.textContent = f.titre;
      const m = document.createElement('span'); m.className = 'meta';
      m.textContent = [f.dossier, f.extension.toUpperCase(), taille(f.taille), f.duree ? window.Sync.formaterTemps(f.duree) : '', f.sousTitres.length ? 'sous-titres' : ''].filter(Boolean).join(' · ');
      b.append(t, m);
      if (f.compatible === false) { const a = document.createElement('span'); a.className = 'alerte'; a.textContent = 'À convertir pour le navigateur (canape-convertir)'; b.append(a); }
      b.addEventListener('click', () => { envoyer({ type: 'film', film: f.chemin }); fermerChoix(); });
      li.append(b); liste.append(li);
    }
  }
  function fermerChoix() { S.choixOuvert = false; $('choix').hidden = true; }

  // ------------------------------------------------------------------ présents et vignettes
  function majPresents() {
    const ul = $('presents'); ul.textContent = '';
    const moi = document.createElement('li'); moi.textContent = S.prenom + ' (vous)'; ul.append(moi);
    for (const p of S.participants.values()) {
      const li = document.createElement('li'); li.dataset.id = p.id;
      const n = document.createElement('span'); n.textContent = p.prenom;
      const e = document.createElement('span'); e.className = 'etat'; e.textContent = p.etat || '';
      li.append(n, e); ul.append(li);
    }
  }
  function etatPair(id, etat, libelle) {
    const p = S.participants.get(id); if (p) p.etat = libelle === 'connecté' ? '' : libelle;
    majPresents();
    const t = document.querySelector('.tuile[data-id="' + id + '"]');
    if (t) { t.dataset.etat = etat; t.querySelector('.lien-etat').textContent = libelle; }
  }

  function creerTuile(id, prenom, local) {
    if (document.querySelector('.tuile[data-id="' + id + '"]')) return;
    const t = document.createElement('div');
    t.className = 'tuile sans-image' + (local ? ' moi' : ''); t.dataset.id = id; t.dataset.etat = 'new';
    const v = document.createElement('video'); v.autoplay = true; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', '');
    const ini = document.createElement('span'); ini.className = 'initiale'; ini.textContent = (prenom || '?').slice(0, 1).toUpperCase();
    const nom = document.createElement('div'); nom.className = 'nom';
    const n = document.createElement('span'); n.className = 'n'; n.textContent = local ? prenom + ' (vous)' : prenom;
    const e = document.createElement('span'); e.className = 'lien-etat'; e.textContent = local ? '' : 'connexion…';
    const c = document.createElement('span'); c.className = 'coupe';
    nom.append(n, c, e);
    t.append(v, ini, nom);
    $('vignettes').append(t);
  }
  function majTuileMedia(id) {
    const t = document.querySelector('.tuile[data-id="' + id + '"]'); if (!t) return;
    const p = id === 'moi' ? { camera: S.camera.actif, micro: S.micro.actif } : S.participants.get(id);
    if (!p) return;
    t.classList.toggle('sans-image', !p.camera);
    t.querySelector('.coupe').textContent = p.micro ? '' : 'micro coupé';
  }

  function ajouterFlux(id, flux, piste) {
    const t = document.querySelector('.tuile[data-id="' + id + '"]');
    if (t) { const v = t.querySelector('video'); if (v.srcObject !== flux) v.srcObject = flux; v.play().catch(() => {}); }
    if (piste.kind !== 'audio') return;
    let a = S.audios.get(id);
    if (!a) {
      // L'élément <audio> joue la voix, et sert aussi à Chrome pour alimenter l'AnalyserNode.
      a = document.createElement('audio'); a.autoplay = true; a.srcObject = flux; a.volume = S.volVoix;
      document.body.append(a); S.audios.set(id, a);
    }
    a.play().catch(() => {});
    if (S.ctx && !S.detecteurs.has(id)) {
      try { S.detecteurs.set(id, window.Son.creerDetecteur(S.ctx, flux)); S.voix.set(id, new window.Son.Voix()); } catch (e) { /* pas de détection */ }
    }
  }
  function retirerFlux(id) {
    const a = S.audios.get(id); if (a) { a.srcObject = null; a.remove(); S.audios.delete(id); }
    const d = S.detecteurs.get(id); if (d) { d.arreter(); S.detecteurs.delete(id); S.voix.delete(id); }
    const t = document.querySelector('.tuile[data-id="' + id + '"]'); if (t && !t.classList.contains('moi')) t.remove();
  }
  function reprendreAudios() {
    if (S.ctx && S.ctx.state === 'suspended') S.ctx.resume().catch(() => {});
    for (const a of S.audios.values()) if (a.paused) a.play().catch(() => {});
  }

  // ------------------------------------------------------------------ volumes et film baissé quand l'autre parle
  function appliquerVolumes() {
    video.volume = Math.max(0, Math.min(1, S.volFilm * S.duck));
    for (const a of S.audios.values()) a.volume = S.volVoix;
  }
  setInterval(() => {
    const maintenant = performance.now();
    let quelquunParle = false;
    for (const [id, d] of S.detecteurs) {
      const v = S.voix.get(id);
      const parle = v.mettreAJour(d.niveau(), maintenant);
      quelquunParle = quelquunParle || parle;
      const t = document.querySelector('.tuile[data-id="' + id + '"]'); if (t) t.classList.toggle('parle', parle);
    }
    const suivant = window.Son.facteurSuivant(S.duck, quelquunParle, S.duckActif);
    if (Math.abs(suivant - S.duck) > 0.001) { S.duck = suivant; appliquerVolumes(); }
  }, 100);

  // ------------------------------------------------------------------ caméra et micro
  async function demarrerMedias() {
    creerTuile('moi', S.prenom, true);
    const { flux, raison } = await window.ouvrirMedias();
    if (!flux) {
      toast(raison === 'refus' ? 'Caméra et micro refusés : vous suivez le film sans vous montrer.'
        : raison === 'insecure' ? 'La caméra et le micro demandent HTTPS (ou http://localhost).'
        : 'Aucune caméra ni aucun micro trouvé : vous suivez le film sans vous montrer.', 7000);
      mettreAJourBoutonsMedia();
      return;
    }
    S.fluxLocal = flux;
    const a = flux.getAudioTracks()[0]; const v = flux.getVideoTracks()[0];
    if (a) { S.micro.piste = a; S.micro.actif = true; }
    if (v) { S.camera.piste = v; S.camera.actif = true; }
    const tuile = document.querySelector('.tuile[data-id="moi"] video');
    tuile.srcObject = new MediaStream(v ? [v] : []);
    if (!a) toast('Pas de micro détecté.'); else if (!v) toast('Pas de caméra détectée.');
    if (S.appel) S.appel.definirLocal({ audio: S.micro.piste, video: S.camera.piste });
    mettreAJourBoutonsMedia();
    envoyerMedia();
  }
  function basculerPiste(o) {
    if (!o.piste) return;
    o.actif = !o.actif; o.piste.enabled = o.actif;
    mettreAJourBoutonsMedia(); envoyerMedia();
  }
  function mettreAJourBoutonsMedia() {
    const bm = $('b-micro'); const bc = $('b-camera');
    bm.disabled = !S.micro.piste; bc.disabled = !S.camera.piste;
    bm.innerHTML = S.micro.actif ? ICONES.micro : ICONES.microCoupe;
    bc.innerHTML = S.camera.actif ? ICONES.camera : ICONES.cameraCoupee;
    bm.classList.toggle('coupe', !S.micro.actif); bc.classList.toggle('coupe', !S.camera.actif);
    bm.setAttribute('aria-label', S.micro.piste ? (S.micro.actif ? 'Couper le micro' : 'Réactiver le micro') : 'Pas de micro');
    bc.setAttribute('aria-label', S.camera.piste ? (S.camera.actif ? 'Couper la caméra' : 'Réactiver la caméra') : 'Pas de caméra');
    bm.title = bm.getAttribute('aria-label'); bc.title = bc.getAttribute('aria-label');
    majTuileMedia('moi');
    const moi = document.querySelector('.tuile[data-id="moi"] .coupe');
    if (moi) moi.textContent = S.micro.actif ? '' : 'micro coupé';
  }
  function envoyerMedia() { envoyer({ type: 'media', micro: S.micro.actif, camera: S.camera.actif }); }

  // ------------------------------------------------------------------ vignettes déplaçables
  function initVignettes() {
    const v = $('vignettes');
    let decal = null;
    v.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = v.getBoundingClientRect();
      decal = { x: e.clientX - r.left, y: e.clientY - r.top };
      v.setPointerCapture(e.pointerId); v.classList.add('glisse');
    });
    v.addEventListener('pointermove', (e) => {
      if (!decal) return;
      const s = scene.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - s.left - decal.x, s.width - v.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - s.top - decal.y, s.height - v.offsetHeight));
      v.style.left = x + 'px'; v.style.top = y + 'px'; v.style.right = 'auto'; v.style.bottom = 'auto';
    });
    const fin = () => { decal = null; v.classList.remove('glisse'); };
    v.addEventListener('pointerup', fin); v.addEventListener('pointercancel', fin);
    const coins = [['12px', 'auto', 'auto', '12px'], ['auto', 'auto', '110px', '12px'], ['auto', '12px', '110px', 'auto'], ['12px', '12px', 'auto', 'auto']];
    let c = 3;
    v.addEventListener('dblclick', () => {
      c = (c + 1) % 4; const [t, r, b, l] = coins[c];
      v.style.top = t; v.style.right = r; v.style.bottom = b; v.style.left = l;
    });
  }

  init();
})();
