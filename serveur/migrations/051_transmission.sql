-- Moteur Transmission (phase 16, contrat : docs/CONCEPTION.md, « Moteur Transmission »).
ALTER TABLE telechargements ADD COLUMN moteur TEXT NOT NULL DEFAULT 'webtorrent' CHECK (moteur IN ('transmission','webtorrent'));
ALTER TABLE telechargements ADD COLUMN prive INTEGER NOT NULL DEFAULT 0;          -- torrent privé (drapeau private)
ALTER TABLE telechargements ADD COLUMN en_partage INTEGER NOT NULL DEFAULT 0;     -- encore partagé après `termine`
ALTER TABLE telechargements ADD COLUMN ratio REAL;                                -- dernier ratio envoyé / reçu connu
ALTER TABLE telechargements ADD COLUMN message_tracker TEXT;                      -- dernière réponse d'un tracker qui refuse (sans clé)
