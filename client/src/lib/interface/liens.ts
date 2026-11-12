// Adresses des pages des autres modules, réunies ici pour n'avoir qu'un endroit à corriger à l'intégration.
export const liens = {
  galerie: '/galerie',
  ajouterFilm: '/galerie?ajouter=1',
  film: (id: string) => `/galerie/${id}`,
  seances: '/seances',
  nouvelleSeance: (filmId?: string) => (filmId ? `/seances/nouvelle?film=${encodeURIComponent(filmId)}` : '/seances/nouvelle'),
  seance: (id: string) => `/seances/${id}`,
  historique: '/historique',
  compte: '/compte',
};
