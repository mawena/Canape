// Client WebSocket de la salle : JSON, reconnexion automatique avec attente croissante.
import type { EtatLiaison, MessageClient, MessageServeur } from './types.ts';

/** Ce qu'on exige d'un WebSocket (permet de le simuler sous Node). */
export interface SocketLike {
  readyState: number;
  send(donnees: string): void;
  close(): void;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export interface OptionsClientWs {
  url: string;
  creerSocket?: (url: string) => SocketLike;
  surMessage: (m: MessageServeur) => void;
  /** `tentative` : nombre d'échecs consécutifs depuis la dernière ouverture. */
  surLiaison: (etat: EtatLiaison, tentative: number) => void;
  /** Avant chaque reconnexion : rendre `false` pour s'arrêter (session expirée, séance supprimée…). */
  avantReconnexion?: (tentative: number) => Promise<boolean>;
}

export const OUVERT = 1;

/** Attente avant la prochaine tentative (ms) : 2 s, 4 s, 8 s, puis 10 s. */
export function delaiReconnexion(tentative: number): number {
  return Math.min(1000 * 2 ** Math.min(Math.max(tentative, 1), 4), 10_000);
}

export class ClientWs {
  private socket: SocketLike | null = null;
  private tentative = 0;
  private arrete = false;
  private minuterie: ReturnType<typeof setTimeout> | null = null;

  private readonly o: OptionsClientWs;

  constructor(o: OptionsClientWs) {
    this.o = o;
  }

  get ouvert(): boolean {
    return this.socket?.readyState === OUVERT;
  }

  connecter(): void {
    this.arrete = false;
    this.ouvrir();
  }

  private ouvrir(): void {
    this.o.surLiaison('connexion', this.tentative);
    const s = this.o.creerSocket ? this.o.creerSocket(this.o.url) : (new WebSocket(this.o.url) as unknown as SocketLike);
    this.socket = s;
    let ouvert = false;
    s.onopen = () => {
      ouvert = true;
      this.tentative = 0;
      this.o.surLiaison('ouvert', 0);
    };
    s.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        this.o.surMessage(JSON.parse(e.data) as MessageServeur);
      } catch {
        /* message illisible : ignoré */
      }
    };
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      this.tentative = ouvert ? 1 : this.tentative + 1;
      this.o.surLiaison('ferme', this.tentative);
      if (!this.arrete) this.programmer();
    };
  }

  private programmer(): void {
    this.minuterie = setTimeout(async () => {
      this.minuterie = null;
      if (this.arrete) return;
      if (this.o.avantReconnexion && !(await this.o.avantReconnexion(this.tentative))) return;
      if (!this.arrete) this.ouvrir();
    }, delaiReconnexion(this.tentative));
  }

  envoyer(m: MessageClient): boolean {
    if (!this.socket || this.socket.readyState !== OUVERT) return false;
    this.socket.send(JSON.stringify(m));
    return true;
  }

  fermer(): void {
    this.arrete = true;
    if (this.minuterie) clearTimeout(this.minuterie);
    this.minuterie = null;
    const s = this.socket;
    this.socket = null;
    s?.close();
  }
}

export function urlWsSeance(id: string, loc: Pick<Location, 'protocol' | 'host'> = location): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws/seances/${encodeURIComponent(id)}`;
}
