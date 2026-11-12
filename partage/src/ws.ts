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
  /** Met-il en mémoire en ce moment (son `cid` figure dans `EtatSeance.attente`) ? */
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
  | { t: 'ignorer_attente'; cid: string }
  | { t: 'media'; micro: boolean; camera: boolean }
  | { t: 'reaction'; emoji: Emoji }
  | { t: 'message'; texte: string }
  | { t: 'progression'; position: number }
  | { t: 'signal'; a: string; donnees: unknown };

// ---- Serveur -> client ----

/**
 * Pourquoi l'état a changé (`par` = `cid` de l'auteur, `null` si c'est le serveur : fin du compte à rebours, film supprimé).
 * - `lecture` `pause` `aller` `film` `audio` `sous_titres` `compte_a_rebours` : commande de `par` ;
 * - `fin` : `par` a signalé la fin du film (`pause` avec `fin`) ;
 * - `tampon` : la liste `attente` a changé (et la lecture s'est arrêtée si elle tournait) ;
 * - `reprise` : plus personne n'attend, la lecture suspendue reprend ;
 * - `depart` : une connexion s'est fermée (départ ou perte de connexion) ; `par` vaut alors **le prénom** de la personne
 *   partie (et non un `cid`). La lecture, si elle tournait, est mise en pause pour tous ; pas de changement d'état si la
 *   personne garde un autre onglet dans la séance (sauf si son départ vide `attente` : alors `reprise`) ;
 * - `attente-ignoree` : `par` (le `cid` de qui a cliqué) a retiré le `cid` demandé de la liste d'attente ;
 * - `compte_a_rebours` avec `par` = `null` : le compte à rebours est fini (la lecture démarre : `lecture` vaut `true`,
 *   ou reste `false` avec `attente` non vide si quelqu'un met encore en mémoire).
 */
export type RaisonEtat =
  | 'lecture' | 'pause' | 'aller' | 'film' | 'audio' | 'sous_titres' | 'compte_a_rebours'
  | 'tampon' | 'reprise' | 'depart' | 'attente-ignoree' | 'fin';

/** Codes de `erreur {code}` (la connexion reste ouverte sauf mention contraire). */
export type CodeErreurWs =
  | 'message_invalide' | 'type_inconnu' | 'trop_vite' | 'texte_invalide' | 'texte_trop_long'
  | 'film_inconnu' | 'piste_invalide' | 'destinataire_inconnu' | 'serveur';

export type MessageServeur =
  | {
      t: 'bienvenue';
      moi: { cid: string; utilisateur: UtilisateurPublic };
      serveur: number;
      /** Les autres connexions de la salle (pas `moi`). */
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
  | { t: 'erreur'; code: CodeErreurWs; message: string };

export type TypeMessageClient = MessageClient['t'];
export type TypeMessageServeur = MessageServeur['t'];

/** Codes HTTP de refus avant la poignée de main : 401 sans session, 403 `Origin` étrangère, 404 séance inconnue ou non accessible, 503 salle pleine. */
export const REFUS_WS = { nonConnecte: 401, origine: 403, introuvable: 404, pleine: 503 } as const;

/** Pause d'une séance : intervalle (ms) des ping de maintien envoyés par le serveur. */
export const INTERVALLE_MAINTIEN_WS = 25_000;
