// File des réactions flottantes : au plus 12 à l'écran, les plus anciennes disparaissent d'abord.
import type { Emoji } from '@canape/partage';

export const MAX_REACTIONS = 12;
/** Durée d'affichage d'une réaction qui monte (ms). */
export const DUREE_REACTION = 4500;

export interface ReactionFlottante {
  id: number;
  cid: string;
  emoji: Emoji;
  soi: boolean;
  /** Dérive horizontale (px), de −24 à +24. */
  derive: number;
  /** Position de départ dans la zone du bas (% de la largeur, 55–75). */
  depart: number;
  creeeA: number;
}

export function ajouterReaction(liste: ReactionFlottante[], r: ReactionFlottante, max = MAX_REACTIONS): ReactionFlottante[] {
  const suite = [...liste, r];
  return suite.length > max ? suite.slice(suite.length - max) : suite;
}

export function purgerReactions(liste: ReactionFlottante[], maintenant: number, duree = DUREE_REACTION): ReactionFlottante[] {
  return liste.filter((r) => maintenant - r.creeeA < duree);
}

export class FabriqueReactions {
  private suivant = 1;
  private readonly hasard: () => number;
  constructor(hasard: () => number = Math.random) {
    this.hasard = hasard;
  }
  creer(cid: string, emoji: Emoji, soi: boolean, maintenant: number): ReactionFlottante {
    return {
      id: this.suivant++, cid, emoji, soi, creeeA: maintenant,
      derive: Math.round((this.hasard() * 2 - 1) * 24),
      depart: Math.round(55 + this.hasard() * 20),
    };
  }
}

const NOMS: Record<Emoji, string> = {
  '😂': 'rire', '❤️': 'cœur', '😱': 'peur', '😭': 'larmes', '🔥': 'feu', '👏': 'applaudissements', '😮': 'surprise', '🍿': 'pop-corn',
};

/** Annonce regroupée pour les lecteurs d'écran : « Léa a réagi 3 fois : rire ». */
export function annonceReactions(prenom: string, emojis: Emoji[]): string {
  const noms = [...new Set(emojis.map((e) => NOMS[e]))];
  const n = emojis.length;
  return `${prenom} a réagi${n > 1 ? ` ${n} fois` : ''} : ${noms.join(', ')}`;
}

/** Touches `1`–`8` : réaction correspondante. */
export function emojiDeTouche(touche: string, liste: readonly Emoji[]): Emoji | null {
  const i = Number(touche) - 1;
  return Number.isInteger(i) && i >= 0 && i < liste.length ? (liste[i] ?? null) : null;
}
