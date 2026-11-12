// Types du protocole WebSocket côté salle : ils viennent de `@canape/partage` (`partage/src/ws.ts` fait foi).
import type { EtatSeance, MessageChatWs, MessageClient, MessageServeur, Participant, RaisonEtat } from '@canape/partage';

export type { EtatSeance, MessageChatWs, MessageClient, MessageServeur, Participant, RaisonEtat };

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
