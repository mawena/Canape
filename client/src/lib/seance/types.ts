// Types du protocole WebSocket côté salle. Ils reprennent `@canape/partage` et y ajoutent les messages de la
// version à jour de l'agent séances (`ignorer_attente`, raisons `reprise` et `attente-ignoree`). À l'intégration, la
// version de `partage/src/ws.ts` fait foi : ces ajouts deviennent alors des doublons sans effet.
import type {
  EtatSeance,
  MessageChatWs,
  MessageClient as MessageClientBase,
  MessageServeur as MessageServeurBase,
  Participant,
  RaisonEtat as RaisonEtatBase,
} from '@canape/partage';

export type { EtatSeance, MessageChatWs, Participant };

export type MessageClient = MessageClientBase | { t: 'ignorer_attente'; cid: string };
export type RaisonEtat = RaisonEtatBase | 'reprise' | 'attente-ignoree';
export type MessageServeur = MessageServeurBase;

/** État de la liaison WebSocket. */
export type EtatLiaison = 'connexion' | 'ouvert' | 'ferme';

/** Ce que le moteur de synchro exige d'un élément `<video>` (permet de le tester sans navigateur). */
export interface LecteurVideo {
  currentTime: number;
  readonly paused: boolean;
  playbackRate: number;
  readonly readyState: number;
  readonly seeking: boolean;
  readonly duration: number;
  play(): Promise<void>;
  pause(): void;
}
