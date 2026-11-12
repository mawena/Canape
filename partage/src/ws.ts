// Protocole WebSocket d'une séance : `GET /ws/seances/:id` (contrat : docs/CONCEPTION.md, « WebSocket d'une séance »).
import type { UtilisateurPublic } from './comptes.ts';

/** Liste fermée des réactions. */
export const EMOJIS = ['😂', '❤️', '😱', '😭', '🔥', '👏', '😮', '🍿'] as const;
export type Emoji = (typeof EMOJIS)[number];

export const LIMITES_WS = {
  connexionsParSeance: 8,
  tailleMessageOctets: 64 * 1024,
  /** Réactions et messages, par connexion. */
  evenementsParSeconde: 5,
  texteMessageMax: 500,
  /** Intervalle d'envoi de `progression`, en secondes. */
  intervalleProgression: 10,
  /** Délai du compte à rebours, en secondes. */
  compteARebours: 3,
  /** Au-delà : saut. Entre `seuilVitesse` et `seuilSaut` : vitesse corrigée. */
  seuilSaut: 1,
  seuilVitesse: 0.3,
  vitesseRattrapage: 1.05,
  vitesseAttente: 0.95,
} as const;

/** Un participant connecté (une connexion = un `cid`). */
export interface Participant {
  cid: string;
  utilisateur: UtilisateurPublic;
  micro: boolean;
  camera: boolean;
  /** Lit-il en ce moment sans être en train de mettre en mémoire ? (utile à l'indicateur de synchro) */
  tampon: boolean;
}

/** État partagé de la séance. `position` vaut à l'instant serveur `instant` (ms depuis l'époque). */
export interface EtatSeance {
  filmId: string | null;
  lecture: boolean;
  position: number;
  instant: number;
  /** Incrémenté à chaque changement d'état décidé par le serveur. */
  version: number;
  /** `cid` qui mettent en mémoire : la lecture attend. */
  attente: string[];
  pisteAudio: number | null;
  sousTitres: string | null;
  /** Secondes restantes avant le lancement, ou `null`. */
  compteARebours: number | null;
  serveur: number;
}

export interface MessageChatWs {
  id: number;
  utilisateurId: number | null;
  prenom: string | null;
  texte: string;
  position: number | null;
  envoyeLe: string;
}

// ---- Client -> serveur ----

export type MessageClient =
  | { t: 'ping'; c: number }
  | { t: 'lecture'; position: number }
  | { t: 'pause'; position: number; fin?: boolean }
  | { t: 'aller'; position: number }
  | { t: 'film'; filmId: string }
  | { t: 'audio'; piste: number }
  | { t: 'sous_titres'; cle: string | null }
  | { t: 'compte_a_rebours' }
  | { t: 'tampon'; enCours: boolean }
  | { t: 'media'; micro: boolean; camera: boolean }
  | { t: 'reaction'; emoji: Emoji }
  | { t: 'message'; texte: string }
  | { t: 'progression'; position: number }
  | { t: 'signal'; a: string; donnees: unknown };

// ---- Serveur -> client ----

export type RaisonEtat =
  | 'lecture' | 'pause' | 'aller' | 'film' | 'audio' | 'sous_titres' | 'compte_a_rebours'
  | 'tampon' | 'arrivee' | 'depart' | 'fin' | 'rattrapage';

export type MessageServeur =
  | {
      t: 'bienvenue';
      moi: { cid: string; utilisateur: UtilisateurPublic };
      serveur: number;
      participants: Participant[];
      etat: EtatSeance;
      messages: MessageChatWs[];
    }
  | { t: 'etat'; etat: EtatSeance; raison: RaisonEtat; par: string | null }
  | { t: 'arrivee'; participant: Participant }
  | { t: 'depart'; cid: string }
  | { t: 'media'; cid: string; micro: boolean; camera: boolean }
  | { t: 'reaction'; cid: string; emoji: Emoji }
  | { t: 'message'; message: MessageChatWs }
  | { t: 'signal'; de: string; donnees: unknown }
  | { t: 'pong'; c: number; s: number }
  | { t: 'erreur'; code: string; message: string };

export type TypeMessageClient = MessageClient['t'];
export type TypeMessageServeur = MessageServeur['t'];
