export * from './comptes.ts';
export * from './films.ts';
export * from './lecture.ts';
export * from './seances.ts';
export * from './torrents.ts';
export * from './ws.ts';

/** Format des erreurs de l'API : `{ erreur, message }`. */
export interface ErreurApiCorps {
  erreur: string;
  message: string;
}

/** Nom du cookie de session. */
export const COOKIE_SESSION = 'canape_session';
