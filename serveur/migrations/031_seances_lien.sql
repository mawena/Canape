-- Le lien d'une séance reste le même tant que l'hôte ne le retire pas : « Copier le lien » peut être utilisé
-- plusieurs fois sans casser le lien déjà envoyé. Le jeton est gardé pour être redonné à l'hôte.
ALTER TABLE seances ADD COLUMN lien_jeton TEXT;
