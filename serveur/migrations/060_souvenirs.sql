-- Souvenirs de séance : temps passé ensemble, présents, note d'un mot de chacun.
ALTER TABLE seances ADD COLUMN ensemble_secondes REAL NOT NULL DEFAULT 0;   -- durée cumulée à deux personnes (ou plus) en même temps
CREATE TABLE seances_presences (                       -- toute personne entrée au moins une fois dans la salle
  seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  premiere_le TEXT NOT NULL,
  PRIMARY KEY (seance_id, utilisateur_id)
);
CREATE TABLE seances_notes (                           -- une note d'un mot par personne et par séance
  seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (note IN ('coeur', 'bien', 'bof')),
  notee_le TEXT NOT NULL,
  PRIMARY KEY (seance_id, utilisateur_id)
);
