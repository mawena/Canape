-- Films téléchargés par torrent (module médiathèque, contrat : docs/CONCEPTION.md, « Torrents »).
CREATE TABLE telechargements (
  id TEXT PRIMARY KEY,
  proprietaire_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  info_hash TEXT NOT NULL,
  source TEXT NOT NULL,                                -- lien magnet, ou chemin du .torrent gardé (relatif à CANAPE_TELECHARGEMENTS)
  nom TEXT,
  etat TEXT NOT NULL CHECK (etat IN ('metadonnees','telechargement','pause','import','termine','erreur','annule')),
  fichiers TEXT,                                       -- JSON FichierTorrent[] (partage/src/torrents.ts)
  octets_total INTEGER,                                -- taille des fichiers choisis
  octets_recus INTEGER NOT NULL DEFAULT 0,
  films TEXT NOT NULL DEFAULT '[]',                    -- JSON des identifiants des films créés
  erreur TEXT,
  cree_le TEXT NOT NULL,
  termine_le TEXT
);
CREATE INDEX telechargements_proprietaire ON telechargements (proprietaire_id);
