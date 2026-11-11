'use strict';
// Journal lisible sur la sortie standard (systemd le range dans journalctl).
let silencieux = false;

function heure() {
  return new Date().toLocaleTimeString('fr-FR', { hour12: false });
}

function ecrire(niveau, message) {
  if (silencieux) return;
  const ligne = `${heure()} ${niveau} ${message}`;
  if (niveau === 'ERREUR') console.error(ligne);
  else console.log(ligne);
}

module.exports = {
  info: (m) => ecrire('INFO  ', m),
  avertir: (m) => ecrire('ATTENTION', m),
  erreur: (m) => ecrire('ERREUR', m),
  silence(oui) { silencieux = !!oui; },
};
