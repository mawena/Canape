// Calculs de synchronisation purs (portés de la 0.1) : horloge ping/pong, position attendue, décision de rattrapage.
import { LIMITES_WS } from '@canape/partage';
import type { EtatSeance } from './types.ts';

/** Écart sous lequel on revient à la vitesse normale (s). */
export const RETOUR = 0.1;

export interface EchantillonHorloge {
  rtt: number;
  /** Heure serveur − heure locale (ms). */
  decalage: number;
}

/** `t0` = heure locale d'envoi, `tServeur` = heure serveur de la réponse, `t1` = heure locale de réception. */
export function echantillon(t0: number, tServeur: number, t1: number): EchantillonHorloge {
  const rtt = t1 - t0;
  return { rtt, decalage: tServeur + rtt / 2 - t1 };
}

/** On garde l'échantillon au plus petit aller-retour : c'est le moins bruité. */
export function meilleurDecalage(echantillons: EchantillonHorloge[]): number {
  if (!echantillons.length) return 0;
  return echantillons.reduce((m, e) => (e.rtt < m.rtt ? e : m)).decalage;
}

/** Position attendue (s) d'après l'état et l'heure serveur courante (ms). */
export function positionAttendue(etat: Pick<EtatSeance, 'lecture' | 'position' | 'instant'>, serveurMs: number): number {
  if (!etat.lecture) return etat.position;
  return etat.position + Math.max(0, (serveurMs - etat.instant) / 1000);
}

export type Decision = { saut: true } | { saut: false; vitesse: number };

/** `ecart` = attendu − actuel (s), positif : on est en retard. */
export function decision(ecart: number, lecture: boolean, vitesseActuelle = 1): Decision {
  const abs = Math.abs(ecart);
  if (!lecture) return abs > 0.05 ? { saut: true } : { saut: false, vitesse: 1 };
  if (abs > LIMITES_WS.seuilSaut) return { saut: true };
  if (abs > LIMITES_WS.seuilVitesse) {
    return { saut: false, vitesse: ecart > 0 ? LIMITES_WS.vitesseRattrapage : LIMITES_WS.vitesseAttente };
  }
  if (abs < RETOUR) return { saut: false, vitesse: 1 };
  // Zone d'hystérésis : on garde la correction en cours jusqu'à ce que l'écart soit résorbé.
  return { saut: false, vitesse: vitesseActuelle === 1 ? 1 : ecart > 0 ? LIMITES_WS.vitesseRattrapage : LIMITES_WS.vitesseAttente };
}

/** « 1:12:48 » ou « 12:48 » (chiffres tabulaires dans les commandes). */
export function formaterTemps(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const d = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${d(m)}:${d(sec)}` : `${m}:${d(sec)}`;
}

/** « 1 h 14 min » pour les phrases et `aria-valuetext`. */
export function formaterDuree(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  if (m) return sec && m < 10 ? `${m} min ${sec} s` : `${m} min`;
  return `${sec} s`;
}

/** Horloge partagée : décalage serveur/local mesuré par ping/pong (10 derniers échantillons). */
export class Horloge {
  decalage = 0;
  rtt: number | null = null;
  private echantillons: EchantillonHorloge[] = [];
  private nombre = 0;

  private readonly local: () => number;

  constructor(local: () => number = () => Date.now()) {
    this.local = local;
  }

  /** Heure serveur estimée (ms). */
  serveurMaintenant(): number {
    return this.local() + this.decalage;
  }

  /** Première estimation, fournie par `bienvenue.serveur`. */
  amorcer(serveur: number): void {
    this.echantillons = [];
    this.nombre = 0;
    this.decalage = serveur - this.local();
    this.rtt = null;
  }

  /** `pong { c, s }` : `c` est l'heure locale d'envoi du `ping`. */
  surPong(c: number, s: number): void {
    const e = echantillon(c, s, this.local());
    this.echantillons.push(e);
    if (this.echantillons.length > 10) this.echantillons.shift();
    this.decalage = meilleurDecalage(this.echantillons);
    this.rtt = Math.round(Math.min(...this.echantillons.map((x) => x.rtt)));
  }

  /** Délai avant le prochain ping : 6 pings rapprochés au début, puis un toutes les 5 s. */
  prochainDelai(): number {
    this.nombre++;
    return this.nombre < 6 ? 300 : 5000;
  }

  reinitialiserCadence(): void {
    this.nombre = 0;
  }
}
