'use strict';
const crypto = require('crypto');

const NOM_COOKIE = 'canape_session';
const DUREE_SESSION_S = 7 * 24 * 3600;

function b64u(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signer(secret, texte) {
  return crypto.createHmac('sha256', secret).update(texte).digest('base64url');
}

function egauxTempsConstant(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Jeton : base64url(JSON) + "." + HMAC-SHA256
function creerJeton(secret, donnees, maintenant = Date.now(), dureeS = DUREE_SESSION_S) {
  const charge = b64u(JSON.stringify({ ...donnees, exp: Math.floor(maintenant / 1000) + dureeS }));
  return `${charge}.${signer(secret, charge)}`;
}

function verifierJeton(secret, jeton, maintenant = Date.now()) {
  if (typeof jeton !== 'string') return null;
  const i = jeton.indexOf('.');
  if (i < 1) return null;
  const charge = jeton.slice(0, i);
  if (!egauxTempsConstant(signer(secret, charge), jeton.slice(i + 1))) return null;
  try {
    const d = JSON.parse(Buffer.from(charge, 'base64url').toString('utf8'));
    if (!d || typeof d.exp !== 'number' || d.exp * 1000 < maintenant) return null;
    return d;
  } catch {
    return null;
  }
}

function lireCookies(entete) {
  const out = {};
  if (!entete) return out;
  for (const part of entete.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignoré */ }
  }
  return out;
}

function cookieSession(jeton, { securise = false, dureeS = DUREE_SESSION_S } = {}) {
  return `${NOM_COOKIE}=${jeton}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${dureeS}${securise ? '; Secure' : ''}`;
}
function cookieEffacement({ securise = false } = {}) {
  return `${NOM_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securise ? '; Secure' : ''}`;
}

// Limiteur d'essais : au plus `max` échecs par fenêtre, par clé (adresse IP).
class Limiteur {
  constructor({ max = 5, fenetreMs = 60000, maintenant = Date.now } = {}) {
    this.max = max; this.fenetreMs = fenetreMs; this.maintenant = maintenant;
    this.echecs = new Map();
  }
  _purger(cle) {
    const t = this.maintenant();
    const liste = (this.echecs.get(cle) || []).filter((x) => t - x < this.fenetreMs);
    if (liste.length) this.echecs.set(cle, liste); else this.echecs.delete(cle);
    return liste;
  }
  bloque(cle) { return this._purger(cle).length >= this.max; }
  echec(cle) { const l = this._purger(cle); l.push(this.maintenant()); this.echecs.set(cle, l); }
  reussite(cle) { this.echecs.delete(cle); }
}

module.exports = {
  NOM_COOKIE, DUREE_SESSION_S, creerJeton, verifierJeton, lireCookies, cookieSession, cookieEffacement,
  egauxTempsConstant, Limiteur,
};
