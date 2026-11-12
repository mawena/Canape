// Appel vidéo en maillage WebRTC, motif « perfect negotiation » (porté de la 0.1, éprouvée à deux navigateurs).
//
// Correctif important : le nouvel arrivant n'envoie PAS l'offre initiale, ceux déjà présents la font (à la réception
// de `arrivee`). Sinon, des offres simultanées laissaient Chrome avec un transport ICE qui ne démarre jamais.

export type EtatPair = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface OptionsAppel {
  /** `cid` de cette connexion. */
  moi: string;
  ice: RTCIceServer[];
  envoyer: (a: string, donnees: unknown) => void;
  auFlux: (cid: string, flux: MediaStream, piste: MediaStreamTrack) => void;
  auEtat: (cid: string, etat: EtatPair) => void;
  auRetrait: (cid: string) => void;
  /** Qualité de la liaison avec ce pair (`true` = faible). */
  auQualite?: (cid: string, faible: boolean) => void;
}

/** Débit maximal de la caméra (bit/s) et cadence : on laisse la bande passante au film. */
export const DEBIT_CAMERA = 300_000;
export const CADENCE_CAMERA = 24;

/** Qui est « poli » dans la négociation : celui dont le `cid` est le plus grand cède en cas de collision. */
export function estPoli(moi: string, autre: string): boolean {
  return moi > autre;
}

export interface MesuresReseau {
  recus: number;
  perdus: number;
  /** Aller-retour (s) du chemin ICE sélectionné. */
  rtt: number | null;
}

/** Liaison faible : plus de 8 % de paquets vidéo perdus sur la période, ou un aller-retour de plus de 600 ms. */
export function liaisonFaible(avant: MesuresReseau | null, apres: MesuresReseau): boolean {
  if (apres.rtt !== null && apres.rtt > 0.6) return true;
  if (!avant) return false;
  const recus = apres.recus - avant.recus;
  const perdus = apres.perdus - avant.perdus;
  const total = recus + perdus;
  return total >= 20 && perdus / total > 0.08;
}

interface Pair {
  cid: string;
  pc: RTCPeerConnection;
  poli: boolean;
  faisOffre: boolean;
  ignoreOffre: boolean;
  flux: MediaStream;
  file: Promise<void>;
  minuterie: ReturnType<typeof setTimeout> | null;
  attendreOffre: boolean;
  tAudio: RTCRtpTransceiver;
  tVideo: RTCRtpTransceiver;
  mesures: MesuresReseau | null;
}

export class Appel {
  private pairs = new Map<string, Pair>();
  private audio: MediaStreamTrack | null = null;
  private video: MediaStreamTrack | null = null;
  private sonde: ReturnType<typeof setInterval> | null = null;

  private readonly o: OptionsAppel;

  constructor(o: OptionsAppel) {
    this.o = o;
    this.sonde = setInterval(() => void this.mesurer(), 4000);
  }

  has(cid: string): boolean {
    return this.pairs.has(cid);
  }

  /** Pistes locales (micro, caméra) : remplacées chez tous les pairs sans renégociation. */
  definirLocal(audio: MediaStreamTrack | null, video: MediaStreamTrack | null): void {
    this.audio = audio;
    this.video = video;
    for (const p of this.pairs.values()) this.brancherLocal(p);
  }

  private brancherLocal(p: Pair): void {
    void p.tAudio.sender.replaceTrack(this.audio).catch(() => {});
    void p.tVideo.sender.replaceTrack(this.video).then(() => this.limiterDebit(p)).catch(() => {});
  }

  private async limiterDebit(p: Pair): Promise<void> {
    const s = p.tVideo.sender;
    const params = s.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    const e = params.encodings[0];
    if (!e) return;
    e.maxBitrate = DEBIT_CAMERA;
    e.maxFramerate = CADENCE_CAMERA;
    await s.setParameters(params).catch(() => {});
  }

  /** `attendreOffre` : le nouvel arrivant laisse l'offre initiale à ceux qui sont déjà là. */
  ajouter(cid: string, { attendreOffre = false } = {}): Pair {
    const existant = this.pairs.get(cid);
    if (existant) return existant;
    const pc = new RTCPeerConnection({ iceServers: this.o.ice });
    const p: Pair = {
      cid, pc, poli: estPoli(this.o.moi, cid), faisOffre: false, ignoreOffre: false,
      flux: new MediaStream(), file: Promise.resolve(), minuterie: null, attendreOffre, mesures: null,
      tAudio: pc.addTransceiver('audio', { direction: 'sendrecv' }),
      tVideo: pc.addTransceiver('video', { direction: 'sendrecv' }),
    };
    this.pairs.set(cid, p);
    this.brancherLocal(p);

    pc.ontrack = ({ track }) => {
      if (!p.flux.getTracks().includes(track)) p.flux.addTrack(track);
      this.o.auFlux(cid, p.flux, track);
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.o.envoyer(cid, { candidate });
    };
    pc.onnegotiationneeded = async () => {
      if (p.attendreOffre && !pc.remoteDescription) return;
      try {
        p.faisOffre = true;
        await pc.setLocalDescription();
        this.o.envoyer(cid, { description: pc.localDescription });
      } catch (e) {
        console.warn('négociation', e);
      } finally {
        p.faisOffre = false;
      }
    };
    pc.onconnectionstatechange = () => {
      const etat = pc.connectionState as EtatPair;
      this.o.auEtat(cid, etat);
      if (p.minuterie) clearTimeout(p.minuterie);
      if (etat === 'failed') pc.restartIce();
      else if (etat === 'disconnected') {
        p.minuterie = setTimeout(() => {
          if (pc.connectionState === 'disconnected') pc.restartIce();
        }, 4000);
      }
    };
    return p;
  }

  /** Signalisation reçue (`signal { de, donnees }`). */
  signal(de: string, donnees: unknown): void {
    const p = this.ajouter(de);
    p.file = p.file.then(() => this.traiter(p, donnees as { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }))
      .catch((e) => console.warn('signalisation', e));
  }

  private async traiter(p: Pair, { description, candidate }: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }): Promise<void> {
    const pc = p.pc;
    if (description) {
      const collision = description.type === 'offer' && (p.faisOffre || pc.signalingState !== 'stable');
      p.ignoreOffre = !p.poli && collision;
      if (p.ignoreOffre) return;
      await pc.setRemoteDescription(description);
      p.attendreOffre = false;
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        this.o.envoyer(p.cid, { description: pc.localDescription });
      }
    } else if (candidate) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (e) {
        if (!p.ignoreOffre) throw e;
      }
    }
  }

  /** Relance ICE chez tous les pairs (retour du réseau). */
  relancer(): void {
    for (const p of this.pairs.values()) p.pc.restartIce();
  }

  private async mesurer(): Promise<void> {
    if (!this.o.auQualite) return;
    for (const p of this.pairs.values()) {
      if (p.pc.connectionState !== 'connected') continue;
      try {
        const stats = await p.pc.getStats();
        let recus = 0;
        let perdus = 0;
        let rtt: number | null = null;
        stats.forEach((s: Record<string, unknown>) => {
          if (s['type'] === 'inbound-rtp' && s['kind'] === 'video') {
            recus += Number(s['packetsReceived'] ?? 0);
            perdus += Number(s['packetsLost'] ?? 0);
          } else if (s['type'] === 'candidate-pair' && s['nominated'] && typeof s['currentRoundTripTime'] === 'number') {
            rtt = s['currentRoundTripTime'];
          }
        });
        const m: MesuresReseau = { recus, perdus, rtt };
        this.o.auQualite(p.cid, liaisonFaible(p.mesures, m));
        p.mesures = m;
      } catch {
        /* pair fermé entre-temps */
      }
    }
  }

  retirer(cid: string): void {
    const p = this.pairs.get(cid);
    if (!p) return;
    if (p.minuterie) clearTimeout(p.minuterie);
    p.pc.onnegotiationneeded = p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null;
    p.pc.close();
    this.pairs.delete(cid);
    this.o.auRetrait(cid);
  }

  fermer(): void {
    if (this.sonde) clearInterval(this.sonde);
    this.sonde = null;
    for (const cid of [...this.pairs.keys()]) this.retirer(cid);
  }
}
