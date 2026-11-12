// Règles de navigation de l'interface : quelles routes gèrent elles-mêmes la connexion, laquelle est la salle.
export const ROUTES_LIBRES = [/^\/connexion(\/|$)/, /^\/invitation(\/|$)/, /^\/rejoindre(\/|$)/];

/** Routes qui gèrent elles-mêmes l'accès (connexion, invitation, lien de séance) : pas de garde, pas de navigation. */
export function estRouteLibre(chemin: string): boolean {
  return ROUTES_LIBRES.some((r) => r.test(chemin));
}

/** La salle `/seances/<id>` est plein cadre, sans navigation (`/seances/nouvelle` est la création : navigation normale). */
export function estSalle(chemin: string): boolean {
  return /^\/seances\/(?!nouvelle\/?$)[^/]+\/?$/.test(chemin);
}

export type Section = 'accueil' | 'films' | 'seances' | 'historique' | null;

/** Section de la navigation active pour un chemin. */
export function sectionActive(chemin: string): Section {
  if (chemin === '/') return 'accueil';
  if (/^\/(galerie|films)(\/|$)/.test(chemin)) return 'films';
  if (/^\/seances(\/|$)/.test(chemin)) return 'seances';
  if (/^\/historique(\/|$)/.test(chemin)) return 'historique';
  return null;
}
