# Conception — Canapé 1.0

Contrat commun de la version 1.0. Les sous-agents le suivent **à la lettre** ; un écart se signale dans le rapport,
il ne s'improvise pas. La version 0.1 (salon unique à mot de passe) reste lisible dans git : `git show v0.1.0:<fichier>`
(logique éprouvée à reprendre : `src/salon.js`, `src/ws.js`, `public/js/appel.js`, `public/js/app.js`,
`public/js/son.js`, `docs/PROTOCOLE.md`, `deploiement/`).

## Pourquoi

Regarder un film à deux (ou à quelques-uns), chacun chez soi, en se voyant et en s'entendant, comme sur le même
canapé : image nette (chaque navigateur lit le film depuis le serveur, pas de partage d'écran), son du film **et**
voix en même temps, lecture synchronisée. La 1.0 en fait une vraie plateforme privée : comptes, galeries,
téléversement de n'importe quel fichier vidéo, lecture de tous les formats sans conversion à la main, séances,
mise en production automatique.

Anti-objectifs : image saccadée ; devoir choisir entre son du film et voix ; devoir convertir un film à la main ;
casser les autres sites du VPS ; une interface « générique » sans âme.

## Choix faits par défaut (modifiables)

- Chaque compte (admin ou viewer) a sa galerie et peut téléverser ; l'admin fixe un quota par compte et peut retirer
  le droit de téléverser. Un film est **privé** par défaut ; son propriétaire le partage avec certains comptes ou avec
  tous. Être invité à une séance donne accès à son film pendant la séance. L'admin voit tout.
- L'admin invite par lien (valable 7 jours, usage unique) ; depuis la phase 15, chacun peut aussi **s'inscrire
  librement** (« Inscription libre », réglable par l'admin).
- Caractéristiques du VPS inconnues : la lecture s'adapte (direct → conversion du son seul → conversion de l'image
  à la volée), et les films lourds (4K, HDR) sont convertis à l'avance quand le serveur est calme.
- Affiches et résumés TMDB seulement si une clé est configurée ; sinon titre et année tirés du nom de fichier et image
  tirée du film.

## Technologies

| Rôle | Choix |
|---|---|
| Serveur | **Node.js 26** (LTS), **TypeScript exécuté directement** par Node (suppression des types, aucune compilation), ESM |
| Cadre web | **Fastify 5** : `@fastify/cookie`, `@fastify/websocket`, `@fastify/static`, `@fastify/rate-limit`, `@fastify/multipart` |
| Base | **SQLite** par `node:sqlite` (intégré à Node), fichier unique, WAL |
| Mots de passe | **Argon2id** (`@node-rs/argon2`, binaires précompilés N-API) |
| Téléversement | **tus 1.0** : `@tus/server` + `@tus/file-store` ; client `tus-js-client` |
| Vidéo | **ffmpeg / ffprobe** du serveur ; **HLS** (segments fMP4) ; client **hls.js** (Safari : HLS natif) |
| Interface | **Svelte 5** (runes) + **SvelteKit 2** en application monopage (`adapter-static`, repli `index.html`) + TypeScript + Vite |
| Temps réel | WebSocket (synchro, chat, réactions, signalisation) ; **WebRTC** pair à pair en maillage pour caméras et micros |
| Tests | `node:test` (serveur et logique client en TS pur) ; **Playwright** (Chromium, Firefox, WebKit, caméras simulées) |
| Livraison | **GitHub Actions** (CI sur `develop`, déploiement automatique sur `main`) ; systemd + nginx sur le VPS |

Typage : `tsc --noEmit` (serveur, partage) et `svelte-check` (client). Seule la syntaxe TypeScript « effaçable » est
permise côté serveur (pas d'`enum`, pas de `namespace`, pas de propriétés de paramètres) ; imports relatifs avec
l'extension `.ts`.

## Arborescence et propriétaires

Espaces de travail npm : `serveur`, `client`, `partage`. **Personne d'autre que le socle ne modifie les
`package.json` ni `package-lock.json`** : une dépendance manquante se demande dans le rapport.

```
package.json, package-lock.json, tsconfig.base.json, .gitignore        socle
bin/canape                    socle   (lance serveur/src/index.ts avec le Node du système ou /opt/canape/node)
partage/src/index.ts          socle   (réexporte les fichiers ci-dessous)
partage/src/comptes.ts        comptes
partage/src/films.ts          mediatheque
partage/src/lecture.ts        lecture
partage/src/seances.ts        seances
partage/src/ws.ts             seances (contrat ci-dessous ; la salle le lit)
serveur/src/index.ts          socle   (ligne de commande : serve | admin … | films importer …)
serveur/src/app.ts            socle   (construit l'app Fastify, enregistre les 4 modules, sert client/build)
serveur/src/config.ts         socle
serveur/src/db/               socle   (connexion, migrateur, transactions)
serveur/src/commun/           socle   (erreurs, identifiants, auth : décorateurs et hooks, journal, ffmpeg de base)
serveur/src/modules/comptes/      comptes
serveur/src/modules/mediatheque/  mediatheque
serveur/src/modules/lecture/      lecture
serveur/src/modules/seances/      seances
serveur/migrations/001_base.sql   socle ; 010_comptes.sql, 020_films.sql, 030_seances.sql, 040_lecture.sql : écrits par
                                  le socle d'après ce document, puis propriété du module (ajouts : nouveaux fichiers
                                  0X1_…, 0X2_… du même module, jamais de modification d'une migration publiée)
serveur/tests/aides.ts        socle   (app de test sur base temporaire, création d'utilisateur + cookie)
serveur/tests/<module>/       le module
client/ (svelte.config.js, vite.config.ts, src/app.html, src/app.d.ts)  socle
client/src/lib/api/           socle   (client fetch typé, erreurs)
client/src/lib/ui/            socle (kit de base) puis interface (seule à le modifier ensuite)
client/src/lib/comptes/       comptes      (magasin de session : utilisateur courant, connexion, déconnexion)
client/src/lib/mediatheque/   mediatheque  (téléverseur tus, cartes de films, fiche…)
client/src/lib/lecture/       lecture      (composant Lecteur, composant Preparation)
client/src/lib/seance/        salle        (client WebSocket, moteur de synchro, WebRTC, son, chat, réactions)
client/src/routes/+layout.svelte, +layout.ts, +page.svelte (accueil), historique/   interface
client/src/routes/connexion/, invitation/, compte/, admin/ (sauf admin/lecture/)      comptes
client/src/routes/galerie/                                                            mediatheque
client/src/routes/admin/lecture/                                                      lecture
client/src/routes/seances/, rejoindre/                                                salle
client/static/, client/src/service-worker.ts (PWA)                                    interface
e2e/                          intégration (Playwright)
deploiement/, .github/, scripts/paquet.sh                                             livraison
docs/DESIGN.md                recherche produit et design
docs/RECHERCHE-TECHNIQUE.md   recherche technique
docs/DEPLOIEMENT.md           livraison
README.md, CHANGELOG.md, ROADMAP.md, docs/CONCEPTION.md                               coordination (moi)
```

La v0.1 (`src/`, `public/`, `tests/`, `outils/`, `bin/canape-convertir`, `docs/PROTOCOLE.md`) est retirée par le
socle : la préparation automatique côté serveur remplace `canape-convertir`.

## Configuration

Variables d'environnement ; `canape serve --config <fichier>` (ou `CANAPE_CONFIG`) lit en plus un fichier `CLÉ=valeur`.
Sur le VPS : `/etc/canape/canape.conf` lu par systemd.

| Variable | Défaut | Rôle |
|---|---|---|
| `CANAPE_HOTE` / `CANAPE_PORT` | `127.0.0.1` / `8080` | écoute |
| `CANAPE_URL_PUBLIQUE` | `http://localhost:8080` | adresse publique (liens d'invitation, contrôle d'`Origin`) |
| `CANAPE_DERRIERE_PROXY` | `0` | `1` = faire confiance à `X-Forwarded-*` |
| `CANAPE_DONNEES` | `./donnees` | base `canape.sqlite` et ses sauvegardes |
| `CANAPE_FILMS` | `./films` | un dossier par film : `<id>/original.<ext>`, `<id>/affiche.jpg`, `<id>/sous-titres/` |
| `CANAPE_CACHE` | `./cache` | segments HLS, sous-titres extraits, index d'images clés |
| `CANAPE_TELEVERSEMENTS` | `./televersements` | envois tus en cours |
| `CANAPE_TELEVERSEMENT_MAX` | `100G` | taille maximale d'un fichier |
| `CANAPE_QUOTA_DEFAUT` | `100G` | quota d'un nouveau viewer (admin : illimité) |
| `CANAPE_CACHE_MAX` | `20G` | taille maximale du cache (purge des plus anciens) |
| `CANAPE_TRANSCODAGE_FILS` | moitié des cœurs | fils ffmpeg pour une conversion |
| `CANAPE_TRANSCODAGE_PRIORITE` | `10` | priorité `nice` des conversions (les autres sites passent avant) |
| `CANAPE_PREPARATION_AUTO` | `1` | convertir à l'avance, quand le serveur est calme, les films qui ne peuvent pas être lus directement |
| `CANAPE_TMDB_CLE` | vide | clé TMDB (affiches, résumés) |
| `CANAPE_ICE`, `CANAPE_TURN_URLS`, `CANAPE_TURN_SECRET` | STUN Google / vides | comme en 0.1 |
| `CANAPE_TLS_CERT`, `CANAPE_TLS_CLE` | vides | HTTPS direct (sinon nginx) |

## Données (SQLite)

Clés étrangères activées, WAL, `busy_timeout`. Dates en texte ISO 8601 UTC. Identifiants de films et de séances :
12 caractères base32 minuscules aléatoires. Les jetons (sessions, invitations, liens de séance) ne sont jamais
stockés en clair : seulement leur SHA-256 en hexadécimal.

```sql
-- 001_base.sql (socle)
CREATE TABLE reglages (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);   -- JSON

-- 010_comptes.sql
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

-- 020_films.sql
CREATE TABLE films (
  id TEXT PRIMARY KEY,
  proprietaire_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  titre TEXT NOT NULL, annee INTEGER, resume TEXT, genres TEXT, tmdb_id INTEGER,
  fichier TEXT NOT NULL,                               -- relatif à CANAPE_FILMS : <id>/original.<ext>
  nom_origine TEXT NOT NULL, taille INTEGER NOT NULL, duree REAL,
  analyse TEXT,                                        -- JSON « Analyse » (partage/src/films.ts)
  affiche TEXT, fond TEXT,                             -- relatifs à CANAPE_FILMS
  etat TEXT NOT NULL DEFAULT 'analyse' CHECK (etat IN ('analyse','pret','erreur')),
  erreur TEXT,
  visibilite TEXT NOT NULL DEFAULT 'prive' CHECK (visibilite IN ('prive','partage','tous')),
  ajoute_le TEXT NOT NULL
);
CREATE TABLE films_partages (
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  PRIMARY KEY (film_id, utilisateur_id)
);
CREATE TABLE sous_titres_externes (
  id INTEGER PRIMARY KEY,
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  langue TEXT, libelle TEXT NOT NULL, fichier TEXT NOT NULL   -- .vtt relatif à CANAPE_FILMS
);
CREATE TABLE televersements (                          -- envois tus en cours (quota)
  id TEXT PRIMARY KEY,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom TEXT NOT NULL, taille INTEGER NOT NULL, cree_le TEXT NOT NULL
);

-- 030_seances.sql
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

-- 060_souvenirs.sql (fin de séance et souvenir)
ALTER TABLE seances ADD COLUMN ensemble_secondes REAL NOT NULL DEFAULT 0;  -- temps cumulé à deux personnes différentes ou plus
CREATE TABLE seances_presences (                       -- toute personne entrée au moins une fois dans la salle
  seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  premiere_le TEXT NOT NULL, PRIMARY KEY (seance_id, utilisateur_id)
);
CREATE TABLE seances_notes (                           -- note d'un mot : coeur | bien | bof
  seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (note IN ('coeur','bien','bof')), notee_le TEXT NOT NULL,
  PRIMARY KEY (seance_id, utilisateur_id)
);

-- 040_lecture.sql
CREATE TABLE preparations (                            -- versions converties à l'avance (MP4 lisible partout)
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  piste_audio INTEGER NOT NULL,
  etat TEXT NOT NULL CHECK (etat IN ('attente','encours','prete','erreur')),
  progression REAL NOT NULL DEFAULT 0, fichier TEXT, taille INTEGER,
  cree_le TEXT NOT NULL, termine_le TEXT, erreur TEXT,
  PRIMARY KEY (film_id, piste_audio)
);
```

## Droits

| | admin | viewer |
|---|---|---|
| Inviter des comptes, gérer comptes, quotas, réglages, voir l'espace disque et les conversions | oui | non |
| Téléverser dans sa galerie | oui | si `peut_televerser`, dans son quota |
| Voir / lire un film | tous | les siens, ceux partagés avec lui, `visibilite='tous'`, ceux des séances où il est invité |
| Modifier, partager, supprimer un film | tous | les siens |
| Créer une séance | oui | avec un film qu'il peut voir |
| Rejoindre une séance | oui | invité ou par le lien de la séance |

Un compte désactivé perd ses sessions. Un refus d'accès à un film ou une séance répond **404** (pas d'indice
d'existence).

## Interface HTTP

Toutes les réponses JSON ; erreurs `{ "erreur": "<code>", "message": "<texte français>" }`. Session : cookie
`canape_session` (HttpOnly, SameSite=Lax, Secure en HTTPS, 30 jours glissants). Requêtes qui modifient : contrôle
d'`Origin` égale à `CANAPE_URL_PUBLIQUE`. Types dans `partage/src/*.ts`.

**Comptes** (module comptes)
- `GET /api/etat` (libre) → `{ version, utilisateur: Utilisateur|null, installationRequise }`
- `POST /api/connexion` `{ identifiant, motDePasse }` → 204 + cookie ; 401 ; 429 (5 échecs/min/IP et /identifiant)
- `POST /api/deconnexion`
- `GET /api/invitations/:jeton` (libre) → `{ type, role, prenomSuggere, valide }`
- `POST /api/invitations/:jeton` (libre) `{ prenom, identifiant, motDePasse }` → 201 + cookie (type compte) ;
  `{ motDePasse }` → 204 (type reinitialisation)
- `GET /api/compte`, `PATCH /api/compte` `{ prenom?, couleur?, motDePasse?: { actuel, nouveau } }`
- `GET /api/utilisateurs` → `[{ id, prenom, couleur }]` (comptes actifs, pour partager et inviter)
- admin : `GET /api/admin/utilisateurs` ; `PATCH|DELETE /api/admin/utilisateurs/:id` ;
  `POST /api/admin/utilisateurs/:id/reinitialisation` → `{ lien }` ; `GET|POST /api/admin/invitations`
  (`{ role, prenomSuggere?, dureeJours? }` → `{ lien }`) ; `DELETE /api/admin/invitations/:id` ;
  `GET /api/admin/stockage` → `{ disque: { total, libre }, films, cache, parUtilisateur: [...] }` ;
  `GET|PATCH /api/admin/reglages`
- Ligne de commande : `canape admin inviter [--role admin|viewer] [--jours 7]` (affiche le lien) ;
  `canape admin reinitialiser <identifiant>`. Premier démarrage sans compte : `installationRequise=true` et le
  serveur écrit dans son journal un lien d'invitation admin (et `canape admin inviter --role admin` en recrée un).

**Médiathèque** (module mediatheque)
- tus 1.0 sur `/api/televersement` (création, `HEAD`/`PATCH` de reprise, terminaison) : session obligatoire,
  `Upload-Metadata` avec `filename` ; refus 413 au-delà de `CANAPE_TELEVERSEMENT_MAX`, 403 sans droit, 507 quota
  dépassé (compté avec les envois en cours). À la fin : déplacement dans `CANAPE_FILMS/<id>/original.<ext>`, ligne
  `films` en état `analyse`, puis analyse ffprobe, titre et année tirés du nom, image tirée du film (et TMDB si
  configuré), état `pret` (ou `erreur` si ce n'est pas une vidéo lisible par ffmpeg). Morceaux de 50 Mo côté client.
- `GET /api/films?vue=miens|partages|tous` ; `GET /api/films/:id` ; `PATCH /api/films/:id` `{ titre?, annee?, resume?,
  visibilite?, partages?: number[] }` ; `DELETE /api/films/:id`
- `GET /api/films/:id/affiche`, `GET /api/films/:id/fond` (images)
- `POST /api/films/:id/tmdb/recherche` `{ requete }` → candidats ; `POST /api/films/:id/tmdb` `{ tmdbId }`
- `POST /api/films/:id/sous-titres` (multipart `.srt`/`.vtt`, 5 Mo max) ; `DELETE /api/films/:id/sous-titres/:sid`
- Événements « film ajouté / prêt » : `app.mediatheque.surFilmPret(cb)` (la lecture s'y abonne pour la préparation).
- Ligne de commande : `canape films importer <dossier> --proprietaire <identifiant>` (reprend les films de la 0.1).

**Lecture** (module lecture)
- `GET /api/films/:id/lecture?audio=<index>` → `PlanDeLecture` : `{ mode: 'direct'|'hls', url, duree,
  pistesAudio: [{ index, langue, libelle, canaux, parDefaut }], sousTitres: [{ cle, langue, libelle, force, sdh, url }],
  raison, preparation: { etat, progression }|null }`
- `GET /media/:id/original` (direct, `Range`) ; `GET /media/:id/prepare/:audio.mp4` (version préparée, `Range`)
- `GET /media/:id/hls/:audio/index.m3u8`, `…/init.mp4`, `…/<n>.m4s` (HLS à la demande)
- `GET /media/:id/sous-titres/:cle.vtt` (`p<index>` piste intégrée extraite et mise en cache ; `e<id>` externe)
- `GET|POST|DELETE /api/films/:id/preparations[/:audio]` (propriétaire ou admin)
- admin : `GET /api/admin/lecture` → conversions en cours, file d'attente, charge, cache

**Séances** (module seances)
- `GET /api/seances` (à venir, en cours, récentes) ; `POST /api/seances` `{ filmId, titre?, prevueLe?, invites?: number[] }`
- `GET|PATCH|DELETE /api/seances/:id` ; `POST|DELETE /api/seances/:id/lien` (crée le lien, ou redonne le lien existant → `{ lien }` ; retire)
- `POST /api/rejoindre/:jeton` → `{ seanceId }` (ajoute aux participants)
- *Réalisé (phase 17, lien pendant la séance)* : l'hôte seul voit « Inviter » (`client/src/lib/seance/InviterSeance.svelte`, logique pure dans `inviter.ts`) dans la barre de commandes de la salle (enfant de l'élément en plein écran, feuille du bas sur téléphone, sans pause ni effet sur la synchro) et dans le sas ; le lien est demandé à l'ouverture (`POST /api/seances/:id/lien`, idempotent). « Copier le lien » dans la liste des séances à venir dont on est l'hôte. Une personne qui ouvre le lien en cours de film reçoit l'état de lecture du serveur de salle et se cale sur la position attendue ; aucune correction serveur n'a été nécessaire.
- `GET /api/seances/:id/messages?avant=<id>`
- *Réalisé (phase 19, fin de séance et souvenir)* : `GET /api/seances/:id/souvenir` → `Souvenir` (`secondesEnsemble`, `personnes: [{ utilisateur, present, note }]`) et `PUT /api/seances/:id/note` `{ note: 'coeur'|'bien'|'bof'|null }` (`null` efface), réservés à l'hôte et aux invités (404 pour tout autre, administrateur compris). Le temps ensemble est mesuré par le serveur de salle (au moins deux comptes différents présents, cumulé ; enregistré à chaque changement d'état, toutes les 25 s et au départ de chacun). `GET /api/historique` ajoute `souvenir` à chaque entrée. Une pause `fin` met le film en « terminé » pour toute la salle.
- `GET /api/reprendre` (films commencés, non terminés) ; `GET /api/historique`
- `GET /api/ice` → `{ iceServers }` (identifiants TURN temporaires)
- `GET /ws/seances/:id` : WebSocket de la séance (ci-dessous)

## Agenda et notifications (phase 20)

**Agenda.** `GET /api/seances/:id/agenda.ics` (hôte et invités ; 404 pour tout autre, administrateur compris, et pour une séance sans date prévue) rend un `VCALENDAR` : `UID` `<id>@<hôte de CANAPE_URL_PUBLIQUE>`, `DTSTART` en UTC, `DURATION` (durée du film, 2 h si inconnue), `SUMMARY` « Canapé : <titre de la séance, sinon du film> », `URL` `<CANAPE_URL_PUBLIQUE>/seances/<id>` (jamais le jeton d'invitation), `VALARM` 15 minutes avant. Lignes pliées à 75 octets, CRLF. La fabrication est une fonction pure de `partage/src/agenda.ts` (`construireIcs`). Bouton `client/src/lib/seance/BoutonAgenda.svelte` (`data-test="ajouter-agenda"`).

**Notifications Web Push**, sans dépendance (`serveur/src/modules/notifications/`) :
- `webpush.ts` : VAPID (RFC 8292, JWT ES256 en `ieee-p1363`, `sub` = `CANAPE_URL_PUBLIQUE`, jamais une adresse e-mail) et chiffrement `aes128gcm` (RFC 8291 / 8188), vérifié sur le vecteur de l'annexe A de la RFC 8291. Un envoi ne lève jamais : il rend `{ ok }` ou `{ expire }` (404 et 410).
- Base (`070_notifications.sql`) : `notifications_cles` (une ligne : clés VAPID créées au premier appel et jamais changées), `notifications_abonnements` (`utilisateur_id`, `endpoint` unique, `p256dh`, `auth`, `appareil`, `cree_le`, `dernier_succes_le`, `dernier_echec_le`, `dernier_echec_raison`), `notifications_envois` (dernier envoi par séance et par personne : limite de 10 minutes, tenue en base).
- API (connexion requise) : `GET /api/notifications/cle` → `{ clePublique }` ; `POST /api/notifications/abonnements` `{ endpoint, keys: { p256dh, auth }, appareil? }` (crée ou met à jour ; un `endpoint` qui change de compte passe à la personne connectée ; 20 appareils au plus par personne) → 204 ; `DELETE /api/notifications/abonnements` `{ endpoint }` → 204 ; `POST /api/notifications/essai` `{ endpoint? }` → `{ envoyes, echecs }` (10 par minute). En production, l'`endpoint` doit être en https, sans identifiants, et pointer vers un service de notifications des navigateurs (`fcm.googleapis.com`, `android.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`) : l'inscription étant libre, une adresse quelconque ferait du serveur un relais de requêtes ; en http (développement, essais) il est libre. Envois sans redirection, délai de 8 s.
- Déclencheur : `Salles.rejoindre` appelle `app.notifications.prevenirEntree` quand une personne entre (pas pour un deuxième onglet de la même personne). Sont prévenus l'hôte et les invités qui ne sont pas dans la salle, ont au moins un appareil abonné, et n'ont pas été prévenus pour cette séance depuis 10 minutes ; rien pour une séance terminée. L'envoi est détaché de la salle (délai de 8 s, erreurs journalisées, rien ne la bloque). 404 / 410 supprime l'abonnement.
- Charge chiffrée (`ChargeNotification`) : `titre` (« Camille est dans la salle »), `corps` (« <film> — rejoins la séance quand tu veux. »), `url` (`/seances/<id>`), `etiquette`. Rien d'autre.
- Client : `client/src/lib/notifications/` (`appareil.ts` pur et testé, `push.ts`, `NotificationsAppareil.svelte` dans la page Compte : `data-test` `notifications-appareil`, `notifications-etat`, `notifications-essai`). La permission n'est demandée qu'au clic sur l'interrupteur. `client/src/service-worker.ts` gère `push` (icône de Canapé, `tag` par séance) et `notificationclick` (met au premier plan l'onglet déjà sur la page ; sinon reprend un onglet Canapé qui n'est pas dans une salle ; sinon ouvre une fenêtre).
- Déploiement : rien à changer dans nginx (les CSP et en-têtes viennent de Node ; l'abonnement et les envois n'utilisent que `/api/notifications/*` et des appels sortants du serveur vers les services des navigateurs). Le serveur doit pouvoir sortir en HTTPS.

## WebSocket d'une séance (`partage/src/ws.ts`)

Authentifié par le cookie ; `Origin` contrôlé ; 8 connexions au plus par séance ; messages JSON ≤ 64 Ko ; limite de
débit (réactions et messages : 5/s par connexion). Chaque connexion a un `cid` (un même compte peut avoir deux
onglets). Champ de type : `t`.

Client → serveur :
`ping {c}` · `lecture {position}` · `pause {position, fin?}` · `aller {position}` · `film {filmId}` ·
`audio {piste}` · `sous_titres {cle|null}` · `compte_a_rebours {}` (lecture lancée pour tous 3 s plus tard) ·
`tampon {enCours}` · `media {micro, camera}` · `reaction {emoji}` (liste fermée : 😂 ❤️ 😱 😭 🔥 👏 😮 🍿) ·
`message {texte}` (≤ 500 caractères) · `progression {position}` (toutes les 10 s) · `signal {a, donnees}`.

Serveur → client :
`bienvenue {moi:{cid, utilisateur}, serveur, participants, etat, messages}` · `etat {etat, raison, par}` ·
`arrivee {participant}` · `depart {cid}` · `media {cid, micro, camera}` · `reaction {cid, emoji}` ·
`message {message}` · `souvenir {souvenir, fin}` (une note a changé, ou `fin: true` : l'hôte a terminé la séance → écran de fin) · `signal {de, donnees}` · `pong {c, s}` · `erreur {code, message}`.

`etat` = `{ filmId, lecture, position, instant, version, attente: string[], pisteAudio, sousTitres,
compteARebours: number|null, serveur }` : mêmes règles qu'en 0.1 (position à l'instant serveur `instant`,
rattrapage par saut au-delà de 1 s et par vitesse 0,95/1,05 entre 0,3 et 1 s, attente mutuelle, aucun écho
d'événement). Changer de piste audio ou de film remet tout le monde en pause à la même position.

## Moteur Transmission (phase 16)

Les trackers privés (ex. C411) n'acceptent que des logiciels connus ; WebTorrent n'en fait pas partie, Transmission
si. Canapé **pilote donc Transmission** (`transmission-daemon`, sur le même serveur, RPC en local) pour **tous** les
torrents ; WebTorrent (processus enfant) ne sert plus qu'en secours, quand Transmission n'est pas joignable
(développement, essais). Canapé ne se fait jamais passer pour un autre logiciel.

- **Réglages** : `CANAPE_TORRENT_MOTEUR` = `auto` (défaut : Transmission s'il répond, sinon WebTorrent) | `transmission`
  | `webtorrent` ; `CANAPE_TRANSMISSION_URL` (défaut `http://127.0.0.1:9091/transmission/rpc`),
  `CANAPE_TRANSMISSION_UTILISATEUR`, `CANAPE_TRANSMISSION_MOT_DE_PASSE` ; `CANAPE_TORRENT_PARTAGE` (publics, défaut
  `0` : arrêt à la fin) ; `CANAPE_TORRENT_PARTAGE_PRIVES` (défaut `toujours` : partagés jusqu'à ce que l'utilisateur
  les retire ; ou un ratio). Les autres `CANAPE_TORRENT_*` restent (débits, simultanés, port : appliqués à
  Transmission par RPC `session-set`).
- **Dialogue** : RPC JSON de Transmission (`X-Transmission-Session-Id` renouvelé sur 409, authentification de base) :
  `torrent-add` (`metainfo` en base64 pour un `.torrent`, `filename` pour un magnet, `download-dir`
  `CANAPE_TELECHARGEMENTS/<id>`, `paused` selon la file), `torrent-get` toutes les secondes (état, progression,
  débits, pairs, `eta`, fichiers, `isPrivate`, `uploadRatio`, `error`/`errorString`, `trackerStats.lastAnnounceResult`),
  `torrent-set` (`files-wanted`/`files-unwanted`, `seedRatioLimit`/`seedRatioMode`), `torrent-start`/`torrent-stop`,
  `torrent-remove` (`delete-local-data`). La correspondance id Canapé ↔ `hashString` est en base (`info_hash`).
- **Fin** : `import` → le film est un **lien physique** (`link`) du fichier téléchargé vers
  `CANAPE_FILMS/<id>/original.<ext>` (même système de fichiers : aucune place en plus), copie en repli ; sous-titres
  comme avant ; puis `termine` avec `enPartage` tant que Transmission partage. Privé : partage selon
  `CANAPE_TORRENT_PARTAGE_PRIVES` ; public : selon `CANAPE_TORRENT_PARTAGE`. `DELETE` d'une ligne `termine` en partage :
  `torrent-remove` avec effacement (le film reste grâce au lien), ligne retirée.
- **Messages** : `messageTracker` donne la dernière réponse d'un tracker qui refuse ou échoue (« Le tracker a refusé :
  … ») ; le délai de 15 min sans informations reste, avec ce message dans l'erreur.
- **Serveur** : l'installateur installe `transmission-daemon` (apt), le configure (`settings.json` : RPC sur
  127.0.0.1 seulement, identifiant et mot de passe générés et écrits dans `canape.conf`, `umask` 2,
  `download-dir` `/srv/canape/telechargements`, port des pairs, sans limite de ratio globale) et met l'utilisateur
  `debian-transmission` dans le groupe `canape` (dossiers `2770` groupe `canape`), sans toucher à nginx ; `mettre-a-jour`
  ne touche pas à Transmission (il garde seulement `telechargements` en `2770` et rouvre au groupe ce qui ne l'est pas).
- **Droits des dossiers (1.4.1)** : le service tourne avec `UMask=0027` et `RestrictSUIDSGID=true`, qui refuse tout
  `chmod` posant le bit setgid (la 1.4.0 laissait ainsi chaque dossier en `2750`, fermé en écriture à Transmission :
  « Permission denied »). Canapé crée donc le dossier d'un téléchargement sous un umask `007` (`dossiers.ts`) : il naît
  en `0770` et hérite du bit setgid de `telechargements` (posé en `2770` par l'installateur, en root), sans chmod. Un
  dossier qui existe déjà est rouvert au groupe (dossiers `770`, fichiers `660`) ; le processus WebTorrent écrit sous
  un umask `007` pour que Transmission puisse reprendre ses fichiers.

## Inscription libre (phase 15)

N'importe qui peut venir sur le site, **créer son compte** et ajouter des films, sans invitation. Module **comptes**
(et médiathèque pour les droits). Types : `partage/src/comptes.ts` (`EtatInscription`, `CorpsInscription`,
`OrigineCompte`, `Reglages`, `Utilisateur.peutTorrent`/`origine`, `EtatApi.inscriptionOuverte`) ; migration
`011_inscription.sql` (`peut_torrent`, `origine`).

- **Réglages de l'admin** (`GET|PATCH /api/admin/reglages`, page Réglages) : `inscriptionsOuvertes` (défaut `true`),
  `quotaInscriptionOctets` (défaut 20 Go), `torrentsInscrits` (défaut **`false`** : un inconnu ne fait pas télécharger
  de torrents au VPS sans l'accord de l'admin), `maxComptesInscrits` (défaut 100).
- **Compte né d'une inscription** : `viewer`, `origine='inscription'`, `peut_televerser=1`, quota
  `quotaInscriptionOctets`, `peut_torrent` = `torrentsInscrits`. L'admin change chaque compte comme les autres
  (`PATCH /api/admin/utilisateurs/:id` accepte aussi `peutTorrent`) ; la liste des comptes montre l'origine. Un compte
  invité ou le premier admin a `peut_torrent=1`.
- **Routes** (libres, contrôle d'`Origin`) :
  - `GET /api/inscription` → `EtatInscription` (le `jeton` est signé avec le secret du serveur et horodaté) ;
  - `POST /api/inscription` `CorpsInscription` → 201 + cookie + `Utilisateur` ; 403 fermées ou complètes ; 400 jeton
    absent, invalide, trop récent (< 3 s : robot) ou trop vieux (> 2 h), champ piège rempli, règles non acceptées,
    identifiant (3 à 32 caractères : lettres, chiffres, `.`, `_`, `-`, ou une adresse e-mail), prénom (1 à 40),
    mot de passe (≥ `MOT_DE_PASSE_MIN_INSCRIPTION`, pas égal à l'identifiant) ; 409 identifiant déjà pris ;
    429 au-delà de 3 inscriptions par heure et par IP (et 30 par jour en tout).
  - `GET /api/etat` donne `inscriptionOuverte`.
- **Vie privée entre inconnus** : `GET /api/utilisateurs` ne liste plus tout le monde : l'admin voit tous les comptes
  actifs ; un viewer voit seulement les comptes « connus » (ceux avec qui il partage un film dans un sens ou dans
  l'autre, ceux de ses séances, celui qui l'a invité, les admins). `GET /api/utilisateurs?identifiant=<x>` cherche un
  compte par son identifiant exact (insensible à la casse) pour partager un film ou inviter à une séance : `[un]` ou
  `[]`, 30 recherches par minute. La visibilité `tous` d'un film s'appelle dans l'interface « Tous les inscrits » et
  avertit qu'avec les inscriptions ouvertes, ce sont des inconnus.
- **Torrents** : `ListeTelechargements.peutAjouter` exige aussi `peut_torrent` ; sinon `POST /api/torrents` → 403
  « L'ajout par torrent n'est pas ouvert pour ton compte. ».
- **Interface** : page `/inscription` (prénom, identifiant, mot de passe et confirmation, couleur, case « J'accepte les
  règles d'usage » avec lien vers `/regles`, champ piège invisible `site`), lien « Créer un compte » sur `/connexion`
  quand c'est ouvert ; page `/regles` (règles d'usage : pas de contenu dont on n'a pas les droits, rien d'illégal,
  l'admin peut retirer un film ou fermer un compte, les films sont privés par défaut) ; Réglages et Comptes de
  l'administration avec les nouveaux champs ; partage d'un film et invitation à une séance par identifiant (« Ajouter
  quelqu'un : son identifiant »), plus la liste des comptes connus.

*Réalisé (interface)* : pages `/inscription` (attend 3,2 s avant l'envoi pour le garde-fou anti-robot, erreurs près des
champs, 409/403/429 traduits) et `/regles`, composant `ChercherCompte` (partage d'un film, invitation à une séance),
réglages et origine des comptes dans l'administration ; essais `e2e/inscription.spec.ts` (Chromium et Firefox) et captures
à la demande (`CANAPE_CAPTURES_INSCRIPTION=<dossier>`, clair/sombre, ordinateur/téléphone).

*Réalisé (phase 16, serveur)* : `serveur/src/modules/mediatheque/torrents/` : `moteur-transmission.ts` (même vocabulaire de
messages que le moteur WebTorrent : le service garde une seule logique), `transmission-rpc.ts`, `securite.ts` +
`bencode.ts`, migration `051_transmission.sql` (`moteur`, `prive`, `en_partage`, `ratio`, `message_tracker`).
`GET /api/torrents` donne le moteur de chaque ligne (pas de changement de `/api/etat`). Précisions :
- Le torrent est ajouté **en pause** (`.torrent`) puis démarré après le choix des fichiers ; un lien magnet démarre
  tout de suite, et dès ses métadonnées tous les fichiers sont décochés tant que le choix n'est pas fait (rien d'inutile
  n'est téléchargé). Pause = `torrent-stop` (le torrent reste dans Transmission), reprise = `torrent-start`.
- `messageTracker` sert aussi à expliquer l'attente quand Transmission ne répond pas (« Transmission est injoignable… »),
  tant que la ligne est active ; « Le tracker n'a pas répondu : … » pour une panne réseau, « Le tracker a refusé : … » sinon.
- Les trackers d'un torrent ou d'un magnet sont aussi vérifiés par DNS (un nom qui mène à une adresse interne est retiré) ;
  les noms sans point et `.local`/`.internal`/`.lan` sont refusés.
- Un torrent déjà présent dans Transmission dans un autre dossier (ajouté hors Canapé) n'est jamais repris : `erreur`.
- Au démarrage, les partages (`termine` + `en_partage`) sont redonnés à Transmission ; un torrent disparu de Transmission
  (retiré à la main) met fin au partage, le film reste. Une ligne WebTorrent non finie passe à Transmission dès qu'il
  répond (`auto` ou `transmission`). `CANAPE_TORRENT_MOTEUR=transmission` est écrit par l'installateur : sans Transmission,
  les téléchargements attendent au lieu de passer à WebTorrent (qui ne sait pas faire les trackers privés).
- Installation : `deploiement/installer-transmission.sh` (essais : `deploiement/essais/essai-transmission.sh`) ; tests :
  `serveur/tests/torrents/{transmission,securite}.test.ts` (faux RPC) et `transmission-reel.test.ts` (vrai Transmission,
  `CANAPE_ESSAI_TRANSMISSION=<binaire>`).

## Torrents (1.1)

Ajouter un film par un lien magnet ou un fichier `.torrent`, et suivre son téléchargement. Partie du module
**médiathèque** (il possède les films, les envois et les quotas). Types : `partage/src/torrents.ts` ; table
`telechargements` (`serveur/migrations/050_torrents.sql`).

- **Moteur** : WebTorrent (`webtorrent` 3, MIT), dans un **processus enfant** de Canapé (`child_process.fork`) qui parle
  au serveur par messages : un plantage ou une charge du moteur ne touche ni la synchro des séances ni l'API. Le
  serveur relance l'enfant s'il meurt et reprend les téléchargements en cours (les morceaux déjà reçus sont revérifiés,
  pas retéléchargés).
- **Droits** : admin, et viewers qui ont le droit de téléverser ; un téléchargement compte dans le quota dès que la
  taille des fichiers choisis est connue (avec les envois en cours) : dépassement → `erreur` « Ton espace est plein ».
  Chacun voit les siens, l'admin tous ; ceux des autres répondent 404.
- **Choix des fichiers** : dès les informations reçues, la plus grosse vidéo et les sous-titres `.srt`/`.vtt` de son
  dossier sont choisis ; le propriétaire peut changer le choix pendant le téléchargement (chaque vidéo choisie devient
  un film). Un torrent sans vidéo → `erreur` « Ce torrent ne contient pas de vidéo ».
- **Fin** : `import` → chaque vidéo passe par `creerFilm` (déplacée dans `CANAPE_FILMS/<id>/original.<ext>`, analyse,
  images, TMDB) et ses sous-titres par `ajouterSousTitre` → `termine` avec `filmIds`. Puis le torrent **cesse d'être
  partagé** (sauf `CANAPE_TORRENT_PARTAGE` > 0 : partagé jusqu'à ce ratio) et ses fichiers restants sont effacés.
- **Ménagement des autres sites** : au plus `CANAPE_TORRENT_SIMULTANES` téléchargements actifs (les autres attendent en
  `telechargement` avec 0 pair), débits plafonnés, enfant lancé en `nice` `CANAPE_TRANSCODAGE_PRIORITE`.

| Variable | Défaut | Rôle |
|---|---|---|
| `CANAPE_TORRENTS` | `1` | `0` désactive les torrents (`peutAjouter=false`, routes d'ajout en 403) |
| `CANAPE_TELECHARGEMENTS` | à côté de `CANAPE_TELEVERSEMENTS` (`<parent>/telechargements`) | données en cours (`<id>/…`) et `.torrent` gardés (`.torrents/`) ; VPS : `/srv/canape/telechargements` |
| `CANAPE_TORRENT_SIMULTANES` | `2` | téléchargements actifs en même temps |
| `CANAPE_TORRENT_DEBIT_MAX` | `0` | octets/s reçus au plus (`0` = sans limite ; `20M` accepté) |
| `CANAPE_TORRENT_ENVOI_MAX` | `1M` | octets/s envoyés au plus |
| `CANAPE_TORRENT_PARTAGE` | `0` | ratio de partage après la fin (`0` = s'arrête dès la fin) |
| `CANAPE_TORRENT_PORT` | `0` | port d'écoute des pairs (`0` = au hasard ; ouvrir un port fixe dans le pare-feu aide) |

Routes (session obligatoire, contrôle d'`Origin` comme le reste de l'API) :
- `GET /api/torrents` → `ListeTelechargements`
- `POST /api/torrents` : JSON `{ magnet }` ou multipart avec un fichier `.torrent` (≤ `TAILLE_MAX_FICHIER_TORRENT`)
  → 201 `Telechargement` ; 400 lien ou fichier illisible ; 403 sans droit ou torrents désactivés ; 409 même torrent
  déjà en cours (`infoHash`) ; limite 10 ajouts par minute.
- `PATCH /api/torrents/:id` `CorpsModifTorrent` → `Telechargement` (fichiers : au moins une vidéo ; refusé une fois
  `import`/`termine`/`annule`)
- `DELETE /api/torrents/:id` → 204 : sur un téléchargement actif, il passe en `annule` et ses données partielles sont
  effacées (les films déjà créés restent) ; une ligne `termine`, `erreur` ou `annule` est retirée de la liste ; 409
  pendant `import`.

*Réalisé (1.1)* : `POST` multipart prend le `.torrent` dans le champ `fichier` (ou un champ `magnet`) ; les liens magnet
sont reconstruits sans `xs`/`as`/`ws` et le client tourne sans sources web (le serveur ne va jamais chercher une adresse
donnée par un utilisateur) ; `PATCH` répond 409 avant la réception des informations ou une fois fini, 400 sans vidéo,
**507** si le nouveau choix dépasse le quota ; sans information reçue au bout de 15 min → `erreur` ; 2 000 fichiers au
plus par torrent ; avec `CANAPE_TORRENT_PARTAGE` > 0 l'import copie et le partage dure au plus 24 h. Réglages internes
aux essais : `CANAPE_TORRENT_ISOLE`, `CANAPE_TORRENT_PAIRS`.

Interface (galerie) : « Ajouter un film » propose « Depuis mon ordinateur » ou « Par torrent » (coller un lien
magnet, ou déposer un `.torrent`) ; un panneau « Téléchargements » suit chaque torrent (nom, barre de progression,
reçu / total, débit, temps restant, pairs, état en clair), avec pause, reprise, annulation et « Choisir les fichiers » ;
rafraîchi toutes les `INTERVALLE_SUIVI_TORRENTS` ms tant qu'un téléchargement est actif ; à la fin, un toast « <titre>
est dans ta galerie » et la carte du film apparaît (en analyse puis prête).

## Lecture universelle

1. **Direct** si le conteneur (MP4, M4V, MOV, WebM), la vidéo (H.264 8 bits SDR, VP9, AV1) et la piste audio
   choisie (AAC, MP3, Opus, Vorbis ; et c'est la première piste) passent partout.
2. **Son seul converti** si la vidéo est H.264 8 bits SDR mais que le conteneur ou le son ne passent pas : HLS
   avec `-c:v copy` et le son en AAC stéréo, découpé sur les images clés (index des images clés calculé une fois et
   mis en cache). *Réalisé (1.0)* : une seule passe séquentielle depuis le début, jamais relancée au milieu (la
   copie relancée par `-ss` retombe sur une image clé plus ancienne) ; limité au H.264 ≤ 2048×1088.
3. **Vidéo convertie à la volée** sinon (HEVC, 10 bits, HDR, 4K, MPEG-4…) : HLS fMP4, segments de 6 s, H.264
   ≤ 1080p `yuv420p`, réduction de dynamique HDR → SDR (`zscale` + `tonemap`, taille réduite **avant**), son AAC
   stéréo. La liste de lecture complète est connue d'avance (durée) ; un segment demandé et absent (re)lance
   ffmpeg à sa position ; une seule conversion par film et piste audio, partagée par tous les spectateurs ;
   ffmpeg tourne en `nice` `CANAPE_TRANSCODAGE_PRIORITE`, s'arrête quand plus personne ne lit depuis 60 s, et
   choisit son préréglage x264 d'après la vitesse mesurée pour rester au-dessus du temps réel.
   *Réalisé (1.0)* : relance seulement si le segment demandé est avant la position de ffmpeg ou plus de 4 segments
   devant ; chaque lancement écrit à part et chaque segment terminé est recalé sur le temps du film (`tfdt`) avant
   publication, avec un `init.mp4` unique sans `edts` ; pas d'images B, paramètres x264 fixés (préréglages
   `superfast` à `faster`, repli automatique sous 1,15× le temps réel, 4K HDR toujours en `superfast`) ;
   `tonemap=mobius` ; un segment absent est attendu au plus 50 s (puis 503). Dolby Vision profil 5 : couleurs
   approximatives sans carte graphique, signalé dans `raison`.
4. **Préparation** : conversion complète en MP4 lisible partout (mêmes réglages, `crf` 20, `+faststart`), à basse
   priorité, une à la fois ; automatique pour les films qui ne peuvent pas être lus directement si
   `CANAPE_PREPARATION_AUTO=1`, quand aucune conversion à la volée ne tourne. Dès qu'une version préparée existe,
   la lecture passe en direct dessus. *Réalisé (1.0)* : préréglage `fast`, `nice 19`, préparations automatiques
   seulement quand la charge est sous 0,8 par cœur, suspendues pendant toute conversion à la volée ; fichiers dans
   `CANAPE_FILMS/<id>/preparations/<audio>.mp4`. Les adresses `/media/*` répondent 404 sans session.
5. Sous-titres texte intégrés extraits en WebVTT à la demande (cache) ; pistes image (PGS, VobSub) signalées comme
   non lisibles. Libellés : langue, « forcés », « SDH ».

## Interface

Français, sombre, ambiance salle de cinéma le soir, direction précise dans `docs/DESIGN.md` (recherche produit et
design). Écrans : accueil « Ce soir » (séances à venir, reprendre, ajouts récents, bouton « Lancer une séance »),
galerie (grille d'affiches, filtres miens / partagés / tous, recherche, téléversement par glisser-déposer avec
progression, pause, reprise), fiche d'un film (détails, pistes, partage, sous-titres, préparation), séances (liste,
création, invitation par lien), **salle** (film plein cadre, vignettes des caméras déplaçables, commandes partagées,
choix langue et sous-titres, chat repliable, réactions qui flottent, compte à rebours, indicateur de synchro, plein
écran du conteneur), historique, compte, administration (comptes et invitations, espace disque, conversions,
réglages). Installable (PWA) : manifeste, icônes, service worker qui ne met en cache que l'enveloppe de l'application
(jamais les médias ni l'API).

*Réalisé (phase 18, accueil plus pratique)* : l'accueil va droit au but, dans cet ordre : la séance en cours (« Rejoindre ») ou
la prochaine (« Entrer dans la salle », « Copier le lien »), sinon le **lancement rapide** (`LancementRapide.svelte` : on touche
un film puis « Lancer », ce qui appelle `POST /api/seances` sans date puis `POST /api/seances/:id/lien` et montre le lien ; « Plus
d'options » mène à la page Nouvelle séance) ; « Reprendre » (lignes avec barre de progression, un seul geste) ; les
téléchargements en cours (`Telechargements.svelte`, même suivi que la galerie, rien s'il n'y en a pas) ; le lancement rapide
« autre séance » ; les ajouts récents ; « Pour bien démarrer » en bas (il reste la première chose d'un compte neuf). Sur
téléphone, la carte de séance tient dans le premier écran (affiche de 84 px à côté du titre, boutons sous le pouce). Logique pure
dans `client/src/lib/interface/accueil.ts`. Aucune modification du serveur.

## Livraison

- Paquet : `scripts/paquet.sh` → `dist/canape-<version>.tar.gz` (serveur/src, serveur/migrations, partage/src,
  client/build, node_modules de production, bin/canape, deploiement/, package.json) + `SHA256SUMS`.
- VPS : `/opt/canape/versions/<version>-<commit>/`, lien `/opt/canape/actuelle`, Node copié dans
  `/opt/canape/node` ; données dans `/srv/canape/{donnees,films,cache,televersements}` ; service
  `ExecStart=/opt/canape/node/bin/node /opt/canape/actuelle/serveur/src/index.ts serve`.
- `deploiement/installer-serveur.sh` (installation et mise à niveau depuis la 0.1, mêmes protections nginx que la
  0.1) ; `deploiement/mettre-a-jour` (installe un paquet : sauvegarde de la base, bascule du lien, redémarrage,
  vérification de `/api/etat`, retour arrière automatique en cas d'échec, garde 3 versions) ;
  `deploiement/recevoir` (commande forcée de la clé SSH de déploiement : lit le paquet sur l'entrée standard,
  vérifie son SHA-256, lance `sudo -n mettre-a-jour`).
- GitHub Actions : `ci.yml` (push `develop`, PR : types, tests, construction, Playwright) ; `deploiement.yml` (push
  `main` : CI, paquet, envoi par SSH avec une clé verrouillée, release GitHub du tag avec le paquet et SHA256SUMS).
- nginx : `/api/televersement` (`client_max_body_size` 64m, pas de tampon), `/media/` (pas de tampon),
  `/ws/` (Upgrade, délai long).

## Règles communes aux sous-agents

- Travailler dans son arbre git et sa branche (`feature/v1-<module>`), ne toucher que ses fichiers.
- Commits en français au format conventionnel, signés seulement de l'identité git configurée, **jamais** de
  `Co-Authored-By` ni d'autre attribution ; ne rien pousser, ne pas terminer la branche.
- Node 26 : `export PATH=$HOME/.local/opt/node-v26.4.0-linux-x64/bin:$PATH` avant toute commande `node`/`npm`.
- Poste : 14 Go de RAM, souvent 3 à 4 Go libres, d'autres sessions y travaillent. Tout travail lourd (`npm ci`,
  construction, suites de tests, ffmpeg, navigateurs) passe par la file Gagarine :
  `gagarine file "<nom>" <Go> <cœurs> -- <commande>` ; un hook refuse les travaux lourds hors file et donne la
  commande corrigée : la relancer telle quelle. Disque : 22 Go libres, pas de copies inutiles.
- Textes visibles en français ; aucune ressource externe chargée par le navigateur (polices et icônes servies par
  l'application).
