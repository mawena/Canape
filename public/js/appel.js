'use strict';
// Appel vidéo en maillage, motif « perfect negotiation » (polite / impolite).
(function (racine) {
  const LIBELLES = {
    new: 'connexion…', connecting: 'connexion…', connected: 'connecté', disconnected: 'instable',
    failed: 'échec, nouvelle tentative…', closed: 'fermé',
  };

  class Appel {
    // options : { moi, ice, envoyer(a, donnees), auFlux(id, flux, piste), auEtat(id, etat, libelle), auRetrait(id) }
    constructor(options) {
      this.o = options;
      this.pairs = new Map();
      this.audio = null;
      this.video = null;
    }

    // Piste locale (micro, caméra) : remplacée sur tous les pairs, sans renégociation.
    definirLocal({ audio, video }) {
      this.audio = audio || null;
      this.video = video || null;
      for (const p of this.pairs.values()) this._brancherLocal(p);
    }

    _brancherLocal(p) {
      p.tAudio.sender.replaceTrack(this.audio).catch(() => {});
      p.tVideo.sender.replaceTrack(this.video).catch(() => {});
    }

    ajouter(id) {
      if (this.pairs.has(id)) return this.pairs.get(id);
      const pc = new RTCPeerConnection({ iceServers: this.o.ice });
      const p = {
        id, pc, polite: this.o.moi > id, faisOffre: false, ignoreOffre: false,
        flux: new MediaStream(), file: Promise.resolve(), minuterie: null,
        tAudio: pc.addTransceiver('audio', { direction: 'sendrecv' }),
        tVideo: pc.addTransceiver('video', { direction: 'sendrecv' }),
      };
      this.pairs.set(id, p);
      this._brancherLocal(p);

      pc.ontrack = ({ track }) => {
        if (!p.flux.getTracks().includes(track)) p.flux.addTrack(track);
        this.o.auFlux(id, p.flux, track);
      };
      pc.onicecandidate = ({ candidate }) => { if (candidate) this.o.envoyer(id, { candidate }); };
      pc.onnegotiationneeded = async () => {
        try {
          p.faisOffre = true;
          await pc.setLocalDescription();
          this.o.envoyer(id, { description: pc.localDescription });
        } catch (e) { console.warn('négociation', e); } finally { p.faisOffre = false; }
      };
      pc.onconnectionstatechange = () => {
        const etat = pc.connectionState;
        this.o.auEtat(id, etat, LIBELLES[etat] || etat);
        clearTimeout(p.minuterie);
        if (etat === 'failed') pc.restartIce();
        else if (etat === 'disconnected') {
          p.minuterie = setTimeout(() => { if (pc.connectionState === 'disconnected') pc.restartIce(); }, 4000);
        }
      };
      return p;
    }

    signal(de, donnees) {
      const p = this.ajouter(de);
      p.file = p.file.then(() => this._traiter(p, donnees)).catch((e) => console.warn('signalisation', e));
    }

    async _traiter(p, { description, candidate }) {
      const pc = p.pc;
      if (description) {
        const collision = description.type === 'offer' && (p.faisOffre || pc.signalingState !== 'stable');
        p.ignoreOffre = !p.polite && collision;
        if (p.ignoreOffre) return;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this.o.envoyer(p.id, { description: pc.localDescription });
        }
      } else if (candidate) {
        try { await pc.addIceCandidate(candidate); } catch (e) { if (!p.ignoreOffre) throw e; }
      }
    }

    retirer(id) {
      const p = this.pairs.get(id);
      if (!p) return;
      clearTimeout(p.minuterie);
      p.pc.onnegotiationneeded = p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null;
      p.pc.close();
      this.pairs.delete(id);
      this.o.auRetrait(id);
    }

    fermer() { for (const id of [...this.pairs.keys()]) this.retirer(id); }
  }

  // Caméra et micro : le salon reste utilisable si l'un ou l'autre manque.
  async function ouvrirMedias() {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const video = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { flux: null, raison: 'insecure' };
    const essais = [{ audio, video }, { audio, video: false }, { audio: false, video }];
    let raison = 'absent';
    for (const contraintes of essais) {
      try {
        return { flux: await navigator.mediaDevices.getUserMedia(contraintes), raison: null };
      } catch (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { raison = 'refus'; break; }
      }
    }
    return { flux: null, raison };
  }

  racine.Appel = Appel;
  racine.ouvrirMedias = ouvrirMedias;
})(window);
