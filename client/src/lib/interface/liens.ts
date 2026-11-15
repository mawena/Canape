// Adresses des pages des autres modules, réunies ici pour n'avoir qu'un endroit à corriger à l'intégration.
export const liens = {
  galerie: '/galerie',
  ajouterFilm: '/galerie?ajouter=1',
  film: (id: string) => `/galerie/${id}`,
  seances: '/seances',
  /** Nouvelle séance, avec un film et des personnes déjà invitées (`invites` : identifiants des comptes). */
  nouvelleSeance: (filmId?: string, invites: number[] = []) => {
    const q = new URLSearchParams();
    if (filmId) q.set('film', filmId);
    if (invites.length) q.set('invites', invites.join(','));
    const s = q.toString();
    return s ? `/seances/nouvelle?${s}` : '/seances/nouvelle';
  },
  seance: (id: string) => `/seances/${id}`,
  historique: '/historique',
  compte: '/compte',
};
