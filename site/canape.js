// Canapé : boutons « Copier » des commandes.
(function () {
  'use strict';
  document.querySelectorAll('.copier').forEach(function (bouton) {
    bouton.addEventListener('click', function () {
      var cible = document.getElementById(bouton.dataset.cible);
      if (!cible) return;
      var texte = cible.textContent;
      var fini = function () {
        bouton.textContent = 'Copié';
        setTimeout(function () { bouton.textContent = 'Copier'; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texte).then(fini, function () {});
      } else {
        var zone = document.createElement('textarea');
        zone.value = texte;
        document.body.appendChild(zone);
        zone.select();
        try { document.execCommand('copy'); fini(); } catch (e) { /* rien */ }
        document.body.removeChild(zone);
      }
    });
  });
})();
