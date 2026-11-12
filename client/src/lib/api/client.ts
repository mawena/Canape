// Client HTTP typé de l'API Canapé. Les erreurs du serveur `{ erreur, message }` deviennent des `ErreurApi`.
import type { ErreurApiCorps } from '@canape/partage';

export class ErreurApi extends Error {
  statut: number;
  code: string;
  constructor(statut: number, code: string, message: string) {
    super(message);
    this.name = 'ErreurApi';
    this.statut = statut;
    this.code = code;
  }
}

export interface OptionsRequete {
  /** Corps : objet JSON (sérialisé), `FormData` ou `Blob` (envoyés tels quels). */
  corps?: unknown;
  signal?: AbortSignal;
  entetes?: Record<string, string>;
}

type Gestionnaire401 = (erreur: ErreurApi) => void;
let sur401: Gestionnaire401 | null = null;

/** Le magasin de session s'abonne ici pour réagir à une session expirée (statut 401 hors connexion). */
export function surNonConnecte(cb: Gestionnaire401 | null): void {
  sur401 = cb;
}

function estCorpsBrut(c: unknown): c is FormData | Blob | ArrayBuffer | URLSearchParams | string {
  return (
    typeof c === 'string' ||
    (typeof FormData !== 'undefined' && c instanceof FormData) ||
    (typeof Blob !== 'undefined' && c instanceof Blob) ||
    c instanceof ArrayBuffer ||
    c instanceof URLSearchParams
  );
}

/** Appel brut : rend le JSON (ou `undefined` pour 204) ; lève `ErreurApi` sinon. */
export async function requete<T = void>(methode: string, url: string, options: OptionsRequete = {}): Promise<T> {
  const entetes: Record<string, string> = { Accept: 'application/json', ...options.entetes };
  const init: RequestInit = { method: methode, credentials: 'same-origin', headers: entetes };
  if (options.signal) init.signal = options.signal;
  if (options.corps !== undefined) {
    if (estCorpsBrut(options.corps)) {
      init.body = options.corps;
    } else {
      init.body = JSON.stringify(options.corps);
      entetes['Content-Type'] = 'application/json';
    }
  }
  let reponse: Response;
  try {
    reponse = await fetch(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ErreurApi(0, 'reseau', 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }
  if (reponse.ok) {
    if (reponse.status === 204) return undefined as T;
    const type = reponse.headers.get('content-type') ?? '';
    return (type.includes('json') ? await reponse.json() : undefined) as T;
  }
  let corps: Partial<ErreurApiCorps> = {};
  try {
    corps = (await reponse.json()) as Partial<ErreurApiCorps>;
  } catch {
    /* corps absent ou non JSON */
  }
  const erreur = new ErreurApi(
    reponse.status,
    corps.erreur ?? 'erreur_http',
    corps.message ?? `Erreur ${reponse.status}.`,
  );
  if (reponse.status === 401) sur401?.(erreur);
  throw erreur;
}

export const api = {
  get: <T>(url: string, options?: OptionsRequete) => requete<T>('GET', url, options),
  post: <T = void>(url: string, corps?: unknown, options?: OptionsRequete) =>
    requete<T>('POST', url, { ...options, corps }),
  patch: <T = void>(url: string, corps?: unknown, options?: OptionsRequete) =>
    requete<T>('PATCH', url, { ...options, corps }),
  put: <T = void>(url: string, corps?: unknown, options?: OptionsRequete) =>
    requete<T>('PUT', url, { ...options, corps }),
  supprimer: <T = void>(url: string, options?: OptionsRequete) => requete<T>('DELETE', url, options),
};
