CREATE TABLE utilisateurs (
  id INTEGER PRIMARY KEY,
  prenom TEXT NOT NULL,
  identifiant TEXT NOT NULL UNIQUE COLLATE NOCASE,     -- pseudo ou e-mail, pour se connecter
  mot_de_passe TEXT NOT NULL,                          -- Argon2id, format PHC
  role TEXT NOT NULL CHECK (role IN ('admin','viewer')),
  peut_televerser INTEGER NOT NULL DEFAULT 1,
  quota_octets INTEGER,                                -- NULL = illimité
  actif INTEGER NOT NULL DEFAULT 1,
  couleur TEXT,                                        -- couleur d'avatar (choisie à la création)
  cree_le TEXT NOT NULL, derniere_connexion TEXT
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                                 -- SHA-256 du jeton du cookie
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  cree_le TEXT NOT NULL, expire_le TEXT NOT NULL, vu_le TEXT NOT NULL, agent TEXT, ip TEXT
);
CREATE TABLE invitations (
  id INTEGER PRIMARY KEY,
  jeton_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('compte','reinitialisation')),
  role TEXT CHECK (role IN ('admin','viewer')),         -- type compte
  utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE,   -- type reinitialisation
  prenom_suggere TEXT,
  cree_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  cree_le TEXT NOT NULL, expire_le TEXT NOT NULL, utilisee_le TEXT
);
