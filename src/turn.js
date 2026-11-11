'use strict';
const crypto = require('crypto');

// Identifiants temporaires façon coturn `use-auth-secret` :
// utilisateur = horodatage d'expiration (secondes), mot de passe = base64(HMAC-SHA1(secret, utilisateur)).
function identifiantsTurn(secret, maintenant = Date.now(), dureeS = 12 * 3600) {
  const username = String(Math.floor(maintenant / 1000) + dureeS);
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}

function serveursIce(config, maintenant = Date.now()) {
  const liste = [...config.ice];
  if (config.turnUrls.length && config.turnSecret) {
    liste.push({ urls: config.turnUrls, ...identifiantsTurn(config.turnSecret, maintenant) });
  }
  return liste;
}

module.exports = { identifiantsTurn, serveursIce };
