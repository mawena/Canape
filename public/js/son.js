'use strict';
// Détection de la voix d'un flux distant (AnalyserNode) et baisse en douceur du film.
(function (racine) {
  // Le flux doit aussi être attaché à un élément <audio> (bug de Chrome : sans cela WebAudio ne reçoit rien).
  function creerDetecteur(contexte, flux) {
    const source = contexte.createMediaStreamSource(new MediaStream(flux.getAudioTracks()));
    const analyseur = contexte.createAnalyser();
    analyseur.fftSize = 1024;
    source.connect(analyseur); // volontairement pas relié à la sortie : le son sort par l'élément <audio>
    const donnees = new Uint8Array(analyseur.fftSize);
    return {
      niveau() {
        analyseur.getByteTimeDomainData(donnees);
        let somme = 0;
        for (let i = 0; i < donnees.length; i++) { const v = (donnees[i] - 128) / 128; somme += v * v; }
        return Math.sqrt(somme / donnees.length);
      },
      arreter() { try { source.disconnect(); } catch (e) { /* déjà fait */ } },
    };
  }

  // Suit qui parle : une voix est « en cours » tant qu'elle a dépassé le seuil dans les 700 dernières ms.
  class Voix {
    constructor(seuil = 0.02, maintienMs = 700) { this.seuil = seuil; this.maintienMs = maintienMs; this.dernier = 0; }
    mettreAJour(niveau, maintenant) { if (niveau > this.seuil) this.dernier = maintenant; return this.parle(maintenant); }
    parle(maintenant) { return maintenant - this.dernier < this.maintienMs; }
  }

  // Facteur appliqué au volume du film : 1 -> 0,6 (environ -40 %) quand quelqu'un parle, lissé.
  function facteurSuivant(actuel, quelquunParle, actif) {
    const cible = actif && quelquunParle ? 0.6 : 1;
    return actuel + (cible - actuel) * 0.25;
  }

  racine.Son = { creerDetecteur, Voix, facteurSuivant };
  if (typeof module === 'object' && module.exports) module.exports = racine.Son;
})(typeof window !== 'undefined' ? window : (typeof module === 'object' ? {} : this));
