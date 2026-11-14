-- Films « à voir ensemble » : chacun marque ceux de la galerie qu'il a envie de voir.
CREATE TABLE envies (
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  cree_le TEXT NOT NULL,
  PRIMARY KEY (utilisateur_id, film_id)
);
CREATE INDEX envies_film ON envies (film_id);
