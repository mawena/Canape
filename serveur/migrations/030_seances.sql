CREATE TABLE seances (
  id TEXT PRIMARY KEY,
  hote_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  film_id TEXT REFERENCES films(id) ON DELETE SET NULL,
  titre TEXT, prevue_le TEXT,
  lien_hash TEXT UNIQUE,                               -- lien pour rejoindre (NULL = pas de lien)
  piste_audio INTEGER, sous_titres TEXT,               -- choix partagés
  position REAL NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL, terminee_le TEXT
);
CREATE TABLE seances_participants (
  seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  PRIMARY KEY (seance_id, utilisateur_id)
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  texte TEXT NOT NULL, position REAL, envoye_le TEXT NOT NULL
);
CREATE TABLE progression (                             -- reprise et historique
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  position REAL NOT NULL, duree REAL, seance_id TEXT REFERENCES seances(id) ON DELETE SET NULL,
  termine INTEGER NOT NULL DEFAULT 0, vu_le TEXT NOT NULL,
  PRIMARY KEY (utilisateur_id, film_id)
);
