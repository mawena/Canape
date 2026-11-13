-- Notifications Web Push : clés VAPID du serveur, abonnements (un par appareil), limite d'envoi par séance.
CREATE TABLE notifications_cles (                      -- une seule ligne : ces clés ne doivent jamais changer (sinon tous les abonnements meurent)
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cle_publique TEXT NOT NULL,                          -- base64url, 65 octets
  cle_privee TEXT NOT NULL,                            -- base64url, 32 octets
  cree_le TEXT NOT NULL
);
CREATE TABLE notifications_abonnements (
  id INTEGER PRIMARY KEY,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  appareil TEXT NOT NULL,                              -- nom lisible (« Firefox sur Linux »)
  cree_le TEXT NOT NULL,
  dernier_succes_le TEXT,
  dernier_echec_le TEXT,
  dernier_echec_raison TEXT
);
CREATE INDEX notifications_abonnements_utilisateur ON notifications_abonnements (utilisateur_id);
CREATE TABLE notifications_envois (                    -- dernière notification « est dans la salle » par personne prévenue et par séance
  seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  envoye_le TEXT NOT NULL,
  PRIMARY KEY (seance_id, utilisateur_id)
);
