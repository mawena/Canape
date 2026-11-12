CREATE TABLE preparations (                            -- versions converties à l'avance (MP4 lisible partout)
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  piste_audio INTEGER NOT NULL,
  etat TEXT NOT NULL CHECK (etat IN ('attente','encours','prete','erreur')),
  progression REAL NOT NULL DEFAULT 0, fichier TEXT, taille INTEGER,
  cree_le TEXT NOT NULL, termine_le TEXT, erreur TEXT,
  PRIMARY KEY (film_id, piste_audio)
);
