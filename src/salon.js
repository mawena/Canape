'use strict';

const MAX_PARTICIPANTS = 4;

function positionValide(p) {
  return typeof p === 'number' && Number.isFinite(p) && p >= 0 && p < 1e7;
}

// État du salon, tenu par le serveur. Logique pure : pas de réseau, horloge injectée.
class Salon {
  constructor({ maintenant = Date.now, max = MAX_PARTICIPANTS } = {}) {
    this.maintenant = maintenant;
    this.max = max;
    this.participants = new Map(); // id -> { id, prenom, micro, camera }
    this.prochainId = 1;
    this.tampons = new Set(); // ids des participants qui chargent
    this.etat = { film: null, lecture: false, position: 0, instant: this.maintenant(), version: 0 };
    this.reprise = false; // la lecture reprendra quand tout le monde sera prêt
  }

  get complet() { return this.participants.size >= this.max; }

  ajouter(prenom) {
    if (this.complet) return null;
    const p = { id: this.prochainId++, prenom: nettoyerPrenom(prenom), micro: false, camera: false };
    this.participants.set(p.id, p);
    return p;
  }

  // Renvoie le changement d'état éventuel (reprise de la lecture quand le dernier qui chargeait part).
  retirer(id) {
    const p = this.participants.get(id);
    this.participants.delete(id);
    const etait = this.tampons.delete(id);
    const reprise = etait ? this._maybeReprendre() : null;
    return { participant: p || null, reprise };
  }

  media(id, { micro, camera }) {
    const p = this.participants.get(id);
    if (!p) return null;
    p.micro = !!micro; p.camera = !!camera;
    return p;
  }

  positionAttendue(t = this.maintenant()) {
    const e = this.etat;
    return e.lecture ? e.position + Math.max(0, (t - e.instant) / 1000) : e.position;
  }

  instantane() {
    const t = this.maintenant();
    return {
      ...this.etat,
      attente: [...this.tampons].map((id) => (this.participants.get(id) || {}).prenom).filter(Boolean),
      serveur: t,
    };
  }

  _fixer(changes) {
    this.etat = { ...this.etat, ...changes, instant: this.maintenant(), version: this.etat.version + 1 };
  }

  // action : { type: 'lecture'|'pause'|'position'|'film', position?, film? }. Renvoie la raison ou null.
  action(id, a) {
    if (!this.participants.has(id)) return null;
    const pos = positionValide(a.position) ? a.position : this.positionAttendue();
    switch (a.type) {
      case 'lecture':
        if (this.tampons.size) { this.reprise = true; this._fixer({ lecture: false, position: pos }); return 'lecture-attente'; }
        this.reprise = false;
        this._fixer({ lecture: true, position: pos });
        return 'lecture';
      case 'pause':
        this.reprise = false;
        this._fixer({ lecture: false, position: pos });
        return a.fin ? 'fin' : 'pause';
      case 'position':
        this._fixer({ position: pos });
        return 'position';
      case 'film':
        this.tampons.clear();
        this.reprise = false;
        this._fixer({ film: a.film || null, lecture: false, position: 0 });
        return 'film';
      default:
        return null;
    }
  }

  // Un participant charge (enCours = true) ou est prêt (false). Renvoie 'attente' / 'reprise' si l'état change.
  tampon(id, enCours) {
    if (!this.participants.has(id)) return null;
    if (enCours) {
      const deja = this.tampons.has(id);
      this.tampons.add(id);
      if (this.etat.lecture) {
        this.reprise = true;
        this._fixer({ lecture: false, position: this.positionAttendue() });
        return 'attente';
      }
      return deja ? null : 'attente-info';
    }
    if (!this.tampons.delete(id)) return null;
    return this._maybeReprendre() || 'attente-info';
  }

  _maybeReprendre() {
    if (this.tampons.size === 0 && this.reprise) {
      this.reprise = false;
      this._fixer({ lecture: true });
      return 'reprise';
    }
    return this.tampons.size === 0 ? 'attente-info' : null;
  }
}

function nettoyerPrenom(p) {
  const s = String(p || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
  return s || 'Invité';
}

module.exports = { Salon, nettoyerPrenom, MAX_PARTICIPANTS };
