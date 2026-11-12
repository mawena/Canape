-- Inscription libre (phase 15, module comptes ; contrat : docs/CONCEPTION.md, « Inscription libre »).
ALTER TABLE utilisateurs ADD COLUMN peut_torrent INTEGER NOT NULL DEFAULT 1;
ALTER TABLE utilisateurs ADD COLUMN origine TEXT NOT NULL DEFAULT 'invitation'
  CHECK (origine IN ('installation', 'invitation', 'inscription'));
UPDATE utilisateurs SET origine = 'installation' WHERE id = (SELECT MIN(id) FROM utilisateurs WHERE role = 'admin');
