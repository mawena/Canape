CREATE TABLE films (
  id TEXT PRIMARY KEY,
  proprietaire_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  titre TEXT NOT NULL, annee INTEGER, resume TEXT, genres TEXT, tmdb_id INTEGER,
  fichier TEXT NOT NULL,                               -- relatif à CANAPE_FILMS : <id>/original.<ext>
  nom_origine TEXT NOT NULL, taille INTEGER NOT NULL, duree REAL,
  analyse TEXT,                                        -- JSON « Analyse » (partage/src/films.ts)
  affiche TEXT, fond TEXT,                             -- relatifs à CANAPE_FILMS
  etat TEXT NOT NULL DEFAULT 'analyse' CHECK (etat IN ('analyse','pret','erreur')),
  erreur TEXT,
  visibilite TEXT NOT NULL DEFAULT 'prive' CHECK (visibilite IN ('prive','partage','tous')),
  ajoute_le TEXT NOT NULL
);
CREATE TABLE films_partages (
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  PRIMARY KEY (film_id, utilisateur_id)
);
CREATE TABLE sous_titres_externes (
  id INTEGER PRIMARY KEY,
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  langue TEXT, libelle TEXT NOT NULL, fichier TEXT NOT NULL   -- .vtt relatif à CANAPE_FILMS
);
CREATE TABLE televersements (                          -- envois tus en cours (quota)
  id TEXT PRIMARY KEY,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom TEXT NOT NULL, taille INTEGER NOT NULL, cree_le TEXT NOT NULL
);
