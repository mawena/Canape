'use strict';
// Calculs de synchronisation purs (utilisables dans le navigateur et dans les tests Node).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Sync = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const SAUT = 1.0;        // écart au-delà duquel on saute à la bonne position (s)
  const RATTRAPAGE = 0.3;  // écart au-delà duquel on module la vitesse (s)
  const RETOUR = 0.1;      // écart sous lequel on revient à la vitesse normale (s)
  const VITESSE_ECART = 0.05;

  // Position attendue (s) d'après l'état du serveur et l'heure serveur courante (ms).
  function positionAttendue(etat, serveurMs) {
    if (!etat.lecture) return etat.position;
    return etat.position + Math.max(0, (serveurMs - etat.instant) / 1000);
  }

  // Échantillons { rtt, decalage } ; on garde celui au plus petit aller-retour (le moins bruité).
  function echantillon(t0, tServeur, t1) {
    const rtt = t1 - t0;
    return { rtt, decalage: tServeur + rtt / 2 - t1 }; // décalage = heure serveur - heure locale
  }
  function meilleurDecalage(echantillons) {
    if (!echantillons.length) return 0;
    return echantillons.reduce((m, e) => (e.rtt < m.rtt ? e : m)).decalage;
  }

  // ecart = position attendue - position actuelle (s, positif : on est en retard).
  // Renvoie { saut: position } ou { vitesse }.
  function decision(ecart, lecture, vitesseActuelle = 1) {
    const abs = Math.abs(ecart);
    if (!lecture) return abs > 0.05 ? { saut: true } : { vitesse: 1 };
    if (abs > SAUT) return { saut: true };
    if (abs > RATTRAPAGE) return { vitesse: 1 + Math.sign(ecart) * VITESSE_ECART };
    if (abs < RETOUR) return { vitesse: 1 };
    return { vitesse: vitesseActuelle === 1 ? 1 : 1 + Math.sign(ecart) * VITESSE_ECART };
  }

  function formaterTemps(s) {
    if (!Number.isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    const d = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${d(m)}:${d(sec)}` : `${m}:${d(sec)}`;
  }

  return { positionAttendue, echantillon, meilleurDecalage, decision, formaterTemps, SAUT, RATTRAPAGE, RETOUR };
});
