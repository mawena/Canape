'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ICE_DEFAUT = [{ urls: 'stun:stun.l.google.com:19302' }];

function lireFichier(chemin) {
  const valeurs = {};
  const texte = fs.readFileSync(chemin, 'utf8');
  for (const brut of texte.split(/\r?\n/)) {
    const ligne = brut.trim();
    if (!ligne || ligne.startsWith('#')) continue;
    const i = ligne.indexOf('=');
    if (i < 1) continue;
    const cle = ligne.slice(0, i).trim();
    let val = ligne.slice(i + 1).trim();
    if (val.length >= 2 && ((val[0] === '"' && val.endsWith('"')) || (val[0] === "'" && val.endsWith("'")))) {
      val = val.slice(1, -1);
    }
    valeurs[cle] = val;
  }
  return valeurs;
}

function entier(v, defaut, nom) {
  if (v === undefined || v === '') return defaut;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`${nom} doit être un nombre entier valide (reçu « ${v} »).`);
  return n;
}

// env : variables d'environnement (prioritaires) ; fichier : chemin d'un fichier CLÉ=valeur (facultatif).
function charger(env = process.env, fichier = null) {
  const depuisFichier = fichier ? lireFichier(fichier) : {};
  const v = { ...depuisFichier };
  for (const [k, val] of Object.entries(env)) if (k.startsWith('CANAPE_') && val !== undefined) v[k] = val;

  let ice = ICE_DEFAUT;
  if (v.CANAPE_ICE) {
    try {
      ice = JSON.parse(v.CANAPE_ICE);
      if (!Array.isArray(ice)) throw new Error('ce n\'est pas une liste');
    } catch (e) {
      throw new Error(`CANAPE_ICE n'est pas du JSON valide (${e.message}).`);
    }
  }
  const secretFourni = v.CANAPE_SECRET || '';
  return {
    hote: v.CANAPE_HOTE || '0.0.0.0',
    port: entier(v.CANAPE_PORT, 8080, 'CANAPE_PORT'),
    films: path.resolve(v.CANAPE_FILMS || './films'),
    motDePasse: v.CANAPE_MOT_DE_PASSE || '',
    secret: secretFourni || crypto.randomBytes(32).toString('hex'),
    secretAleatoire: !secretFourni,
    tlsCert: v.CANAPE_TLS_CERT || '',
    tlsCle: v.CANAPE_TLS_CLE || '',
    derriereProxy: v.CANAPE_DERRIERE_PROXY === '1' || v.CANAPE_DERRIERE_PROXY === 'true',
    ice,
    turnUrls: (v.CANAPE_TURN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean),
    turnSecret: v.CANAPE_TURN_SECRET || '',
  };
}

module.exports = { charger, lireFichier, ICE_DEFAUT };
