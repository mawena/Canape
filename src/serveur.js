'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const auth = require('./auth');
const filmsMod = require('./films');
const { versVtt } = require('./srt');
const { typeMime } = require('./mime');
const { serveursIce } = require('./turn');
const { Salon, nettoyerPrenom } = require('./salon');
const { attacher } = require('./ws');
const journal = require('./journal');
const version = require('./version');

const PUBLIC = path.join(__dirname, '..', 'public');
const CSP = "default-src 'self'; media-src 'self' blob:; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function creer(config) {
  const salon = new Salon();
  const limiteur = new auth.Limiteur({ max: 5, fenetreMs: 60000 });

  const https_ = (req) => !!req.socket.encrypted || (config.derriereProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
  const ipDe = (req) => (config.derriereProxy && req.headers['x-forwarded-for'])
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;

  function lireSession(req) {
    const jeton = auth.lireCookies(req.headers.cookie)[auth.NOM_COOKIE];
    const donnees = jeton ? auth.verifierJeton(config.secret, jeton) : null;
    if (donnees) return donnees;
    if (!config.motDePasse) return { prenom: 'Invité' }; // accès libre
    return null;
  }

  function json(res, code, objet, entetes = {}) {
    const corps = JSON.stringify(objet);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...entetes });
    res.end(corps);
  }
  function texte(res, code, message) {
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(message);
  }

  function lireCorps(req, max = 4096) {
    return new Promise((resolve, reject) => {
      let taille = 0; const morceaux = [];
      req.on('data', (c) => {
        taille += c.length;
        if (taille > max) { reject(new Error('trop gros')); req.destroy(); return; }
        morceaux.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
      req.on('error', reject);
    });
  }

  // Envoie un fichier avec gestion de Range (206), HEAD et types MIME.
  function envoyerFichier(req, res, chemin, stat, type, cache = 'no-cache') {
    const entetes = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'Last-Modified': stat.mtime.toUTCString() };
    let debut = 0; let fin = stat.size - 1; let code = 200;
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      if (!m || (m[1] === '' && m[2] === '')) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
      if (m[1] === '') { // suffixe : les N derniers octets
        const n = Number(m[2]);
        debut = Math.max(0, stat.size - n);
      } else {
        debut = Number(m[1]);
        if (m[2] !== '') fin = Math.min(Number(m[2]), stat.size - 1);
      }
      if (debut > fin || debut >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
      code = 206;
      entetes['Content-Range'] = `bytes ${debut}-${fin}/${stat.size}`;
    }
    entetes['Content-Length'] = stat.size === 0 ? 0 : fin - debut + 1;
    res.writeHead(code, entetes);
    if (req.method === 'HEAD' || stat.size === 0) return res.end();
    const flux = fs.createReadStream(chemin, { start: debut, end: fin });
    flux.on('error', () => res.destroy());
    res.on('close', () => flux.destroy());
    flux.pipe(res);
  }

  async function servirStatique(req, res, pathname) {
    let rel = pathname === '/' ? '/index.html' : pathname;
    let cible;
    try { cible = path.join(PUBLIC, decodeURIComponent(rel)); } catch { return texte(res, 400, 'Requête invalide.'); }
    if (!cible.startsWith(PUBLIC + path.sep) || cible.includes('\0')) return texte(res, 403, 'Interdit.');
    let st;
    try { st = await fsp.stat(cible); } catch { return texte(res, 404, 'Introuvable.'); }
    if (!st.isFile()) return texte(res, 404, 'Introuvable.');
    envoyerFichier(req, res, cible, st, typeMime(cible));
  }

  async function traiter(req, res) {
    const url = new URL(req.url, 'http://x');
    const pathname = url.pathname;
    const securise = https_(req);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), fullscreen=(self)');
    if (!pathname.startsWith('/films/')) res.setHeader('Content-Security-Policy', CSP);
    if (securise) res.setHeader('Strict-Transport-Security', 'max-age=15552000');

    if (pathname === '/api/etat' && req.method === 'GET') {
      const jeton = auth.lireCookies(req.headers.cookie)[auth.NOM_COOKIE];
      const session = jeton ? auth.verifierJeton(config.secret, jeton) : null;
      return json(res, 200, {
        version, connecte: !!session, motDePasseRequis: !!config.motDePasse, prenom: session ? session.prenom : null,
      });
    }

    if (pathname === '/api/connexion' && req.method === 'POST') {
      const ip = ipDe(req);
      if (limiteur.bloque(ip)) return json(res, 429, { erreur: 'Trop d\'essais. Patientez une minute.' }, { 'Retry-After': '60' });
      let corps;
      try { corps = JSON.parse(await lireCorps(req)); } catch { return json(res, 400, { erreur: 'Requête invalide.' }); }
      if (!corps || typeof corps !== 'object') return json(res, 400, { erreur: 'Requête invalide.' });
      if (config.motDePasse && !auth.egauxTempsConstant(String(corps.motDePasse || ''), config.motDePasse)) {
        limiteur.echec(ip);
        return json(res, 401, { erreur: 'Mot de passe incorrect.' });
      }
      limiteur.reussite(ip);
      const jeton = auth.creerJeton(config.secret, { prenom: nettoyerPrenom(corps.prenom) });
      res.writeHead(204, { 'Set-Cookie': auth.cookieSession(jeton, { securise }), 'Cache-Control': 'no-store' });
      return res.end();
    }

    // Tout ce qui suit demande une session.
    const estApi = pathname.startsWith('/api/') || pathname.startsWith('/films/') || pathname.startsWith('/sous-titres/');
    if (!estApi) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return texte(res, 405, 'Méthode non permise.');
      return servirStatique(req, res, pathname);
    }

    if (pathname === '/api/deconnexion' && req.method === 'POST') {
      res.writeHead(204, { 'Set-Cookie': auth.cookieEffacement({ securise }) });
      return res.end();
    }

    const session = lireSession(req);
    if (!session) return json(res, 401, { erreur: 'Connexion requise.' });

    if (pathname === '/api/films' && req.method === 'GET') {
      return json(res, 200, { films: await filmsMod.lister(config.films) });
    }
    if (pathname === '/api/config' && req.method === 'GET') {
      return json(res, 200, { iceServers: serveursIce(config), participantsMax: salon.max });
    }
    if (pathname.startsWith('/films/') && (req.method === 'GET' || req.method === 'HEAD')) {
      let rel;
      try { rel = decodeURIComponent(pathname.slice('/films/'.length)); } catch { return texte(res, 400, 'Requête invalide.'); }
      if (!filmsMod.estFilm(rel)) return texte(res, 404, 'Introuvable.');
      const reel = await filmsMod.resoudre(config.films, rel);
      if (!reel) return texte(res, 404, 'Introuvable.');
      const st = await fsp.stat(reel);
      if (!st.isFile()) return texte(res, 404, 'Introuvable.');
      return envoyerFichier(req, res, reel, st, typeMime(reel), 'private, max-age=3600');
    }
    if (pathname.startsWith('/sous-titres/') && (req.method === 'GET' || req.method === 'HEAD')) {
      let rel;
      try { rel = decodeURIComponent(pathname.slice('/sous-titres/'.length)); } catch { return texte(res, 400, 'Requête invalide.'); }
      if (!filmsMod.estSousTitres(rel)) return texte(res, 404, 'Introuvable.');
      const reel = await filmsMod.resoudre(config.films, rel);
      if (!reel) return texte(res, 404, 'Introuvable.');
      const st = await fsp.stat(reel);
      if (!st.isFile() || st.size > 5 * 1024 * 1024) return texte(res, 404, 'Introuvable.');
      const vtt = versVtt(await fsp.readFile(reel), path.extname(reel).toLowerCase());
      res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, max-age=300' });
      return res.end(req.method === 'HEAD' ? undefined : vtt);
    }
    return json(res, 404, { erreur: 'Introuvable.' });
  }

  const gestionnaire = (req, res) => {
    traiter(req, res).catch((e) => {
      journal.erreur(`${req.method} ${req.url} : ${e.message}`);
      if (!res.headersSent) texte(res, 500, 'Erreur du serveur.'); else res.destroy();
    });
  };

  const tls = config.tlsCert && config.tlsCle;
  const serveur = tls
    ? https.createServer({ cert: fs.readFileSync(config.tlsCert), key: fs.readFileSync(config.tlsCle) }, gestionnaire)
    : http.createServer(gestionnaire);
  const ws = attacher({ serveur, config, salon, lireSession });

  return {
    serveur, salon, tls: !!tls,
    demarrer() {
      return new Promise((resolve, reject) => {
        serveur.once('error', reject);
        serveur.listen(config.port, config.hote, () => {
          serveur.removeListener('error', reject);
          resolve(serveur.address());
        });
      });
    },
    arreter() {
      return new Promise((resolve) => {
        ws.fermer();
        serveur.close(() => resolve());
        if (serveur.closeAllConnections) serveur.closeAllConnections();
      });
    },
  };
}

module.exports = { creer };
