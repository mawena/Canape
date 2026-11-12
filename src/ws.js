'use strict';
const { WebSocketServer } = require('ws');
const auth = require('./auth');
const films = require('./films');
const journal = require('./journal');

const TAILLE_MAX_MESSAGE = 64 * 1024;

// Origine acceptée : même hôte que la requête (les navigateurs envoient toujours Origin sur un WebSocket).
function origineValide(req, derriereProxy) {
  const origine = req.headers.origin;
  if (!origine) return true;
  let hote;
  try { hote = new URL(origine).host; } catch { return false; }
  const attendus = [req.headers.host];
  if (derriereProxy && req.headers['x-forwarded-host']) attendus.push(String(req.headers['x-forwarded-host']).split(',')[0].trim());
  return attendus.includes(hote);
}

function attacher({ serveur, config, salon, lireSession }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: TAILLE_MAX_MESSAGE });
  const sockets = new Map(); // id -> ws

  function envoyer(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
  function diffuser(msg, sauf = null) {
    for (const [id, ws] of sockets) if (id !== sauf) envoyer(ws, msg);
  }
  function diffuserEtat(raison, par) {
    diffuser({ type: 'etat', etat: salon.instantane(), raison, par });
  }

  serveur.on('upgrade', (req, socket, tete) => {
    const refuser = (code, texte) => {
      socket.write(`HTTP/1.1 ${code} ${texte}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return refuser(404, 'Not Found');
    if (!origineValide(req, config.derriereProxy)) return refuser(403, 'Forbidden');
    const session = lireSession(req);
    if (!session) return refuser(401, 'Unauthorized');
    if (salon.complet) return refuser(503, 'Service Unavailable');
    wss.handleUpgrade(req, socket, tete, (ws) => connecter(ws, session));
  });

  function connecter(ws, session) {
    const moi = salon.ajouter(session.prenom);
    if (!moi) { ws.close(4001, 'Salon complet'); return; }
    sockets.set(moi.id, ws);
    ws.vivant = true;
    ws.on('pong', () => { ws.vivant = true; });
    journal.info(`${moi.prenom} est arrivé·e dans le salon (${salon.participants.size}/${salon.max})`);

    envoyer(ws, {
      type: 'bienvenue', id: moi.id, prenom: moi.prenom, serveur: Date.now(),
      participants: [...salon.participants.values()].filter((p) => p.id !== moi.id),
      etat: salon.instantane(),
    });
    diffuser({ type: 'arrivee', participant: moi }, moi.id);

    ws.on('message', (data, binaire) => {
      if (binaire) return;
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return envoyer(ws, { type: 'erreur', message: 'Message illisible.' }); }
      if (!msg || typeof msg.type !== 'string') return;
      traiter(moi, ws, msg).catch((e) => journal.erreur(`message « ${msg.type} » : ${e.message}`));
    });

    ws.on('close', () => {
      sockets.delete(moi.id);
      const { participant, reprise } = salon.retirer(moi.id);
      if (participant) {
        journal.info(`${participant.prenom} a quitté le salon`);
        diffuser({ type: 'depart', id: moi.id, prenom: participant.prenom });
        if (reprise) diffuserEtat(reprise, moi.id);
      }
    });
    ws.on('error', () => {});
  }

  async function traiter(moi, ws, msg) {
    switch (msg.type) {
      case 'ping':
        envoyer(ws, { type: 'pong', t: msg.t, serveur: Date.now() });
        break;
      case 'lecture': case 'pause': case 'position': {
        const raison = salon.action(moi.id, { type: msg.type, position: msg.position, fin: msg.fin === true });
        if (raison) diffuserEtat(raison, moi.id);
        break;
      }
      case 'film': {
        let chemin = null;
        if (msg.film !== null && msg.film !== undefined) {
          if (typeof msg.film !== 'string' || !films.estFilm(msg.film)) return envoyer(ws, { type: 'erreur', message: 'Film inconnu.' });
          if (!(await films.resoudre(config.films, msg.film))) return envoyer(ws, { type: 'erreur', message: 'Film introuvable.' });
          chemin = msg.film;
        }
        const raison = salon.action(moi.id, { type: 'film', film: chemin });
        if (raison) { journal.info(`${moi.prenom} choisit ${chemin || 'aucun film'}`); diffuserEtat(raison, moi.id); }
        break;
      }
      case 'tampon': {
        const raison = salon.tampon(moi.id, msg.enCours === true);
        if (raison) diffuserEtat(raison, moi.id);
        break;
      }
      case 'media': {
        const p = salon.media(moi.id, { micro: msg.micro, camera: msg.camera });
        if (p) diffuser({ type: 'media', id: p.id, micro: p.micro, camera: p.camera }, moi.id);
        break;
      }
      case 'signal': {
        const cible = sockets.get(msg.a);
        if (!cible || msg.a === moi.id || typeof msg.donnees !== 'object' || msg.donnees === null) return;
        envoyer(cible, { type: 'signal', de: moi.id, donnees: msg.donnees });
        break;
      }
      default:
        break;
    }
  }

  const battement = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.vivant) { ws.terminate(); continue; }
      ws.vivant = false;
      try { ws.ping(); } catch { /* ignoré */ }
    }
  }, 25000);
  battement.unref();

  return { wss, sockets, fermer() { clearInterval(battement); for (const ws of wss.clients) ws.terminate(); wss.close(); } };
}

module.exports = { attacher, origineValide, TAILLE_MAX_MESSAGE };
