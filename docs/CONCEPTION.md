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
- Pas d'inscription publique : l'admin invite par lien (valable 7 jours, usage unique).
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
- `GET /api/seances/:id/messages?avant=<id>`
- `GET /api/reprendre` (films commencés, non terminés) ; `GET /api/historique`
- `GET /api/ice` → `{ iceServers }` (identifiants TURN temporaires)
- `GET /ws/seances/:id` : WebSocket de la séance (ci-dessous)

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
`message {message}` · `signal {de, donnees}` · `pong {c, s}` · `erreur {code, message}`.

`etat` = `{ filmId, lecture, position, instant, version, attente: string[], pisteAudio, sousTitres,
compteARebours: number|null, serveur }` : mêmes règles qu'en 0.1 (position à l'instant serveur `instant`,
rattrapage par saut au-delà de 1 s et par vitesse 0,95/1,05 entre 0,3 et 1 s, attente mutuelle, aucun écho
d'événement). Changer de piste audio ou de film remet tout le monde en pause à la même position.

## Lecture universelle

1. **Direct** si le conteneur (MP4, M4V, MOV, WebM), la vidéo (H.264 8 bits SDR, VP9, AV1) et la piste audio
   choisie (AAC, MP3, Opus, Vorbis ; et c'est la première piste) passent partout.
2. **Son seul converti** si la vidéo est H.264 8 bits SDR mais que le conteneur ou le son ne passent pas : HLS
   avec `-c:v copy` et le son en AAC stéréo, découpé sur les images clés (index des images clés calculé une fois et
   mis en cache).
3. **Vidéo convertie à la volée** sinon (HEVC, 10 bits, HDR, 4K, MPEG-4…) : HLS fMP4, segments de 6 s, H.264
   ≤ 1080p `yuv420p`, réduction de dynamique HDR → SDR (`zscale` + `tonemap`, taille réduite **avant**), son AAC
   stéréo. La liste de lecture complète est connue d'avance (durée) ; un segment demandé et absent (re)lance
   ffmpeg à sa position ; une seule conversion par film et piste audio, partagée par tous les spectateurs ;
   ffmpeg tourne en `nice` `CANAPE_TRANSCODAGE_PRIORITE`, s'arrête quand plus personne ne lit depuis 60 s, et
   choisit son préréglage x264 d'après la vitesse mesurée pour rester au-dessus du temps réel.
4. **Préparation** : conversion complète en MP4 lisible partout (mêmes réglages, `crf` 20, `+faststart`), à basse
   priorité, une à la fois ; automatique pour les films qui ne peuvent pas être lus directement si
   `CANAPE_PREPARATION_AUTO=1`, quand aucune conversion à la volée ne tourne. Dès qu'une version préparée existe,
   la lecture passe en direct dessus.
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
