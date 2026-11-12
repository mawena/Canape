// Contrôleur de la salle : relie le WebSocket, le moteur de synchro, l'appel WebRTC, le son et l'état affiché.
// Tout l'état réactif de la page vit ici (Svelte 5, runes) ; les composants ne font que l'afficher.
import { EMOJIS, LIMITES_WS, type Emoji, type EtatApi, type PlanDeLecture, type Seance, type UtilisateurPublic } from '@canape/partage';
import { api } from '$lib/api/client.ts';
import { attacherLecture, chargerPlan } from '$lib/lecture/attacher.ts';
import { Appel, type EtatPair } from './appel.ts';
import { etatSynchro, indexPisteTexte, phraseAttente, retiresAttente, texteAnnonce, type EtatSynchro } from './annonces.ts';
import { ClientWs, urlWsSeance } from './client-ws.ts';
import { detecteurVoix, lirePeripheriques, type Peripheriques } from './medias.ts';
import { MoteurSynchro } from './moteur.ts';
import { ecrirePrefs, lirePrefs, type Coin, type PrefsSalle } from './prefs.ts';
import { ajouterReaction, annonceReactions, FabriqueReactions, purgerReactions, type ReactionFlottante, DUREE_REACTION } from './reactions.ts';
import { aUnCasque, BaisseFilm, volumeFilm, Voix } from './son.ts';
import { Horloge } from './synchro.ts';
import type { EtatLiaison, EtatSeance, MessageChatWs, MessageServeur, Participant, RaisonEtat } from './types.ts';

export interface PersonneSalle {
  cid: string;
  utilisateur: UtilisateurPublic;
  soi: boolean;
  micro: boolean;
  camera: boolean;
  tampon: boolean;
  pair: EtatPair;
  faible: boolean;
  parle: boolean;
  flux: MediaStream | null;
  /** Volume de cette personne chez toi (0–1). */
  volume: number;
  /** Image perdue depuis plus de 8 s. */
  imagePerdue: boolean;
}

export interface LigneChat {
  cle: string;
  genre: 'message' | 'systeme';
  utilisateurId: number | null;
  prenom: string | null;
  texte: string;
  heure: number;
  soi: boolean;
}

export interface Annonce {
  id: number;
  genre: string;
  texte: string;
}

export type Phase = 'sas' | 'salle';

const DUREE_ANNONCE = 2500;

export class Salle {
  readonly seanceId: string;
  phase: Phase = $state('sas');
  liaison: EtatLiaison = $state('connexion');
  seance: Seance | null = $state(null);
  moi: PersonneSalle | null = $state(null);
  autres: PersonneSalle[] = $state([]);
  etat: EtatSeance | null = $state(null);
  plan: PlanDeLecture | null = $state(null);
  erreurPlan: string | null = $state(null);
  prefs: PrefsSalle = $state(lirePrefs());
  peripheriques: Peripheriques = $state({ micros: [], cameras: [], sorties: [] });
  casqueDetecte = $state(false);

  // Lecteur
  temps = $state(0);
  duree = $state(0);
  tamponFin = $state(0);
  ecart = $state(0);
  vitesse = $state(1);
  bloque = $state(false);
  chargement = $state(true);

  // Interface
  annonces: Annonce[] = $state([]);
  reactions: ReactionFlottante[] = $state([]);
  annonceReaction = $state('');
  lignes: LigneChat[] = $state([]);
  nonLus = $state(0);
  apercu: LigneChat | null = $state(null);
  compte: number | null = $state(null);
  compteAuteur: string | null = $state(null);
  reprise: { position: number; avec: string[] } | null = $state(null);
  fini = $state(false);
  tallyReactions = $state(0);
  serveurRtt: number | null = $state(null);
  retour5min: string | null = $state(null);

  private video: HTMLVideoElement | null = null;
  private ws: ClientWs | null = null;
  private appel: Appel | null = null;
  private moteur: MoteurSynchro;
  private horloge = new Horloge();
  private baisse = new BaisseFilm();
  private fabrique = new FabriqueReactions();
  private ctx: AudioContext | null = null;
  private audios = new Map<string, HTMLAudioElement>();
  private detecteurs = new Map<string, { niveau: () => number; arreter: () => void; voix: Voix }>();
  private fluxLocal: MediaStream | null = null;
  private pistes: { audio: MediaStreamTrack | null; video: MediaStreamTrack | null } = { audio: null, video: null };
  private ice: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  private detacher: (() => void) | null = null;
  private jetonPlan = 0;
  private cleFilm = '';
  private minuteries: Array<ReturnType<typeof setInterval>> = [];
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private compteFin = 0;
  private dernierEnvoiReaction = 0;
  private suivantAnnonce = 1;
  private minuteriesAnnonce = new Map<string, ReturnType<typeof setTimeout>>();
  private perduDepuis = new Map<string, number>();
  private verrou: { release(): Promise<void> } | null = null;
  private suivantChat = 1;
  private surNonConnecte: () => void;
  private nettoyageVideo: (() => void) | null = null;

  constructor(seanceId: string, surNonConnecte: () => void = () => {}) {
    this.seanceId = seanceId;
    this.surNonConnecte = surNonConnecte;
    this.moteur = new MoteurSynchro({
      video: undefined as never, // remplacé dans `lierVideo`
      horloge: this.horloge,
      envoyer: () => {},
    });
  }

  // ---- Dérivés ----------------------------------------------------------------------------------------------

  get personnes(): PersonneSalle[] {
    return this.moi ? [this.moi, ...this.autres] : this.autres;
  }

  get enLecture(): boolean {
    return this.etat?.lecture ?? false;
  }

  get synchro(): EtatSynchro {
    return etatSynchro({
      ouvert: this.liaison === 'ouvert', filmId: this.etat?.filmId ?? null, lecture: this.enLecture,
      attente: (this.etat?.attente.length ?? 0) > 0, ecart: this.ecart, vitesse: this.vitesse,
    });
  }

  /** Prénoms des personnes qu'on attend (jamais soi : on a alors un message dédié). */
  get enAttente(): PersonneSalle[] {
    const attente = this.etat?.attente ?? [];
    return this.personnes.filter((p) => attente.includes(p.cid));
  }

  get jeSuisEnAttente(): boolean {
    return !!this.moi && (this.etat?.attente.includes(this.moi.cid) ?? false);
  }

  get phraseAttente(): string {
    return phraseAttente(this.enAttente.filter((p) => !p.soi).map((p) => p.utilisateur.prenom));
  }

  get titre(): string {
    return this.seance?.titre ?? this.seance?.filmTitre ?? 'Séance';
  }

  // ---- Préférences ------------------------------------------------------------------------------------------

  sauverPrefs(): void {
    ecrirePrefs($state.snapshot(this.prefs));
  }

  placerVignettes(coin: Coin): void {
    this.prefs.coin = coin;
    this.prefs.rangee = false;
    this.prefs.vignettesMasquees = false;
    this.sauverPrefs();
  }

  // ---- Sas --------------------------------------------------------------------------------------------------

  async chargerSeance(): Promise<void> {
    this.seance = await api.get<Seance>(`/api/seances/${encodeURIComponent(this.seanceId)}`);
  }

  async rafraichirPeripheriques(): Promise<void> {
    this.peripheriques = await lirePeripheriques();
    this.casqueDetecte = aUnCasque(this.peripheriques.sorties);
  }

  /** Entrée dans la salle : le geste de l'utilisateur autorise le son et la lecture automatique. */
  async entrer(flux: MediaStream | null): Promise<void> {
    try {
      this.ctx = new AudioContext();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    this.fluxLocal = flux;
    this.pistes = { audio: flux?.getAudioTracks()[0] ?? null, video: flux?.getVideoTracks()[0] ?? null };
    try {
      const r = await api.get<{ iceServers: RTCIceServer[] }>('/api/ice');
      if (r.iceServers?.length) this.ice = r.iceServers;
    } catch {
      /* on garde le serveur STUN par défaut */
    }
    this.phase = 'salle';
    this.minuteries.push(setInterval(() => this.tic(), 500));
    this.minuteries.push(setInterval(() => this.boucleVoix(), 50));
    this.minuteries.push(setInterval(() => this.purger(), 500));
    this.minuteries.push(setInterval(() => this.progression(), LIMITES_WS.intervalleProgression * 1000));
    this.ws = new ClientWs({
      url: urlWsSeance(this.seanceId),
      surMessage: (m) => this.recevoir(m),
      surLiaison: (e, t) => this.surLiaison(e, t),
      avantReconnexion: () => this.verifierSession(),
    });
    this.ws.connecter();
    document.addEventListener('visibilitychange', this.surVisibilite);
  }

  private surVisibilite = (): void => {
    if (!document.hidden) {
      this.moteur.tic();
      void this.ctx?.resume();
      this.appel?.relancer();
    }
  };

  private async verifierSession(): Promise<boolean> {
    try {
      const e = await api.get<EtatApi>('/api/etat');
      if (!e.utilisateur) {
        this.surNonConnecte();
        return false;
      }
    } catch {
      /* serveur injoignable : on continue d'essayer */
    }
    return true;
  }

  // ---- Lecteur ----------------------------------------------------------------------------------------------

  /** Branche l'élément `<video>` de la page ; rend la fonction de nettoyage. */
  lierVideo(video: HTMLVideoElement): () => void {
    this.video = video;
    this.moteur = new MoteurSynchro({
      video, horloge: this.horloge, cid: () => this.moi?.cid ?? null,
      envoyer: (m) => this.ws?.envoyer(m),
      surBloque: (b) => { this.bloque = b; },
    });
    if (this.etat) this.moteur.appliquerEtat(this.etat);
    const ecouteurs: Array<[string, () => void]> = [
      ['waiting', () => this.moteur.surWaiting()],
      ['canplay', () => { this.chargement = false; this.moteur.surPret(); }],
      ['playing', () => { this.chargement = false; this.moteur.surPret(); }],
      ['error', () => { this.moteur.surErreur(); this.erreurPlan = 'Ce film ne peut pas être lu par ton navigateur.'; }],
      ['ended', () => this.moteur.surFin()],
      ['loadedmetadata', () => { this.majTemps(); this.moteur.tic(); this.appliquerSousTitres(); }],
      ['durationchange', () => this.majTemps()],
      ['timeupdate', () => this.majTemps()],
      ['progress', () => this.majTemps()],
      ['ratechange', () => { this.vitesse = video.playbackRate; }],
    ];
    for (const [nom, f] of ecouteurs) video.addEventListener(nom, f);
    this.nettoyageVideo = () => {
      for (const [nom, f] of ecouteurs) video.removeEventListener(nom, f);
    };
    this.appliquerVolumes();
    if (this.etat) void this.suivreFilm();
    return () => this.nettoyageVideo?.();
  }

  private majTemps(): void {
    const v = this.video;
    if (!v) return;
    this.temps = v.currentTime;
    this.duree = Number.isFinite(v.duration) ? v.duration : (this.plan?.duree ?? 0);
    const b = v.buffered;
    this.tamponFin = b.length ? b.end(b.length - 1) : 0;
  }

  private tic(): void {
    if (!this.video) return;
    this.moteur.tic();
    this.ecart = this.moteur.ecart;
    this.vitesse = this.video?.playbackRate ?? 1;
    this.majTemps();
    this.serveurRtt = this.horloge.rtt;
    this.gererVerrou();
    this.verifierImagesPerdues();
  }

  /** Charge le plan de lecture quand le film ou la piste audio change. */
  private async suivreFilm(): Promise<void> {
    const etat = this.etat;
    if (!etat || !this.video) return;
    const cle = `${etat.filmId ?? ''}#${etat.pisteAudio ?? -1}`;
    if (cle === this.cleFilm) return;
    this.cleFilm = cle;
    const jeton = ++this.jetonPlan;
    this.detacher?.();
    this.detacher = null;
    if (!etat.filmId) {
      this.plan = null;
      this.chargement = false;
      return;
    }
    this.chargement = true;
    this.erreurPlan = null;
    try {
      const plan = await chargerPlan(etat.filmId, etat.pisteAudio ?? -1);
      if (jeton !== this.jetonPlan || !this.video) return;
      this.plan = plan;
      this.moteur.surChargement();
      this.detacher = attacherLecture(this.video, plan);
      this.appliquerSousTitres();
    } catch (e) {
      if (jeton !== this.jetonPlan) return;
      this.erreurPlan = e instanceof Error ? e.message : 'Impossible de préparer le film.';
      this.chargement = false;
    }
  }

  private appliquerSousTitres(): void {
    const v = this.video;
    if (!v) return;
    const pistes = Array.from(v.textTracks);
    const i = indexPisteTexte(pistes.map((t) => ({ id: t.id, label: t.label })), this.plan, this.etat?.sousTitres ?? null);
    pistes.forEach((t, k) => { t.mode = k === i ? 'showing' : 'disabled'; });
  }

  // ---- Volumes et son ---------------------------------------------------------------------------------------

  appliquerVolumes(): void {
    if (this.video) {
      const vol = volumeFilm(this.prefs.volFilm, this.baisse.facteur);
      this.video.volume = vol;
      this.video.muted = this.prefs.volFilm === 0;
    }
    for (const [cid, a] of this.audios) {
      const p = this.autres.find((x) => x.cid === cid);
      a.volume = Math.max(0, Math.min(1, this.prefs.volVoix * (p?.volume ?? 1)));
    }
  }

  private boucleVoix(): void {
    const maintenant = performance.now();
    let quelquunParle = false;
    for (const [cid, d] of this.detecteurs) {
      const parle = d.voix.mettreAJour(d.niveau(), maintenant);
      const p = cid === this.moi?.cid ? this.moi : this.autres.find((x) => x.cid === cid);
      if (p && p.parle !== parle) p.parle = parle;
      // Aucune baisse sur son propre micro (évite l'effet pompage).
      if (parle && cid !== this.moi?.cid) quelquunParle = true;
    }
    const avant = this.baisse.facteur;
    this.baisse.mettreAJour(quelquunParle, this.prefs.baisseFilm, maintenant);
    if (this.baisse.facteur !== avant) this.appliquerVolumes();
  }

  private ajouterDetecteur(cid: string, flux: MediaStream): void {
    if (!this.ctx || this.detecteurs.has(cid) || !flux.getAudioTracks().length) return;
    try {
      this.detecteurs.set(cid, { ...detecteurVoix(this.ctx, flux), voix: new Voix() });
    } catch {
      /* pas de détection de voix pour ce flux */
    }
  }

  private surFlux(cid: string, flux: MediaStream, piste: MediaStreamTrack): void {
    const p = this.autres.find((x) => x.cid === cid);
    if (p && p.flux !== flux) p.flux = flux;
    if (piste.kind !== 'audio') return;
    let a = this.audios.get(cid);
    if (!a) {
      // L'élément <audio> joue la voix, et alimente aussi l'analyseur de Chrome.
      a = document.createElement('audio');
      a.autoplay = true;
      a.srcObject = flux;
      document.body.append(a);
      this.audios.set(cid, a);
    }
    void a.play().catch(() => {});
    this.ajouterDetecteur(cid, flux);
    this.appliquerVolumes();
  }

  private retirerFlux(cid: string): void {
    const a = this.audios.get(cid);
    if (a) { a.srcObject = null; a.remove(); this.audios.delete(cid); }
    this.detecteurs.get(cid)?.arreter();
    this.detecteurs.delete(cid);
    this.perduDepuis.delete(cid);
  }

  /** Un geste dans la page : on peut relancer les sons qui attendaient. */
  reveillerSons(): void {
    void this.ctx?.resume().catch(() => {});
    for (const a of this.audios.values()) if (a.paused) void a.play().catch(() => {});
  }

  // ---- Micro et caméra --------------------------------------------------------------------------------------

  get microDispo(): boolean { return !!this.pistes.audio; }
  get cameraDispo(): boolean { return !!this.pistes.video; }

  private creerMoi(utilisateur: UtilisateurPublic, cid: string): PersonneSalle {
    const video = this.pistes.video;
    return {
      cid, utilisateur, soi: true, micro: this.pistes.audio?.enabled ?? false, camera: video?.enabled ?? false,
      tampon: false, pair: 'connected', faible: false, parle: false, imagePerdue: false, volume: 1,
      flux: video ? new MediaStream([video]) : null,
    };
  }

  basculerMicro(): void {
    const p = this.pistes.audio;
    if (!p || !this.moi) return;
    p.enabled = !p.enabled;
    this.moi.micro = p.enabled;
    this.envoyerMedia();
  }

  basculerCamera(): void {
    const p = this.pistes.video;
    if (!p || !this.moi) return;
    p.enabled = !p.enabled;
    this.moi.camera = p.enabled;
    this.envoyerMedia();
  }

  private envoyerMedia(): void {
    this.ws?.envoyer({ t: 'media', micro: this.moi?.micro ?? false, camera: this.moi?.camera ?? false });
  }

  /** Change de micro ou de caméra en cours de séance. */
  async changerPeripherique(genre: 'micro' | 'camera', deviceId: string): Promise<void> {
    const { ouvrirMedias } = await import('./medias.ts');
    const flux = await ouvrirMedias({
      micro: genre === 'micro' ? deviceId : (this.prefs.micro ?? undefined),
      camera: genre === 'camera' ? deviceId : (this.prefs.camera ?? undefined),
      casque: this.prefs.casque,
    });
    if (!flux.flux) return;
    const nouvelle = genre === 'micro' ? flux.flux.getAudioTracks()[0] : flux.flux.getVideoTracks()[0];
    for (const t of flux.flux.getTracks()) if (t !== nouvelle) t.stop();
    if (!nouvelle) return;
    const ancienne = genre === 'micro' ? this.pistes.audio : this.pistes.video;
    nouvelle.enabled = ancienne?.enabled ?? true;
    ancienne?.stop();
    if (genre === 'micro') this.pistes.audio = nouvelle;
    else this.pistes.video = nouvelle;
    this.prefs[genre] = deviceId;
    this.sauverPrefs();
    if (this.moi && genre === 'camera') this.moi.flux = new MediaStream([nouvelle]);
    this.appel?.definirLocal(this.pistes.audio, this.pistes.video);
  }

  // ---- WebSocket --------------------------------------------------------------------------------------------

  private surLiaison(e: EtatLiaison, tentative: number): void {
    this.liaison = e;
    if (e === 'ouvert') {
      this.lancerPings();
    } else if (e === 'ferme') {
      if (this.pingTimer) clearTimeout(this.pingTimer);
      this.reinitialiserPairs();
      if (tentative === 1) this.annoncer('liaison', 'Connexion perdue, on réessaie…');
      if (tentative === 4) this.annoncer('liaison', 'La salle est pleine ou injoignable. On continue d’essayer…');
    }
  }

  private lancerPings(): void {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    this.horloge.reinitialiserCadence();
    const tic = (): void => {
      this.ws?.envoyer({ t: 'ping', c: Date.now() });
      this.pingTimer = setTimeout(tic, this.horloge.prochainDelai());
    };
    tic();
  }

  private reinitialiserPairs(): void {
    this.appel?.fermer();
    this.appel = null;
    for (const cid of [...this.audios.keys()]) this.retirerFlux(cid);
    this.autres = [];
  }

  private progression(): void {
    if (this.video && this.etat?.filmId) this.ws?.envoyer({ t: 'progression', position: this.video.currentTime });
  }

  private recevoir(m: MessageServeur): void {
    switch (m.t) {
      case 'bienvenue': this.surBienvenue(m); break;
      case 'etat': this.surEtat(m.etat, m.raison, m.par); break;
      case 'arrivee': this.surArrivee(m.participant); break;
      case 'depart': this.surDepart(m.cid); break;
      case 'media': {
        const p = this.autres.find((x) => x.cid === m.cid);
        if (p) { p.micro = m.micro; p.camera = m.camera; }
        break;
      }
      case 'reaction': this.surReaction(m.cid, m.emoji); break;
      case 'message': this.surMessage(m.message); break;
      case 'signal': this.appel?.signal(m.de, m.donnees); break;
      case 'pong': this.horloge.surPong(m.c, m.s); break;
      case 'erreur': if (m.code !== 'trop_vite') this.annoncer('erreur', m.message); break;
    }
  }

  private personneDe(p: Participant): PersonneSalle {
    return {
      cid: p.cid, utilisateur: p.utilisateur, soi: false, micro: p.micro, camera: p.camera, tampon: p.tampon,
      pair: 'new', faible: false, parle: false, flux: null, volume: 1, imagePerdue: false,
    };
  }

  private creerAppel(cid: string): Appel {
    return new Appel({
      moi: cid, ice: this.ice,
      envoyer: (a, donnees) => this.ws?.envoyer({ t: 'signal', a, donnees }),
      auFlux: (c, flux, piste) => this.surFlux(c, flux, piste),
      auEtat: (c, etat) => {
        const p = this.autres.find((x) => x.cid === c);
        if (!p) return;
        p.pair = etat;
        if (etat === 'connected') p.imagePerdue = false;
      },
      auRetrait: (c) => this.retirerFlux(c),
      auQualite: (c, faible) => {
        const p = this.autres.find((x) => x.cid === c);
        if (p) p.faible = faible;
      },
    });
  }

  private surBienvenue(m: Extract<MessageServeur, { t: 'bienvenue' }>): void {
    this.reinitialiserPairs();
    this.horloge.amorcer(m.serveur);
    this.moi = this.creerMoi(m.moi.utilisateur, m.moi.cid);
    if (this.fluxLocal?.getAudioTracks().length && this.ctx && !this.detecteurs.has(m.moi.cid)) {
      this.ajouterDetecteur(m.moi.cid, this.fluxLocal);
    }
    this.appel = this.creerAppel(m.moi.cid);
    this.appel.definirLocal(this.pistes.audio, this.pistes.video);
    this.autres = m.participants.map((p) => this.personneDe(p));
    // Le nouvel arrivant attend les offres de ceux qui sont déjà là.
    for (const p of m.participants) this.appel.ajouter(p.cid, { attendreOffre: true });
    if (!this.lignes.length) {
      this.lignes = m.messages.map((x) => this.ligneDe(x, m.moi.utilisateur.id));
    }
    this.envoyerMedia();
    if (this.video) this.moteur.surReconnexion();
    const premiere = this.etat === null;
    this.recevoirEtat(m.etat);
    if (premiere && !m.etat.lecture && m.etat.position > 30 && m.etat.filmId) {
      this.reprise = {
        position: m.etat.position,
        avec: (this.seance?.invites ?? []).map((u) => u.prenom).filter((n) => n !== m.moi.utilisateur.prenom),
      };
    }
    if (this.seance === null) void this.chargerSeance().catch(() => {});
  }

  private recevoirEtat(etat: EtatSeance): void {
    this.etat = etat;
    for (const p of this.personnes) p.tampon = etat.attente.includes(p.cid);
    if (this.video) this.moteur.appliquerEtat(etat);
    this.synchroniserCompte(etat);
    void this.suivreFilm();
    this.appliquerSousTitres();
    this.ecart = this.moteur.ecart;
  }

  private nomDe(cid: string | null): string | null {
    if (!cid) return null;
    return this.personnes.find((p) => p.cid === cid)?.utilisateur.prenom ?? null;
  }

  private surEtat(etat: EtatSeance, raison: RaisonEtat, par: string | null): void {
    const avant = this.etat;
    const attendue = avant && this.video ? this.moteur.attendue() : null;
    const retires = avant && raison === 'attente-ignoree'
      ? retiresAttente(avant.attente, etat.attente).map((c) => this.nomDe(c) ?? 'quelqu’un') : undefined;
    const moi = par !== null && par === this.moi?.cid;
    this.recevoirEtat(etat);
    if (raison === 'fin') this.terminer();
    if (raison === 'film' || (avant && avant.filmId !== etat.filmId)) { this.fini = false; this.reprise = null; }
    if (raison === 'lecture' || raison === 'compte_a_rebours') this.reprise = null;
    if (raison === 'compte_a_rebours' && par !== null) this.compteAuteur = moi ? 'Tu as lancé le compte à rebours.' : `${this.nomDe(par) ?? 'Quelqu’un'} a lancé le compte à rebours.`;
    if (!moi) {
      const nom = raison === 'depart' ? par : this.nomDe(par);
      const ctx = { raison, nom, etat, avant: attendue, plan: this.plan, ...(retires ? { retires } : {}) };
      const texte = texteAnnonce(ctx);
      if (texte) {
        this.annoncer(raison, texte);
        if (raison !== 'reprise') this.ajouterSysteme(texte);
      }
    }
  }

  private surArrivee(p: Participant): void {
    if (this.autres.some((x) => x.cid === p.cid)) return;
    this.autres.push(this.personneDe(p));
    // Ceux qui sont déjà là envoient l'offre initiale.
    this.appel?.ajouter(p.cid);
    this.envoyerMedia();
    const texte = `${p.utilisateur.prenom} est arrivé·e`;
    this.annoncer('arrivee', texte);
    this.ajouterSysteme(texte);
  }

  private surDepart(cid: string): void {
    this.appel?.retirer(cid);
    this.autres = this.autres.filter((p) => p.cid !== cid);
  }

  // ---- Commandes partagées ----------------------------------------------------------------------------------

  get peutAgir(): boolean { return this.liaison === 'ouvert' && !!this.etat?.filmId; }

  basculerLecture(): void { if (this.peutAgir) { this.reprise = null; this.moteur.basculer(); } }
  aller(position: number): void { if (this.peutAgir) this.moteur.aller(position); }
  allerRelatif(delta: number): void { this.aller((this.video?.currentTime ?? 0) + delta); }
  resynchroniser(): void { this.moteur.resynchroniser(); }
  reprendreIci(): void { this.moteur.reprendreIci(); }
  lancerCompteARebours(): void { this.reprise = null; this.ws?.envoyer({ t: 'compte_a_rebours' }); }
  /** Pas de message d'annulation dans le protocole : la pause du compte à rebours le suspend. */
  annulerCompteARebours(): void { this.ws?.envoyer({ t: 'pause', position: this.video?.currentTime ?? 0 }); }
  changerLangue(piste: number): void { if (piste !== this.etat?.pisteAudio) this.ws?.envoyer({ t: 'audio', piste }); }
  changerSousTitres(cle: string | null): void { this.ws?.envoyer({ t: 'sous_titres', cle }); }
  ignorerAttente(cid: string): void { this.ws?.envoyer({ t: 'ignorer_attente', cid }); }
  depuisLeDebut(): void { this.reprise = null; this.aller(0); }
  changerFilm(filmId: string): void { this.fini = false; this.ws?.envoyer({ t: 'film', filmId }); }

  /** « Je reviens dans 5 min » : pause pour tous et message dans le chat. */
  jeReviens(): void {
    if (this.enLecture) this.ws?.envoyer({ t: 'pause', position: this.video?.currentTime ?? 0 });
    this.ws?.envoyer({ t: 'message', texte: `${this.moi?.utilisateur.prenom ?? 'Quelqu’un'} revient dans 5 min.` });
    this.retour5min = this.moi?.utilisateur.prenom ?? null;
  }

  // ---- Compte à rebours -------------------------------------------------------------------------------------

  private compteTimer: ReturnType<typeof setInterval> | null = null;

  private synchroniserCompte(etat: EtatSeance): void {
    if (this.compteTimer) clearInterval(this.compteTimer);
    this.compteTimer = null;
    if (etat.compteARebours === null) {
      this.compte = null;
      return;
    }
    this.compteFin = Date.now() + etat.compteARebours * 1000;
    const maj = (): void => { this.compte = Math.max(1, Math.ceil((this.compteFin - Date.now()) / 1000)); };
    maj();
    this.compteTimer = setInterval(maj, 100);
  }

  // ---- Chat, réactions ---------------------------------------------------------------------------------------

  chatOuvert = $state(false);

  ouvrirChat(ouvert: boolean): void {
    this.chatOuvert = ouvert;
    if (ouvert) { this.nonLus = 0; this.apercu = null; }
    this.prefs.chatOuvert = ouvert;
    this.sauverPrefs();
  }

  envoyerMessage(texte: string): boolean {
    const t = texte.trim();
    if (!t || t.length > LIMITES_WS.texteMessageMax) return false;
    return this.ws?.envoyer({ t: 'message', texte: t }) ?? false;
  }

  private ligneDe(m: MessageChatWs, moiId: number | null): LigneChat {
    return {
      cle: `m${m.id}`, genre: 'message', utilisateurId: m.utilisateurId, prenom: m.prenom, texte: m.texte,
      heure: Date.parse(m.envoyeLe) || Date.now(), soi: m.utilisateurId !== null && m.utilisateurId === moiId,
    };
  }

  private surMessage(m: MessageChatWs): void {
    const ligne = this.ligneDe(m, this.moi?.utilisateur.id ?? null);
    this.lignes = [...this.lignes, ligne].slice(-200);
    if (!this.chatOuvert && !ligne.soi) {
      this.nonLus++;
      this.apercu = ligne;
      const cle = ligne.cle;
      setTimeout(() => { if (this.apercu?.cle === cle) this.apercu = null; }, 4000);
    }
  }

  private ajouterSysteme(texte: string): void {
    this.lignes = [...this.lignes, {
      cle: `s${this.suivantChat++}`, genre: 'systeme' as const, utilisateurId: null, prenom: null, texte, heure: Date.now(), soi: false,
    }].slice(-200);
  }

  reagir(emoji: Emoji): void {
    const t = Date.now();
    if (t - this.dernierEnvoiReaction < 220 || !this.moi) return;
    this.dernierEnvoiReaction = t;
    if (!this.ws?.envoyer({ t: 'reaction', emoji })) return;
    this.afficherReaction(this.moi.cid, emoji, true);
    try { navigator.vibrate?.(8); } catch { /* sans vibreur */ }
  }

  private surReaction(cid: string, emoji: Emoji): void {
    if (cid === this.moi?.cid) return;
    this.afficherReaction(cid, emoji, false);
  }

  private reactionsRecentes: Array<{ prenom: string; emoji: Emoji }> = [];
  private minuterieAnnonceReaction: ReturnType<typeof setTimeout> | null = null;

  private afficherReaction(cid: string, emoji: Emoji, soi: boolean): void {
    this.tallyReactions++;
    this.reactions = ajouterReaction(this.reactions, this.fabrique.creer(cid, emoji, soi, Date.now()));
    if (soi) return;
    const prenom = this.nomDe(cid) ?? 'Quelqu’un';
    this.reactionsRecentes.push({ prenom, emoji });
    if (!this.minuterieAnnonceReaction) {
      this.minuterieAnnonceReaction = setTimeout(() => {
        const groupes = new Map<string, Emoji[]>();
        for (const r of this.reactionsRecentes) groupes.set(r.prenom, [...(groupes.get(r.prenom) ?? []), r.emoji]);
        this.annonceReaction = [...groupes].map(([n, e]) => annonceReactions(n, e)).join(' ; ');
        this.reactionsRecentes = [];
        this.minuterieAnnonceReaction = null;
      }, 1200);
    }
  }

  private purger(): void {
    if (this.reactions.length) {
      const reste = purgerReactions(this.reactions, Date.now(), DUREE_REACTION);
      if (reste.length !== this.reactions.length) this.reactions = reste;
    }
  }

  // ---- Annonces (gestes partagés), fin, divers ---------------------------------------------------------------

  /** Une annonce de 2,5 s ; au plus une par genre (les gestes rapprochés se regroupent). */
  annoncer(genre: string, texte: string): void {
    const ancien = this.minuteriesAnnonce.get(genre);
    if (ancien) clearTimeout(ancien);
    const id = this.suivantAnnonce++;
    this.annonces = [...this.annonces.filter((a) => a.genre !== genre), { id, genre, texte }];
    this.minuteriesAnnonce.set(genre, setTimeout(() => {
      this.annonces = this.annonces.filter((a) => a.id !== id);
      this.minuteriesAnnonce.delete(genre);
    }, DUREE_ANNONCE));
  }

  private terminer(): void {
    this.fini = true;
  }

  get secondesRegardees(): number { return this.moteur.secondesRegardees; }

  private verifierImagesPerdues(): void {
    const t = Date.now();
    for (const p of this.autres) {
      const mauvais = p.pair === 'disconnected' || p.pair === 'failed';
      if (!mauvais) { this.perduDepuis.delete(p.cid); p.imagePerdue = false; continue; }
      const depuis = this.perduDepuis.get(p.cid) ?? t;
      this.perduDepuis.set(p.cid, depuis);
      if (t - depuis > 8000) p.imagePerdue = true;
    }
  }

  /** Empêche la mise en veille de l'écran pendant la lecture. */
  private gererVerrou(): void {
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    if (!nav.wakeLock) return;
    if (this.enLecture && !this.verrou && !document.hidden) {
      this.verrou = { release: async () => {} };
      void nav.wakeLock.request('screen').then((v) => { this.verrou = v; }, () => { this.verrou = null; });
    } else if (!this.enLecture && this.verrou) {
      void this.verrou.release().catch(() => {});
      this.verrou = null;
    }
  }

  // ---- Sortie ------------------------------------------------------------------------------------------------

  quitter(): void {
    document.removeEventListener('visibilitychange', this.surVisibilite);
    for (const m of this.minuteries) clearInterval(m);
    this.minuteries = [];
    if (this.compteTimer) clearInterval(this.compteTimer);
    if (this.pingTimer) clearTimeout(this.pingTimer);
    for (const t of this.minuteriesAnnonce.values()) clearTimeout(t);
    this.moteur.arreter();
    this.ws?.fermer();
    this.ws = null;
    this.appel?.fermer();
    this.appel = null;
    for (const cid of [...this.audios.keys()]) this.retirerFlux(cid);
    for (const d of this.detecteurs.values()) d.arreter();
    this.detecteurs.clear();
    this.fluxLocal?.getTracks().forEach((t) => t.stop());
    this.pistes.audio?.stop();
    this.pistes.video?.stop();
    this.nettoyageVideo?.();
    this.detacher?.();
    this.detacher = null;
    void this.verrou?.release().catch(() => {});
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

export { EMOJIS };
