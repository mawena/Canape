// Moteur de synchronisation de la salle (porté de la 0.1) : applique l'état partagé au lecteur sans écho, rattrape
// l'écart, signale le chargement (attente mutuelle) et gère la lecture automatique bloquée. TypeScript pur : il ne
// touche qu'à l'interface `LecteurVideo`, donc testable sous Node.
import { decision, positionAttendue, type Horloge } from './synchro.ts';
import type { EtatSeance, LecteurVideo, MessageClient } from './types.ts';

/** Durée de chargement au-delà de laquelle on signale `tampon` (ms). */
export const DELAI_TAMPON = 1000;
/**
 * Délai avant de signaler `tampon` après une reprise décidée « à l'arrêt » (voir `tic`) : le navigateur ne charge que
 * pendant la lecture, il lui faut un peu de temps avant d'arrêter tout le monde de nouveau.
 */
export const DELAI_TAMPON_LONG = 5000;
/** `readyState` à partir duquel on peut lire : HAVE_FUTURE_DATA. */
const PRET = 3;
/** Délai après lequel une demande de lecture restée sans réponse est refaite (ms). */
const RELANCE_LECTURE = 4000;
/** `readyState` HAVE_CURRENT_DATA : l'image courante est là. */
const IMAGE_COURANTE = 2;
/** `networkState` NETWORK_IDLE : le navigateur a cessé de charger. */
const RESEAU_INACTIF = 1;

export interface OptionsMoteur {
  video: LecteurVideo;
  horloge: Pick<Horloge, 'serveurMaintenant'>;
  envoyer: (m: MessageClient) => void;
  /** `cid` de cette connexion (pour repérer une attente périmée). */
  cid?: () => string | null;
  /** La lecture automatique est refusée (ou de nouveau permise). */
  surBloque?: (bloque: boolean) => void;
}

export class MoteurSynchro {
  etat: EtatSeance | null = null;
  /** Position attendue − position locale (s), mesurée au dernier `tic`. */
  ecart = 0;
  bloque = false;
  tamponEnvoye = false;
  /** Secondes réellement regardées (lecture en cours, sans attente). */
  secondesRegardees = 0;
  private minuterie: ReturnType<typeof setTimeout> | null = null;
  private dernierTic = 0;
  private lectureDemandee = false;
  private lectureDemandeeA = 0;
  private delaiTampon = DELAI_TAMPON;

  private readonly o: OptionsMoteur;

  constructor(o: OptionsMoteur) {
    this.o = o;
  }

  // ---- État du serveur --------------------------------------------------------------------------------------

  /** À appeler à chaque `bienvenue` et `etat`. Rien n'est renvoyé au serveur : pas d'écho. */
  appliquerEtat(etat: EtatSeance): void {
    this.etat = etat;
    if (!etat.lecture) this.definirBloque(false);
    const moi = this.o.cid?.() ?? null;
    // Attente périmée : le serveur croit qu'on charge alors qu'on est prêt.
    if (moi && etat.attente.includes(moi) && this.pret() && !this.minuterie) this.signalerTampon(false, true);
    this.tic();
  }

  /** Position attendue du groupe (s), bornée par la durée. */
  attendue(): number {
    if (!this.etat) return 0;
    let p = positionAttendue(this.etat, this.o.horloge.serveurMaintenant());
    if (Number.isFinite(this.o.video.duration)) p = Math.min(p, this.o.video.duration);
    return Math.max(0, p);
  }

  /** Toutes les 500 ms (et après chaque état) : aligne le lecteur sur le groupe. */
  tic(): void {
    const v = this.o.video;
    const maintenant = Date.now();
    if (this.dernierTic && !v.paused && this.etat?.lecture && !this.etat.attente.length) {
      this.secondesRegardees += Math.min(2, (maintenant - this.dernierTic) / 1000);
    }
    this.dernierTic = maintenant;
    const etat = this.etat;
    if (!etat || etat.filmId === null || v.readyState === 0) return;
    // Safari (iPhone) et WebKit ne chargent pas un film en pause : quand tout le monde nous attend, que le lecteur est
    // à l'arrêt avec son image courante et que le navigateur a cessé de charger, attendre plus longtemps bloquerait la
    // séance pour toujours. On se dit prêt ; le chargement se fera pendant la lecture, avec un délai plus long avant
    // d'arrêter de nouveau tout le monde.
    if (this.tamponEnvoye && !this.minuterie && !etat.lecture && v.paused
      && v.readyState >= IMAGE_COURANTE && v.readyState < PRET && v.networkState === RESEAU_INACTIF) {
      this.delaiTampon = DELAI_TAMPON_LONG;
      this.signalerTampon(false);
    }
    // Annonce périmée : on a dit « je charge » mais le lecteur est prêt (son `canplay` est arrivé avant l'annonce, ou
    // s'est perdu). Sans ce rattrapage, toute la séance attendrait pour toujours.
    if (this.tamponEnvoye && !this.minuterie && this.pret()) this.signalerTampon(false);
    if (etat.lecture) {
      // Une demande de lecture sans réponse depuis 4 s (lecteur coincé) est refaite.
      const demandeCoincee = this.lectureDemandee && Date.now() - this.lectureDemandeeA > RELANCE_LECTURE;
      if (v.paused && !this.bloque && (!this.lectureDemandee || demandeCoincee)) this.lancer();
    } else if (!v.paused) {
      v.pause();
    }
    if (v.seeking) return;
    if (etat.lecture && v.readyState < PRET && !v.paused) return; // il charge : pas de correction
    const ecart = this.attendue() - v.currentTime;
    this.ecart = ecart;
    const d = decision(ecart, etat.lecture, v.playbackRate);
    if (d.saut) {
      v.currentTime = this.attendue();
      if (v.playbackRate !== 1) v.playbackRate = 1;
    } else if (v.playbackRate !== d.vitesse) {
      v.playbackRate = d.vitesse;
    }
  }

  private lancer(): void {
    this.lectureDemandee = true;
    this.lectureDemandeeA = Date.now();
    this.o.video.play().then(
      () => { this.lectureDemandee = false; },
      (e: unknown) => {
        this.lectureDemandee = false;
        if (e instanceof Error && e.name === 'NotAllowedError') this.definirBloque(true);
      },
    );
  }

  private definirBloque(b: boolean): void {
    if (this.bloque === b) return;
    this.bloque = b;
    this.o.surBloque?.(b);
  }

  /** Bouton « Reprendre ici » : un geste de l'utilisateur autorise la lecture. */
  reprendreIci(): void {
    this.definirBloque(false);
    this.tic();
  }

  // ---- Attente mutuelle -------------------------------------------------------------------------------------

  /** Événement `waiting` du lecteur : on signale seulement si le chargement dure plus d'une seconde. */
  surWaiting(): void {
    if (this.minuterie || this.tamponEnvoye) return;
    this.minuterie = setTimeout(() => { this.minuterie = null; this.signalerTampon(true); }, this.delaiTampon);
  }

  /** Événements `canplay` / `playing` : le chargement est fini. */
  surPret(): void {
    this.annulerMinuterie();
    if (this.pret()) this.signalerTampon(false);
    if (!this.o.video.paused) this.delaiTampon = DELAI_TAMPON; // la lecture a vraiment repris
  }

  /** Un nouveau film ou une nouvelle piste se charge : on prévient tout de suite. */
  surChargement(): void {
    this.annulerMinuterie();
    this.signalerTampon(true);
  }

  /** Lecteur en erreur : on ne bloque pas les autres. */
  surErreur(): void {
    this.annulerMinuterie();
    this.signalerTampon(false);
  }

  /** La liaison est coupée : à la reconnexion, le serveur ne sait plus rien de nous. */
  surReconnexion(): void {
    this.tamponEnvoye = false;
    this.annulerMinuterie();
    this.dernierTic = 0;
    if (!this.pret() && this.o.video.readyState !== 0) this.signalerTampon(true);
  }

  surFin(): void {
    if (this.etat?.lecture) this.o.envoyer({ t: 'pause', position: this.o.video.duration, fin: true });
  }

  private pret(): boolean {
    return this.o.video.readyState >= PRET;
  }

  private annulerMinuterie(): void {
    if (this.minuterie) clearTimeout(this.minuterie);
    this.minuterie = null;
  }

  private signalerTampon(enCours: boolean, force = false): void {
    if (enCours === this.tamponEnvoye && !force) return;
    this.tamponEnvoye = enCours;
    this.o.envoyer({ t: 'tampon', enCours });
  }

  // ---- Commandes de l'utilisateur ---------------------------------------------------------------------------

  /** Lecture ou pause partagée. Le `play()` immédiat profite du geste de l'utilisateur. */
  basculer(): void {
    const v = this.o.video;
    if (this.etat?.lecture) {
      this.o.envoyer({ t: 'pause', position: v.currentTime });
    } else {
      this.definirBloque(false);
      v.play().catch(() => {});
      this.o.envoyer({ t: 'lecture', position: v.currentTime });
    }
  }

  aller(position: number): void {
    const d = this.o.video.duration;
    const p = Math.max(0, Number.isFinite(d) ? Math.min(position, d) : position);
    this.o.envoyer({ t: 'aller', position: p });
  }

  /** Aller à la position du groupe (bouton « Resynchroniser »). */
  resynchroniser(): void {
    const v = this.o.video;
    v.currentTime = this.attendue();
    v.playbackRate = 1;
    this.tic();
  }

  arreter(): void {
    this.annulerMinuterie();
  }
}
