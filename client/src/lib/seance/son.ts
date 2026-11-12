// Son de la salle : détection de voix, baisse du film quand quelqu'un parle, conseil du casque, contraintes du micro.

/** Seuil de voix : −45 dBFS (RMS). */
export const SEUIL_VOIX = 10 ** (-45 / 20);
export const DUREE_DEPASSEMENT = 200;
export const MAINTIEN_VOIX = 600;
/** Le film descend à 35 % de son volume quand quelqu'un parle (baisse de 65 %). */
export const FACTEUR_BAISSE = 0.35;
export const RAMPE_BAISSE = 150;
export const RAMPE_REMONTEE = 400;

export function niveauRms(donnees: ArrayLike<number>): number {
  let somme = 0;
  for (let i = 0; i < donnees.length; i++) {
    const v = ((donnees[i] as number) - 128) / 128;
    somme += v * v;
  }
  return Math.sqrt(somme / donnees.length);
}

/**
 * Suit si une personne parle : la voix doit dépasser −45 dBFS pendant 200 ms pour être « en cours », puis reste
 * « en cours » 600 ms après le dernier dépassement (évite le clignotement).
 */
export class Voix {
  private debut: number | null = null;
  private dernier = -Infinity;
  private actif = false;

  private readonly seuil: number;

  constructor(seuil = SEUIL_VOIX) {
    this.seuil = seuil;
  }

  mettreAJour(niveau: number, maintenant: number): boolean {
    if (niveau > this.seuil) {
      this.debut ??= maintenant;
      this.dernier = maintenant;
      if (maintenant - this.debut >= DUREE_DEPASSEMENT) this.actif = true;
    } else {
      this.debut = null;
    }
    if (this.actif && maintenant - this.dernier >= MAINTIEN_VOIX) this.actif = false;
    return this.actif;
  }

  get parle(): boolean {
    return this.actif;
  }
}

/**
 * Facteur appliqué au volume du film. Baisse en 150 ms dès que quelqu'un parle ; remonte en 400 ms, 600 ms après la
 * fin de la parole (la durée de maintien de `Voix`). Désactivable : le facteur revient alors à 1.
 */
export class BaisseFilm {
  facteur = 1;
  private dernier: number | null = null;

  mettreAJour(quelquunParle: boolean, actif: boolean, maintenant: number): number {
    const dt = this.dernier === null ? 0 : Math.max(0, maintenant - this.dernier);
    this.dernier = maintenant;
    const cible = actif && quelquunParle ? FACTEUR_BAISSE : 1;
    if (cible < this.facteur) this.facteur = Math.max(cible, this.facteur - ((1 - FACTEUR_BAISSE) * dt) / RAMPE_BAISSE);
    else if (cible > this.facteur) this.facteur = Math.min(cible, this.facteur + ((1 - FACTEUR_BAISSE) * dt) / RAMPE_REMONTEE);
    return this.facteur;
  }
}

/** Volume effectif du film : curseur × baisse automatique, borné à [0, 1]. */
export function volumeFilm(curseur: number, facteur: number): number {
  return Math.max(0, Math.min(1, curseur * facteur));
}

const MOTS_CASQUE = ['head', 'casque', 'bluetooth', 'airpods', 'buds', 'earphone', 'écouteur', 'ecouteur', 'jabra', 'bose'];

/** Indice (pas une certitude) : l'étiquette d'une sortie audio ressemble à un casque. */
export function estCasque(libelle: string): boolean {
  const l = libelle.toLowerCase();
  return MOTS_CASQUE.some((m) => l.includes(m));
}

export function aUnCasque(sorties: Array<{ label: string }>): boolean {
  return sorties.some((s) => estCasque(s.label));
}

/**
 * Contraintes du micro. Avec un casque, l'annulation d'écho et le gain automatique sont coupés : ils hachent les voix
 * en double parole alors qu'il n'y a pas d'écho à retirer. Sans casque, tout reste activé.
 */
export function contraintesMicro(casque: boolean, deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: !casque,
    noiseSuppression: true,
    autoGainControl: !casque,
    channelCount: 1,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}
