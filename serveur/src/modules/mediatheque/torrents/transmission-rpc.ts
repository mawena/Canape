// Client du RPC JSON de Transmission (https://github.com/transmission/transmission/blob/main/docs/rpc-spec.md).
// Sans dépendance : `fetch`, en-tête `X-Transmission-Session-Id` renouvelé sur 409, authentification de base,
// délai, erreurs en français. Ne journalise ni ne montre jamais le mot de passe ni une clé de tracker.
import { masquer } from './securite.ts';

export type CodeErreurTransmission = 'injoignable' | 'delai' | 'authentification' | 'interdit' | 'refus' | 'reponse';

export class ErreurTransmission extends Error {
  readonly code: CodeErreurTransmission;
  constructor(code: CodeErreurTransmission, message: string) {
    super(message);
    this.name = 'ErreurTransmission';
    this.code = code;
  }
}

export interface OptionsClientTransmission {
  url: string;
  utilisateur?: string;
  motDePasse?: string;
  /** Délai d'une requête (ms). */
  delaiMs?: number;
}

interface ReponseRpc<T> { result: string; arguments?: T }

export class ClientTransmission {
  private readonly url: string;
  private readonly delaiMs: number;
  private readonly autorisation: string | null;
  private session = '';
  /** Adresse sans identifiants, pour les messages. */
  readonly adresse: string;

  constructor(o: OptionsClientTransmission) {
    const u = new URL(o.url);
    // Les identifiants glissés dans l'URL servent à l'authentification mais ne restent dans aucun message.
    const utilisateur = o.utilisateur || decodeURIComponent(u.username);
    const motDePasse = o.motDePasse || decodeURIComponent(u.password);
    u.username = '';
    u.password = '';
    this.url = u.toString();
    this.adresse = this.url;
    this.delaiMs = o.delaiMs ?? 10_000;
    this.autorisation = utilisateur ? `Basic ${Buffer.from(`${utilisateur}:${motDePasse}`).toString('base64')}` : null;
  }

  /** Appelle une méthode du RPC et rend ses `arguments`. */
  async appeler<T = Record<string, unknown>>(methode: string, args: Record<string, unknown> = {}): Promise<T> {
    for (let essai = 0; essai < 3; essai++) {
      let rep: Response;
      try {
        rep = await fetch(this.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-transmission-session-id': this.session,
            ...(this.autorisation ? { authorization: this.autorisation } : {}),
          },
          body: JSON.stringify({ method: methode, arguments: args }),
          signal: AbortSignal.timeout(this.delaiMs),
          redirect: 'error',
        });
      } catch (e) {
        const nom = (e as Error).name;
        if (nom === 'TimeoutError' || nom === 'AbortError') {
          throw new ErreurTransmission('delai', `Transmission ne répond pas à temps (${this.adresse}).`);
        }
        throw new ErreurTransmission('injoignable', `Transmission est injoignable (${this.adresse}). Est-il démarré ?`);
      }
      if (rep.status === 409) {
        const id = rep.headers.get('x-transmission-session-id');
        await rep.arrayBuffer().catch(() => undefined);
        if (!id) throw new ErreurTransmission('reponse', "Transmission n'a pas donné d'identifiant de session.");
        this.session = id;
        continue;
      }
      if (rep.status === 401) {
        await rep.arrayBuffer().catch(() => undefined);
        throw new ErreurTransmission('authentification', "Transmission refuse l'identifiant ou le mot de passe (CANAPE_TRANSMISSION_UTILISATEUR, CANAPE_TRANSMISSION_MOT_DE_PASSE).");
      }
      if (rep.status === 403) {
        await rep.arrayBuffer().catch(() => undefined);
        throw new ErreurTransmission('interdit', "Transmission refuse cette machine (liste blanche du RPC : rpc-whitelist doit contenir 127.0.0.1).");
      }
      if (!rep.ok) {
        await rep.arrayBuffer().catch(() => undefined);
        throw new ErreurTransmission('reponse', `Transmission a répondu ${rep.status} : ce n'est pas son adresse RPC (${this.adresse}) ?`);
      }
      let corps: ReponseRpc<T>;
      try { corps = (await rep.json()) as ReponseRpc<T>; } catch {
        throw new ErreurTransmission('reponse', `La réponse de Transmission est illisible (${this.adresse}).`);
      }
      if (typeof corps?.result !== 'string') throw new ErreurTransmission('reponse', "La réponse de Transmission n'a pas le bon format.");
      if (corps.result !== 'success') throw new ErreurTransmission('refus', `Transmission a refusé « ${methode} » : ${masquer(corps.result)}`);
      return (corps.arguments ?? {}) as T;
    }
    throw new ErreurTransmission('reponse', "Transmission redemande sans cesse un nouvel identifiant de session.");
  }
}
