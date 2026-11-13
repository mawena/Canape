-- Soirée à plusieurs films : le programme d'une séance. `seances.film_id` reste le film en cours ; `rang_courant` est son rang dans le programme.
ALTER TABLE seances ADD COLUMN rang_courant INTEGER NOT NULL DEFAULT 0;
CREATE TABLE seances_programme (
  seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  rang INTEGER NOT NULL,                               -- ordre dans le programme (des trous sont permis : un film supprimé disparaît)
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  PRIMARY KEY (seance_id, rang)
);
CREATE INDEX seances_programme_film ON seances_programme (film_id);
-- Les séances existantes ont un programme d'un seul film : celui qu'elles avaient.
INSERT INTO seances_programme (seance_id, rang, film_id) SELECT id, 0, film_id FROM seances WHERE film_id IS NOT NULL;
