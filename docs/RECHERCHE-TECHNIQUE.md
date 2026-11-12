# Recherche technique — Canapé 1.0

Document de recherche écrit pour les agents de modules. Légende : **[essai]** = essayé sur ce poste (ffmpeg 6.1.1
Ubuntu, 14 cœurs, poste chargé par d'autres travaux : les vitesses sont donc plutôt pessimistes) ; **[doc]** = tiré de
la documentation ou du code source, non rejoué ici ; **[mémoire]** = connaissance de l'écosystème non revérifiée.
Les fichiers d'essai sont hors dépôt : `/tmp/claude-1000/-home-charles-gamligo-Desktop/73726be1-2ee3-41e9-b1b0-d21772565add/scratchpad/recherche/`.

> Les extraits `films-essai/extrait1.mkv` et `extrait2.mkv` n'existaient plus : je les ai refaits par `-c copy` (60 s)
> depuis `~/Downloads` (lecture seule). `extrait1` : HEVC Main10 1080p 24 i/s bt709, 2 × E-AC3 5.1, 3 SRT.
> `extrait2` : HEVC Main10 **2160p 23,976 i/s HDR10+ (PQ, bt2020)**, E-AC3 5.1, PGS + SRT. **Il ne contient pas de
> Dolby Vision** (métadonnées HDR10+ SMPTE 2094-40 seulement) : la partie Dolby Vision ci-dessous est de la doc.

## À lire par chaque module (synthèse)

**Comptes** (sections 5, 6)
- Argon2id `@node-rs/argon2` : `m=47104, t=2, p=1` (OWASP : minimum 19 MiB/2/1, mesuré 34 ms), format PHC, `algorithm: 2` écrit ; réhachage à la connexion si les paramètres du hachage sont plus faibles ; `verify` sur un hachage factice si l'identifiant est inconnu.
- Jeton de session : 32 octets `base64url`, SHA-256 en base ; **`vu_le`/`expire_le` mis à jour au plus toutes les 5 min** (pas une écriture par segment).
- `node:sqlite` : importer **une seule fois** (`DatabaseSync` en 26.4, `Database` dans les versions récentes) ; `BEGIN IMMEDIATE` pour écrire ; `foreign_keys` déjà actif.
- Contrôle d'`Origin` des requêtes qui modifient ; si `Origin` absent exiger `Sec-Fetch-Site: same-origin`. Limite de débit de connexion par IP **et** identifiant.
- Désactiver un compte : supprimer ses sessions **et** fermer ses WebSocket.

**Médiathèque** (section 3)
- `@tus/server` se branche par `addContentTypeParser('application/offset+octet-stream', … done(null))` + `reply.hijack(); tus.handle(req.raw, reply.raw)` ; refus par hooks qui lèvent `{status_code, body}` (essayé : 401/413/507).
- Quota : refuser dès `onUploadCreate` sur la **taille déclarée** (et `Upload-Defer-Length`) ; propriétaire pris de la session, jamais des métadonnées.
- `onUploadFinish` doit être rapide (`rename`, lancer l'analyse en tâche de fond) ; nettoyage horaire par `cleanUpExpiredUploads()` + recoupement avec la table `televersements`.
- Client : morceaux 50 Mo, `retryDelays`, ne pas réessayer sur 401/403/413/507, reprise par `findPreviousUploads()`.
- nginx : `proxy_request_buffering off`, `client_max_body_size 64m`, `respectForwardedHeaders`.

**Lecture** (section 1, à lire en entier)
- Transcodage à la demande : liste VOD calculée, `-ss D -output_ts_offset D -start_number N -force_key_frames expr:gte(t,n_forced*6) -sc_threshold 0`, hls fMP4 ; relance de ffmpeg si segment **avant** la position courante ou **> 4 segments après** (règle de Jellyfin).
- **Copie vidéo : une seule passe séquentielle** (la relance par segment en HEVC est peu fiable, essayé) ; copie HEVC réservée à Safari.
- HDR → SDR : `zscale` réduit d'abord, puis `tonemap=mobius` (ou `hable`) ; **`bt2390` n'existe pas** dans `tonemap` ; DV profil 5 impossible sans libplacebo (GPU) ; pas de GPU.
- Vitesses (4 fils) : 1080p veryfast 73 i/s ; 4K HDR→SDR veryfast 27 i/s (≈ 1,1× le temps réel) : goulot = décodage HEVC 4K.
- hls.js : `lowLatencyMode: false`, `maxTimeToFirstByteMs` ≥ 45 s sur `fragLoadPolicy`, `backBufferLength: 30`, liste servie instantanément, segments attendus côté serveur.

**Séances** (sections 2, 3)
- Garder le protocole 0.1 (position à l'instant serveur, horloge à plus petit RTT, saut > 1 s, vitesse 0,95/1,05).
- Avec HLS : saut seulement si la cible est dans `video.buffered` ou écart > 4 s ; `aller`/changement de piste = **barrière** avec délai maximal 20 s ; reprise planifiée à `instant` serveur ; jamais de rattrapage pendant `seeking`/`readyState < 3`.
- `@fastify/websocket` : refuser **avant** la poignée de main dans `preValidation` (Origin 403, session 401, séance 404) ; `maxPayload: 65536` (1009 constaté) ; battement `ping` 25 s ; débit maison par connexion.

**Salle** (section 4)
- WebRTC : transceivers `sendrecv` créés d'avance + `replaceTrack` (pas de renégociation) ; présents offrent, nouvel arrivant répond ; garde-fou : paire en `new`/`checking` > 8 s → la recréer.
- Écho : l'AEC de Chrome n'annule pas le son d'un `<video>` (Firefox/Safari oui) ; casque recommandé + bandeau, ducking WebAudio du film, boucle locale WebRTC = piste à prototyper (latence 30–80 ms).
- Débit des caméras par `setParameters` selon le nombre de pairs (2–3 : 400 kb/s ; 4–5 : 150 ; 6–8 : 80) ; surveiller `qualityLimitationReason`.
- TURN : `use-auth-secret`, `username = "<expiration>:<id>"`, mot de passe HMAC-SHA1 base64, `denied-peer-ip` pour les réseaux internes.
- Le client doit fonctionner sans média local (WebKit headless n'a pas de caméra simulée).

**Interface** (sections 6, 7)
- Monopage : `ssr = false`, `adapter-static` + `fallback: 'index.html'` ; le serveur rend `index.html` pour toute URL sans extension hors `/api /media /ws`.
- Magasins runes : classes à instance unique dans `*.svelte.ts` (pas d'export d'un `$state` primitif réassigné) ; `$state.raw` pour les gros objets reçus par WebSocket ; jamais `bind:currentTime`.
- Service worker : intercepter seulement `build` + `files` ; **jamais** `/api`, `/media`, `/ws`, `Range`, navigations ; pas de `skipWaiting` pendant une séance.
- CSP : `media-src 'self' blob:`, `worker-src 'self' blob:` (hls.js), `connect-src 'self' wss://hôte`, hachage du script de démarrage via `kit.csp`.
- Manifeste : icônes 192/512 + maskable, `apple-touch-icon`, `display: standalone`.

**Livraison** (sections 6, 9)
- Clé SSH : `restrict,command="/opt/canape/bin/recevoir" ssh-ed25519 …` ; SHA-256 passé en argument de commande, paquet sur l'entrée standard ; `sudoers` limité à `mettre-a-jour`.
- Job de déploiement : `environment: production` limité à `main`, secrets rattachés à l'environnement, `concurrency` sans annulation, `permissions: contents: read`, actions épinglées par SHA.
- `known_hosts` en secret (pas de `ssh-keyscan` dans la CI) ; Node de la CI = Node du VPS (`26.4.0`).
- systemd : journal JSON sur stdout (`journalctl -u canape -o cat`), `redact` des cookies, ne pas journaliser les segments, arrêt propre sur SIGTERM.
- nginx : `/api/televersement` sans tampon, `/media/` sans tampon, `/ws/` avec `proxy_read_timeout` long (≥ 3600 s ou battement 25 s).
- Playwright en CI : `playwright install --with-deps`, cache `ms-playwright`, `workers: 1` ; fixtures WebM VP9/Opus (pas de H.264 dans le Chromium de Playwright, à valider).

---

## 1. Lecture universelle : HLS à la demande, HDR → SDR

### 1.1 Recommandation en bref

1. **Liste de lecture VOD connue d'avance, segments produits à la demande**, comme Jellyfin : la liste `index.m3u8`
   est calculée à partir de la durée (segments de 6 s, dernier segment plus court) sans lancer ffmpeg ; un segment
   demandé qui n'existe pas déclenche ffmpeg à cette position.
2. **Règle de relance de Jellyfin** **[doc : `DynamicHlsController.cs`]** : `segmentGapRequiringTranscodingChange =
   24 / longueurSegment` (4 pour 6 s). On relance ffmpeg si : le segment demandé est **avant** la position courante de
   la conversion, ou **plus de 4 segments au-delà** de celle-ci, ou si l'index courant est inconnu. Sinon on attend
   que le fichier apparaisse (sondage toutes les 100 ms). Si le fichier existe déjà (cache), on le sert sans
   rien relancer. Avant de relancer : attendre les requêtes en cours, tuer l'ancien ffmpeg. À reprendre tel quel.
3. **Un seul ffmpeg par (film, piste audio)**, qui produit en continu à partir de `start_number = k` ; il se met en
   pause (Jellyfin : « throttler ») quand il a dépassé de ~2 min la lecture, et se réveille à la requête suivante.
   Pause = `SIGSTOP`/`SIGCONT` sur le processus, ou simplement arrêt + relance (démarrage ≈ 1 à 3 s).
4. **Fichiers atomiques** : ffmpeg écrit `seg.m4s.tmp` puis renomme (`-hls_flags temp_file`) : le serveur ne sert un
   segment que lorsque le fichier définitif existe, et attend (sondage 100 ms, délai max ~30 s) sinon.
5. **GOP fixe aligné sur les segments** : `-force_key_frames "expr:gte(t,n_forced*6)"` + `-sc_threshold 0` ; ainsi
   chaque segment est autonome et **les segments produits par deux lancements différents sont identiques en vidéo**
   (essai ci-dessous : 144 paquets vidéo, pts identiques à l'image près). **Cela vaut pour le transcodage ; la copie vidéo se fait en une passe (1.3).**
6. **fMP4 (`-hls_segment_type fmp4`)** : un seul `init.mp4` par (film, audio) ; hls.js et Safari le lisent.
7. **Le préréglage x264 se choisit d'après la vitesse mesurée** (voir 1.6) ; **HDR→SDR : `zscale` + `tonemap=mobius`
   (ou `hable`), réduction de taille AVANT** ; ni libplacebo ni carte graphique (pas de GPU sur un VPS).

### 1.2 Segment k produit seul, raccord sans saut **[essai]**

Script : `recherche/seg.sh` (entrée `extrait1.mkv`, HEVC 10 bits → H.264 8 bits). Deux lancements indépendants :
segments 3 et 4 d'un coup (`A`), puis le segment 4 seul (`B`).

```sh
# segment(s) à partir du numéro N, début D = N × 6 (en secondes), durée T demandée
ffmpeg -hide_banner -loglevel error -y -ss $D -i film.mkv -map 0:v:0 -map 0:a:0 \
  -c:v libx264 -preset veryfast -crf 23 -vf format=yuv420p -g 144 -keyint_min 144 -sc_threshold 0 \
  -force_key_frames "expr:gte(t,n_forced*6)" -c:a aac -ac 2 -b:a 160k -t $T \
  -output_ts_offset $D -f hls -hls_time 6 -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
  -start_number $N -hls_list_size 0 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename "%d.m4s" out.m3u8
```

Résultats (concaténation `init.mp4` + segments, `ffprobe -show_entries packet=…`) :

| | vidéo | audio |
|---|---|---|
| `A-3` (18 s) | 144 images, pts 18,000 → 23,917 | 279 paquets, 17,978 → 23,909 (+0,021) |
| `A-4` (même lancement) | 144 images, pts 24,000 → 29,917 | 285 paquets, 23,930 → 29,989 |
| `B-4` (lancement seul) | **144 images, pts 24,000 → 29,917 (identique à A-4)** | 283 paquets, 23,978 → 29,994 |

- `init.mp4 + A-3 + B-4` se décode sans erreur (`ffmpeg -v error -i ch2.mp4 -f null -` muet) : **le raccord entre
  deux lancements différents est valable** côté vidéo.
- **Piège audio** : 6 s = 281,25 trames AAC (1024 échantillons à 48 kHz = 21,33 ms), donc un segment audio démarre à
  un multiple de 21,33 ms, pas à 6 s exactes. Entre `A-3` (fin 23,930) et `B-4` (début 23,978) il y a un **trou de
  48 ms** (2 trames), dans l'autre sens un recouvrement de quelques ms possible. Inaudible en pratique (Jellyfin fait
  pareil), mais si on veut zéro défaut : **segments de 6,4 s** (= exactement 300 trames AAC à 48 kHz) ; non essayé
  **[idée]**. Autre piste : le son d'un segment démarre toujours après une « amorce » AAC (priming) ; ne pas
  s'en inquiéter, hls.js et Safari comblent < 100 ms (`maxBufferHole` 0,1 s, voir 1.5).
- `-output_ts_offset $D` donne des horodatages absolus (le segment 4 vaut 24,000 s) : indispensable pour que le
  lecteur place le segment à l'endroit prévu par la liste. Équivalent Jellyfin : `-copyts -avoid_negative_ts disabled`
  **[doc]** (leur variante conserve les horodatages source ; plus fragile quand la source ne commence pas à 0).
- **Piège** : `-ss` placé **avant** `-i` est précis (décodage jusqu'à l'image exacte) pour un transcodage, donc le
  segment commence bien à D. `-noaccurate_seek` (utilisé par Jellyfin pour la copie vidéo) ne convient qu'à la copie.
- **Piège** `-t` : ffmpeg produit alors exactement `T` secondes ; en service réel ne pas mettre `-t` (production
  continue jusqu'à la fin ou jusqu'à l'arrêt par le serveur).
- Piège : avec `-hls_playlist_type vod` et `-hls_list_size 0`, la liste écrite par ffmpeg n'est utile à rien : on
  sert **sa propre** liste complète, jamais celle de ffmpeg. `#EXT-X-MEDIA-SEQUENCE` et `#EXT-X-PLAYLIST-TYPE:VOD`
  + `#EXT-X-ENDLIST` doivent être écrits par le serveur ; `#EXT-X-VERSION:7` (fMP4) ; `#EXT-X-INDEPENDENT-SEGMENTS`.
- Jellyfin ajoute `-hls_segment_options movflags=+frag_discont+skip_sidx` (fMP4 vidéo) **[doc]**, `-max_delay 5000000`,
  `-max_muxing_queue_size`≥128 ; non nécessaires dans mon essai.

### 1.3 Copie vidéo : une seule passe séquentielle, pas de relance par segment **[essai]**

Cas « 2 : seul le son est converti » (vidéo copiée). En copie on ne coupe qu'aux images clés : **les segments ont des
durées variables** et la liste doit les connaître avant que le lecteur les demande.

**Constat d'essai (important)** : sur `extrait1` (HEVC), la relance par segment en copie **ne marche pas de façon
fiable**. `ffmpeg -ss 13.3117 [-noaccurate_seek] -i … -c:v copy … -output_ts_offset …` est reparti de l'image clé
**6,6 s** (précédente) et non de 13,3 s, et avec `-copyts -t` la durée est comptée en absolu (segment de 1,4 s au lieu
de 7,9 s) ; la liste des images clés de `ffprobe -skip_frame nokey` (13,291) diffère aussi de 17 ms de la vraie
position des paquets (13,308) et certaines images « clés » HEVC sont des CRA (points d'accès à GOP ouvert) où le
saut tombe plus tôt. Un index d'images clés à la Jellyfin est donc **fragile en HEVC**.

**Recommandation** : en copie vidéo, **une seule passe séquentielle sur tout le film**, qui laisse ffmpeg choisir les
coupures (le son AAC est encodé en même temps, très peu coûteux) :

```sh
ffmpeg -y -i film.mkv -map 0:v:0 -map 0:a:N -c:v copy -tag:v hvc1 -c:a aac -ac 2 -b:a 160k \
  -f hls -hls_time 6 -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_list_size 0 \
  -hls_playlist_type vod -hls_flags independent_segments+temp_file -hls_segment_filename "s%d.m4s" o.m3u8
```
(`-tag:v hvc1` pour HEVC ; inutile en H.264.) Résultat **[essai]** sur `extrait1` : segments qui commencent tous sur une
image clé (`K`, pts 0,017 / 6,641 / 13,308), durées réelles 6,625 / 6,666 / 8,000 / 7,917 / 7,583 / 8,417 / 2,667 /
7,291 / 2,792 / 5,083 / 1,805 s (cible 6 s, images clés espacées), décodage sans erreur.
- Vitesse : copie + AAC = limitée par le disque, plusieurs dizaines de fois le temps réel (un film de 2 h : ~1 à 3 min) ;
  l'extrait de 60 s a pris moins d'une seconde.
- **La liste de lecture vient du `.m3u8` de ffmpeg** (durées exactes), pas d'un calcul : on la sert dès que ffmpeg a
  fini (quelques minutes) ; avant, ou pour démarrer plus vite, on peut servir la liste **partielle** en
  `#EXT-X-PLAYLIST-TYPE:EVENT` (sans `ENDLIST`) puis la liste VOD complète. Plus simple : **ne pas proposer ce mode
  tant que la passe n'est pas terminée** (attente affichée par le composant Préparation) ; la vidéo H.264 en copie se
  lit alors comme une version préparée (cas 4) obtenue en quelques minutes.
- Pour un film en **H.264** déjà lisible dans son MP4 mais avec un son non supporté : même commande, même résultat ; c'est
  un cas 2 sans HEVC et donc sans le problème de GOP ouvert ; Safari et Chrome lisent.
- **Garde-fous** : si la plus longue durée d'un segment dépasse 12 s ou si l'index est trop clairsemé (images clés
  espacées de > 10 s : mauvais pour le saut), **basculer en transcodage (cas 3)**. Ne pas copier de l'HEVC pour
  Chrome/Firefox : seul Safari lit l'HEVC en MSE ; la copie HEVC est donc **réservée à Safari**, sinon cas 3.
- Si vraiment une production à la demande par segment est voulue en copie : seul un **index de paquets** (`ffprobe
  -show_entries packet=pts_time,flags` flux vidéo, drapeau `K`, pts + dts) calcule des coupures exactes, et il faut
  vérifier chaque segment produit (première image = `K` à la position prévue) avec repli en transcodage.

### 1.4 HDR → SDR **[essai]**

Entrée `extrait2.mkv` (HDR10+, 2160p), image à t = 30 s, tout en **4 fils**, processeur seulement. Images dans
`recherche/hdr/` (regardées avec l'outil Read) :

- `a-naif.png` : `scale=1920:-2,format=yuv420p` **sans** réduction de dynamique : image **terne et sombre**, peau
  grisâtre, perte du contraste du HDR : inacceptable.
- `b-hable.png` : `tonemap=hable:desat=0` : **lumineux, chaud, saturé** ; visage très éclairé, un peu orangé : le plus
  « spectaculaire », ombres bien conservées.
- `c-mobius.png` : `tonemap=mobius:param=0.3:desat=0` : **plus naturel**, hautes lumières mieux tenues, noirs plus
  profonds que hable. **Ma recommandation par défaut** pour un film (hable pour les scènes sombres si on veut plus de
  pêche).
- `d-reinhard.png` : `reinhard:param=0.5` : comparable (moins contrasté).
- `bt2390` : **n'existe pas dans le filtre `tonemap`** de ffmpeg 6.1 (`Undefined constant 'bt2390'`) ; il n'existe que
  dans `libplacebo` (voir plus bas). Ne pas écrire `tonemap=bt2390`.

Chaîne retenue (réduction de taille **avant** le calcul en virgule flottante, c'est ce qui rend la 4K praticable) :

```
zscale=w=1920:h=-2:f=bilinear,                    # réduction AVANT (3840→1920 : 4× moins de pixels à tonemapper)
zscale=t=linear:npl=100,format=gbrpf32le,         # PQ → lumière linéaire, 100 nits de référence SDR
zscale=p=bt709,                                    # primaires bt2020 → bt709
tonemap=mobius:param=0.3:desat=0,                  # (ou hable)
zscale=t=bt709:m=bt709:r=tv,format=yuv420p         # retour bt709 limité 8 bits
```
et pour l'encodeur `-colorspace bt709 -color_primaries bt709 -color_trc bt709` (balises dans le flux H.264 ; sinon
certains navigateurs se trompent de matrice). Le filtre `zscale` est présent dans le ffmpeg d'Ubuntu 24.04 (6.1.1,
`--enable-libzimg`) **[essai : `ffmpeg -filters`]** ; vérifier au démarrage du serveur (`ffmpeg -filters | grep zscale`)
et **désactiver la lecture HDR** avec message explicite si absent.

- **HLG** (`arib-std-b67`) : même chaîne avec `zscale=tin=arib-std-b67:…` ; `-vf` `zscale=t=linear:npl=100` lit déjà la
  caractéristique d'entrée depuis les balises du flux ; ajouter `tin=` si absente. **[doc]**
- Piège : si le flux n'est pas correctement balisé (`color_trc` inconnu), `zscale` échoue
  (« no path between colorspaces »). Remède : forcer `zscale=tin=smpte2084:min=bt2020nc:pin=bt2020:rin=tv:…` quand
  `ffprobe` dit `bt2020`/`smpte2084` ou, à défaut, traiter comme SDR.
- **Dolby Vision** **[doc, non essayé : mon extrait n'en contient pas]** :
  - **profils 7 et 8.1/8.2** (les plus courants dans les .mkv de films : DV + couche de base HDR10) : la couche de base est
    un HDR10 normal : **la chaîne ci-dessus s'applique telle quelle** (ffmpeg ignore la couche DV, ce qui est voulu).
    Détecter via `ffprobe -show_entries stream_side_data=dv_profile,dv_bl_signal_compatibility_id`
    (`compatibility_id` 1 = HDR10, 2 = SDR, 4 = HLG).
  - **profil 5** (pas de couche de base compatible, espace IPT-PQ-C2) : la chaîne `zscale` donne une image
    **verte/violette** (rapports de forum Jellyfin/Plex). Seul `libplacebo` (ffmpeg ≥ 6.x avec libplacebo ≥ 5.x, qui
    applique le RPU DV) corrige ; **or libplacebo exige Vulkan** (GPU ou `lavapipe` logiciel, très lent). Décision :
    **profil 5 → non lisible à la volée sur VPS sans GPU** ; message clair (« film Dolby Vision profil 5 : conversion
    impossible sur ce serveur ») ; ne pas tenter la lecture. Un film de ce profil est rare hors plateformes de streaming.
  - Profil 8.4 (HLG) : chaîne HLG.
- **libplacebo contre zscale+tonemap** : libplacebo (`tonemapping=bt.2390`, `gamut_mode`, détection du pic, DV) donne un
  rendu supérieur mais **passe par Vulkan** : indisponible sans GPU et **interdit sur ce poste** (une première tentative a
  été figée par Gagarine). Je n'ai donc pas mesuré. Recommandation : **zscale+tonemap par défaut** (processeur) ;
  libplacebo proposé comme option `CANAPE_HDR_MOTEUR=libplacebo` **uniquement** si un GPU est détecté
  (`ffmpeg -init_hw_device vulkan` répond) ; **hors périmètre de la 1.0**.
- **OpenCL/VAAPI/NVENC** : `tonemap_opencl`, `tonemap_vaapi` existent mais dépendent d'un GPU ; ignorés.

### 1.5 Réglages d'hls.js pour une VOD à segments lents **[doc : API.md d'hls.js ; non rejoué dans un navigateur]**

Valeurs par défaut (v1.x) : `fragLoadPolicy` : TTFB 10 000 ms, charge max 120 000 ms, 4 nouvelles tentatives après délai
dépassé (0 ms), 6 après erreur d'E/S (1 s, exponentiel, plafond 8 s) ; `manifestLoadPolicy` : charge 20 s ;
`playlistLoadPolicy` : TTFB 10 s ; `maxBufferLength` 30 s ; `maxMaxBufferLength` 600 s ; `maxBufferSize` 60 Mo ;
`maxBufferHole` 0,1 s ; `backBufferLength` Infinity ; `nudgeMaxRetry` 3 ; `lowLatencyMode` **true par défaut**
(à mettre à `false` : c'est de la VOD) ; `startPosition` −1 (= 0 en VOD).

Un segment converti à la demande peut prendre 2 à 15 s avant le premier octet (lancement de ffmpeg + premier segment
encodé) : le TTFB par défaut de 10 s est limite. Recommandation :

```ts
const hls = new Hls({
  lowLatencyMode: false,
  enableWorker: true,
  startPosition: position,              // reprise : évite un premier chargement à 0
  maxBufferLength: 30,                  // 5 segments d'avance : assez ; plus fait trop travailler le serveur
  maxMaxBufferLength: 60,
  maxBufferSize: 60e6,
  backBufferLength: 30,                 // jamais Infinity : mémoire du navigateur (4K → 1080p, long film)
  maxBufferHole: 0.3,                   // tolère les trous audio de ~50 ms entre segments produits séparément
  nudgeMaxRetry: 6,
  fragLoadPolicy: { default: {
    maxTimeToFirstByteMs: 45_000,       // ffmpeg peut devoir démarrer, saut en arrière → relance
    maxLoadTimeMs: 120_000,
    timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
    errorRetry:   { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000, backoff: 'linear' },
  }},
  playlistLoadPolicy: { default: { maxTimeToFirstByteMs: 10_000, maxLoadTimeMs: 20_000,
    timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
    errorRetry:   { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 8000 } } },
});
```
- **Le serveur doit servir la liste instantanément** (calculée, aucun ffmpeg) ; seuls les `.m4s` attendent.
- Côté serveur : répondre à un segment en cours de production par une **attente** (pas un 404 ni un 503) jusqu'à
  ~40 s ; au-delà `503` + `Retry-After: 2`. Un 404 est traité comme erreur fatale par hls.js après les nouvelles
  tentatives ; une attente est mieux gérée que des nouvelles tentatives.
- **Séance synchronisée** : l'événement `FRAG_LOADING`/`BUFFER_APPENDED`, ou `waiting`/`stalled` de `<video>`, doit
  alimenter le message `tampon {enCours}` de la synchro (voir section 2) : pendant qu'un segment lent arrive, tout le
  monde attend.
- **Gestion d'erreur** : `Hls.Events.ERROR` fatal : `NETWORK_ERROR` → `hls.startLoad()` ; `MEDIA_ERROR` →
  `hls.recoverMediaError()` (et au deuxième échec `swapAudioCodec()` puis `recoverMediaError()`) ; autre → détruire et
  recréer, ou rebasculer vers le plan suivant (conversion plus simple).
- **Safari / iOS** : HLS natif (`video.canPlayType('application/vnd.apple.mpegurl')`) ; hls.js n'y sert pas (iPhone
  n'a pas MSE avant iOS 17.1 ; iPadOS oui). En natif les réglages ci-dessus ne s'appliquent pas : prévoir des segments
  rapides à obtenir.
- **Changement de piste audio** : une liste distincte par audio (`/media/:id/hls/:audio/index.m3u8`) : on recharge
  `hls.loadSource()` à la position courante ; pas de rendition audio alternative HLS.

### 1.6 Vitesses mesurées **[essai]** et choix du préréglage

Commande (script `recherche/vit.sh`) : `ffmpeg -threads 4 -i extrait1.mkv -t 60 -map 0:v:0 -map 0:a:0 -vf
format=yuv420p -c:v libx264 -preset P -crf 23 -threads 4 -c:a aac -ac 2 -b:a 160k -f null -`, **4 fils** pour
l'entrée **et** la sortie, poste chargé par d'autres sessions (charge 3 → 9 sur 14 cœurs). Source 24 i/s : « temps
réel » = 24 i/s.

| Préréglage | 1080p SDR 10 bits → 8 bits | vitesse × temps réel |
|---|---|---|
| ultrafast | 129 i/s | 5,4× |
| superfast | 116 i/s | 4,8× |
| veryfast | 73 i/s | 3,0× |
| faster | 56 i/s | 2,35× |
| fast | 43 i/s | 1,8× |
| medium | 37 i/s | 1,5× |

4K HDR → SDR 1080p (zscale + tonemap, réduction avant), source 23,976 i/s, 20 s, 4 fils :

| Chaîne (source 4K HDR10+ 23,976 i/s) | préréglage | i/s | × temps réel |
|---|---|---|---|
| zscale réduit + hable | ultrafast | 33 | 1,38× |
| zscale réduit + hable | superfast | 30 | 1,26× |
| zscale réduit + hable | veryfast | 27 | 1,11× |
| zscale réduit + hable | faster | 20 | 0,85× (**sous le temps réel**) |
| `scale` ordinaire puis zscale + hable | veryfast | 25 | 1,06× |
| `scale=1920:-2,format=yuv420p` seul, **sans** tonemap | veryfast | 40 | 1,65× |

Lecture : sur la 4K, le goulot est le **décodage HEVC 10 bits 4K** (40 i/s au mieux, avec 4 fils) bien avant
l'encodage ; le tonemap coûte environ 30 % de plus (40 → 27 i/s). `zscale` pour réduire avant est un peu meilleur
que `scale` (27 contre 25). La 4K HDR à la volée reste donc **à la limite du temps réel avec 4 fils, même en
veryfast**. Un décodage par saut d'images (`-skip_frame` / `-vf select`) est impossible en lecture continue.

**Lectures et estimation VPS** :
- Un VPS à 2 vCPU (fils = moitié = 1 à 2) fait environ **le quart à la moitié** de ces chiffres : prévoir
  1080p veryfast ≈ 20 à 35 i/s (limite du temps réel), et **4K HDR : à peine temps réel même en ultrafast sur 4 vCPU**
  → **préparation à l'avance obligatoire pour la 4K HDR sur petit VPS** ; la conversion à la volée en 4K n'est viable
  qu'à ≥ 6 vCPU. C'est ce que prévoit déjà le contrat (cas 4).
- **Choix automatique du préréglage** : mesurer le **débit réel** sur les premiers segments (images produites / temps
  mur, via `-progress pipe:1` : `fps=` et `speed=`) ; si `speed < 1,3` : passer au préréglage plus rapide au prochain
  lancement (veryfast → superfast → ultrafast), si `speed > 3` après 30 s : remonter d'un cran (qualité). Garder le
  réglage par film dans le cache. Départ : `veryfast` (SDR), `superfast` (4K).
- Ajouter pour le démarrage rapide : `-tune zerolatency` **non** (coûte en qualité) ; `-x264-params
  keyint=144:min-keyint=144:scenecut=0` suffit. `-threads` = `CANAPE_TRANSCODAGE_FILS`. **`nice`** : `nice -n 10 ffmpeg …`.
- Qualité : `-crf 23` (à la volée, avec `-maxrate`/`-bufsize` = 8 Mb/s / 16 Mb/s pour borner le débit), `-crf 20` pour la
  préparation. Profil : `-profile:v high -level 4.1 -pix_fmt yuv420p`.
- **Le décodage HEVC 10 bits** en logiciel est le deuxième poste de coût (4K : jusqu'à 40 % du temps) : `-threads 4`
  placé **avant** `-i` (décodeur) et non seulement avant la sortie.
- Un film 4K HDR de 10 Go se prépare en environ (durée / vitesse) : 2 h à 1,4× ≈ 1 h 25 sur ce poste (4 fils).

### 1.7 Nettoyage du cache et vie des processus

- Cache : `CANAPE_CACHE/hls/<film>/<audio>/{init.mp4, <n>.m4s, etat.json}`. Purge LRU par `atime` (mettre à jour par
  `utimes` à chaque service) quand le total dépasse `CANAPE_CACHE_MAX` ; **ne jamais purger les segments de moins de
  10 min** ; les segments d'un film en cours de lecture sont protégés.
- ffmpeg arrêté 60 s après la dernière requête de segment (contrat) ; **tuer le groupe de processus** (`detached: true`
  + `process.kill(-pid)`) ; au démarrage du serveur, tuer les ffmpeg orphelins (fichier PID dans le cache).
- Écriture : `-hls_flags temp_file` (+`independent_segments`) ; au redémarrage du serveur supprimer les `.tmp`.
- Un seul ffmpeg par (film, audio) mais plusieurs positions possibles : **une file par clé**, relance seulement selon
  la règle de l'écart (1.1 point 2) ; **deux séances qui regardent le même film en des points différents** se
  disputent le même processus → traiter le plus ancien demandeur d'abord et accepter les relances (ou, mieux, autoriser
  **2 processus** par film quand la charge le permet).
- Limite globale : **N conversions simultanées** (`CANAPE_TRANSCODAGE_MAX`, défaut 1 ou 2) ; au-delà, un segment demandé
  attend sa file : prévenir le client (`tampon`).

### 1.8 Sources

- Jellyfin, `Jellyfin.Api/Controllers/DynamicHlsController.cs` (relances, arguments, `-copyts`, `-hls_segment_options`) :
  https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/DynamicHlsController.cs
- hls.js, configuration : https://github.com/video-dev/hls.js/blob/master/docs/API.md ;
  https://hlsjs.video-dev.org/api-docs/
- Jellyfin forum, « HLS implementation doesn't support non-keyframe breaks » :
  https://forum.jellyfin.org/t-solved-meaning-of-current-hls-implementation-doesn-t-support-non-keyframe-breaks
- Emby : listes calculées à partir de la durée déclarée, copie vidéo : https://emby.media/community/topic/149368-hls-segment-list-is-computed-from-the-containers%C2%A0declared%C2%A0duration-and-is-never-checked-against-the-media/
- Dolby Vision profil 5 vert/violet : https://forum.jellyfin.org/t-dolby-vision-p5-is-pink-green-and-tone-mapping-won-t-work
- ffmpeg, filtre `tonemap` / `zscale` : https://ffmpeg.org/ffmpeg-filters.html#tonemap ; https://ffmpeg.org/ffmpeg-filters.html#zscale
- ffmpeg, muxer hls : https://ffmpeg.org/ffmpeg-formats.html#hls-2

---

## 2. Synchronisation (Syncplay, Jellyfin SyncPlay, Teleparty, 0.1)

### 2.1 Ce que font les autres **[mémoire / doc : non rejoué]**

- **Syncplay** : état de salle côté serveur (position, pause) ; chaque client envoie sa position environ chaque
  seconde avec le temps d'aller-retour ; la position des autres est **compensée de la latence** (RTT/2) ; **ralentissement**
  (×0,95) quand on est en avance d'environ 1,5 s (« slow down threshold »), **retour/avance par saut** au-delà de
  ~4 s (« rewind threshold ») ; **attente des retardataires** : le serveur met en pause pour tous tant qu'un
  participant n'est pas « prêt » (fichier chargé). Pas de temps de calendrier : tout est relatif à la salle.
- **Jellyfin SyncPlay** : l'horloge serveur est estimée par un échange de type NTP (plusieurs mesures, on garde celle à
  plus faible RTT) ; les ordres de lecture/pause/saut sont **planifiés à un instant serveur futur** (`When`), pour que
  tous les clients agissent ensemble ; correction de dérive par **vitesse** (« SpeedToSync », entre ~60 ms et ~3 s d'écart,
  durée ~1 s) puis par **saut** (« SkipToSync » au-delà de ~400 ms si activé), décalage manuel (`extraTimeOffset`) ;
  état « buffering » : chaque client signale qu'il charge, le groupe attend les autres (`WaitingForReady`).
- **Teleparty** : sans correction fine : lecture/pause/saut diffusés ; resynchronisation par saut quand l'écart dépasse
  un seuil (quelques secondes) ; pas d'horloge partagée. C'est le moins précis, à ne pas imiter.

### 2.2 Ce que la 0.1 fait déjà bien (à garder tel quel)

`git show v0.1.0:docs/PROTOCOLE.md` : position **à un instant serveur** (`position`, `instant`, `version`) ; horloge par
`ping`/`pong`, meilleur des 10 derniers par plus petit RTT ; rattrapage par **saut > 1 s**, par **vitesse 1,05/0,95
entre 0,3 et 1 s** jusqu'à < 0,1 s ; attente mutuelle (`tampon`) ; **aucun écho** d'événement (appliquer un état reçu
n'envoie rien). C'est l'équivalent de SyncPlay + SpeedToSync : à reprendre.

### 2.3 Ce qu'il faut améliorer avec HLS à la volée

1. **Saut et segment lent** : un saut sur une position non tamponnée coûte 2 à 15 s (relance de ffmpeg). Règle de
   rattrapage en mode `hls` : saut seulement si la cible est **déjà dans `video.buffered`** ou si l'écart dépasse 4 s ;
   sinon vitesse seulement. Les seuils 0,3 / 1 s de la 0.1 restent bons en mode direct.
2. **Un `aller` / reprise / changement de piste devient une barrière** : le serveur met `etat.attente` = tous les
   `cid` et repasse en lecture quand chacun a envoyé `tampon {enCours:false}` **après** `seeked` + `canplay`
   (`readyState >= 3` et `buffered` couvre ≥ 2 s devant). **Délai maximal** (ex. 20 s) : au-delà, le retardataire est
   marqué « en retard », le salon repart sans lui et il rattrape par saut (sinon un client bloqué fige tout le monde).
3. **Reprise planifiée** (compte à rebours et fin d'attente) : le serveur diffuse `lecture` avec `instant = maintenant + 1 s`
   (ou +3 s pour le compte à rebours) ; chaque client **démarre à `instant` converti en heure locale** par l'estimation
   d'horloge (c'est le principe de `When` de Jellyfin) : les lancements sont alors simultanés à ~50 ms.
4. **Pré-chargement avant la reprise** : `video.play()` est appelé quand la barrière est levée, pas avant ; hls.js a déjà
   chargé les segments pendant l'attente (`maxBufferLength` ≥ 30 s).
5. **Ne jamais corriger pendant un chargement** : ignorer le rattrapage si `video.readyState < 3`, pendant `seeking`,
   ou 2 s après un saut (sinon boucle saut → chargement → saut).
6. **Position précise** : lire `requestVideoFrameCallback` (`metadata.mediaTime`) plutôt que `currentTime` pour
   comparer à l'attendu quand c'est disponible (Chrome, Safari ; Firefox ≥ 132 **[mémoire]**), `currentTime` sinon.
7. **Rythme des messages** : `lecture`/`pause`/`aller` immédiats ; `progression` toutes les 10 s ; la dérive est
   corrigée **localement** (chaque client compare à l'état serveur), **pas** par échange de positions entre clients
   (le serveur n'a besoin que de l'état et des `tampon`).
8. **Hôte** : tout participant peut commander (0.1) ; un ordre porte la `version` vue : le serveur écarte un ordre
   fondé sur une version périmée de plus de 300 ms (évite deux « pause/lecture » croisés), au prix d'un refus
   silencieux : renvoyer l'état courant.
9. **Rafale de commandes pendant la barrière** (quelqu'un clique 10 fois sur la barre) : fusionner côté client
   (debounce 250 ms) avant d'envoyer `aller`.

Sources : https://github.com/Syncplay/syncplay (protocole, `syncplay/constants.py` : seuils) ;
https://github.com/jellyfin/jellyfin-web/tree/master/src/plugins/syncPlay (`core/Manager.js`, `core/PlaybackCore.js`,
`core/TimeSyncCore.js`) ; 0.1 : `git show v0.1.0:docs/PROTOCOLE.md`.

---

## 3. tus avec Fastify 5 (`@tus/server` 2.4.7, `@tus/file-store` 2.1.2, `tus-js-client` 4.3.1)

**[essai]** : script `recherche/tus/essai.mjs` (Fastify 5.12.8 + `@tus/server` + `tus-js-client`, Node 26.4) :
envoi de 2,5 Mo accepté ; 4 Mo refusé **507** (hook `onUploadCreate`) ; 6 Mo refusé **413** (`maxSize`) ; sans cookie
**401** (`onIncomingRequest`) ; `onUploadFinish` appelé avec `upload.metadata`.

### 3.1 Intégration (testée)

```ts
const tus = new Server({
  path: '/api/televersement',
  datastore: new FileStore({ directory: cfg.televersements, expirationPeriodInMilliseconds: 24 * 3600_000 }),
  maxSize: cfg.televersementMax,            // 413 automatique
  respectForwardedHeaders: true,            // Location correcte derrière nginx (X-Forwarded-Proto/Host)
  async onIncomingRequest(req, id) {        // req = objet Request web (req.headers.get('cookie'))
    const user = await authentifier(req.headers.get('cookie'));   // 401 sinon
    if (!user?.peutTeleverser) throw { status_code: user ? 403 : 401, body: 'refusé' };
  },
  async onUploadCreate(req, upload) {       // upload.size = taille déclarée (Upload-Length)
    if (upload.size == null) throw { status_code: 400, body: 'taille requise' };   // refuse Upload-Defer-Length
    if (quotaDepasse(user, upload.size)) throw { status_code: 507, body: 'quota dépassé' };
    return { metadata: { ...upload.metadata, proprietaire: String(user.id) } };   // propriétaire = session, jamais le client
  },
  async onUploadFinish(req, upload) { await finaliser(upload); return {}; },      // déplacer, créer le film, analyser
});
app.addContentTypeParser('application/offset+octet-stream', (_req, _payload, done) => done(null));   // corps non lu par Fastify
app.all('/api/televersement', (req, reply) => { reply.hijack(); tus.handle(req.raw, reply.raw); });
app.all('/api/televersement/*', (req, reply) => { reply.hijack(); tus.handle(req.raw, reply.raw); });
```
- `reply.hijack()` est **indispensable** : sans lui Fastify tente de répondre une seconde fois.
- Le corps `application/offset+octet-stream` doit passer par un analyseur qui **ne consomme pas** le flux (`done(null)`),
  et `bodyLimit` de Fastify ne s'applique plus (le contrôle de taille est `maxSize` de tus).
- Les hooks lèvent `{ status_code, body }` pour répondre un statut précis.
- **Piège** : `onIncomingRequest` reçoit une `Request` web (pas `req.raw`), `req.headers.get(...)`. Pour récupérer
  l'utilisateur dans `onUploadCreate`, **ne pas compter** sur le partage d'un objet entre hooks (non vérifié) : relire la
  session à chaque hook (une requête SQLite, négligeable) ou la mettre en métadonnée côté serveur.
- **Ne jamais faire confiance** à `filename` de `Upload-Metadata` pour un chemin : le nom du fichier final est
  `<id>/original.<ext>` avec `ext` filtrée (liste blanche : mkv, mp4, m4v, mov, webm, avi, ts, wmv, flv, ogv, mpg).
- **Fin d'envoi** : `onUploadFinish` s'exécute **avant** la réponse du dernier `PATCH` : y faire vite (déplacer le fichier
  `rename` — même système de fichiers que `CANAPE_FILMS`, sinon copie lente — et lancer l'analyse ffprobe en tâche de
  fond) ; l'événement `EVENTS.POST_FINISH` existe aussi pour le « après ».
- **Quota « avec envois en cours »** : table `televersements` (contrat) : insérer en `onUploadCreate`, supprimer sur fin,
  résiliation (`EVENTS.POST_TERMINATE`) ou expiration. La taille réservée = `upload.size` déclaré.
- **Nettoyage des envois abandonnés** : `expirationPeriodInMilliseconds` sur le `FileStore` + appel périodique de
  `tus.cleanUpExpiredUploads()` (toutes les heures, `setInterval(...).unref()`) ; l'extension « expiration » ne
  concerne que les envois **incomplets** (test : 0 supprimé pour un envoi terminé) ; recouper avec la table
  `televersements` et le dossier (fichiers `<id>` + `<id>.json`).
- **Verrou** : le `locker` par défaut est en mémoire : suffisant, un seul processus.

### 3.2 Client (`tus-js-client` 4.x) **[doc]**

```ts
new tus.Upload(file, {
  endpoint: '/api/televersement',
  chunkSize: 50 * 1024 * 1024,                                  // contrat : 50 Mo ; doit rester < client_max_body_size
  retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000],
  onShouldRetry: (err) => { const s = err.originalResponse?.getStatus(); return !s || s >= 500 || s === 429 || s === 409; },
  metadata: { filename: file.name, filetype: file.type },
  removeFingerprintOnSuccess: true,
});
// reprise après rechargement de la page : empreinte (nom+taille+date+endpoint) gardée dans localStorage
const precedents = await upload.findPreviousUploads();
if (precedents.length) upload.resumeFromPreviousUpload(precedents[0]);
upload.start();
```
- `onShouldRetry` : ne pas réessayer sur 401/403/413/507 (inutile) ; **un 404/410 à la reprise** = envoi expiré côté
  serveur : relancer **sans** `resumeFromPreviousUpload` (`upload.start()` crée un nouvel envoi).
- Pause/reprise de l'interface : `upload.abort()` (sans `true`, **sans** terminer l'envoi côté serveur) puis `start()`.
- Cookies : même origine, `credentials` par défaut (`same-origin`) : aucun réglage ; pas de CORS.
- `parallelUploads: 1` (un gros fichier) ; plusieurs fichiers : un `Upload` à la fois par file côté client.

### 3.3 nginx devant **[doc / mémoire]**

```nginx
location /api/televersement {
  client_max_body_size 64m;          # un PATCH = 50 Mo + en-têtes
  proxy_request_buffering off;       # le corps part tout de suite au serveur, pas dans /var/lib/nginx
  proxy_buffering off;
  proxy_http_version 1.1;
  proxy_read_timeout 300s; proxy_send_timeout 300s;
  proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $remote_addr;
  proxy_pass http://127.0.0.1:8080;
}
```
Sans `proxy_request_buffering off`, nginx écrit chaque morceau de 50 Mo sur disque avant de le transmettre
(latence, pic d'E/S). **Piège** : le `Location` renvoyé par tus doit être en `https://` : d'où `respectForwardedHeaders` +
`X-Forwarded-Proto` (ou `relativeLocation: true`, plus simple et indépendant du proxy).

Sources : https://github.com/tus/tus-node-server/tree/main/packages/server ; https://tus.io/protocols/resumable-upload ;
https://github.com/tus/tus-js-client/blob/main/docs/api.md

---

## 4. WebRTC : négociation, écho, qualité, TURN

### 4.1 « Perfect negotiation » : le bug de la 0.1

Lecture de `git show v0.1.0:public/js/appel.js` : deux `RTCPeerConnection` par paire, `polite = moi > id`, `faisOffre`
posé pendant `setLocalDescription()`, `ignoreOffre = !polite && collision`. Le commentaire du code dit la cause : quand les deux
pairs font une offre au même instant, la résolution (rollback implicite du côté poli par `setRemoteDescription(offer)`)
**laisse parfois Chrome avec un transport ICE qui ne démarre jamais** (`connectionState` « new »). Contournement de la
0.1 : `attendreOffre` (le nouvel arrivant n'offre pas, il laisse offrir ceux déjà là). **Recommandation 1.0** :

1. **Initiateur déterministe, négociation parfaite en secours** : à l'arrivée de B, **c'est B qui est répondeur** ; les
   présents A offrent (déjà la 0.1) ; après la première connexion, seules des renégociations (`restartIce`, ajout de
   piste) peuvent entrer en collision : là seulement la règle polite/impolite s'applique.
2. **Deux transceivers `sendrecv` créés d'avance** (audio et vidéo) et pistes posées par `replaceTrack` : **aucune
   renégociation** quand la caméra ou le micro arrive/part (déjà la 0.1 : à garder). Ne pas utiliser `addTrack`/
   `removeTrack` en cours d'appel.
3. Code canonique (spec W3C « perfect negotiation ») : `makingOffer` positionné **avant** l'`await` et remis à
   `false` dans `finally` ; `offerCollision = description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable')` ;
   le pair **poli** accepte (rollback implicite via `setRemoteDescription`), l'impoli ignore **et ignore aussi les
   candidats ICE** de cette offre (`ignoreOffer`). Ne **jamais** appeler `setLocalDescription({type:'rollback'})` à la
   main si `signalingState === 'stable'`.
4. **File d'attente par paire** pour la signalisation (déjà la 0.1 : `p.file`) : traiter les messages un par un, sinon
   `setRemoteDescription` en parallèle sur un même `pc` lève `InvalidStateError`.
5. **Candidats ICE arrivés avant la description distante** : les mettre en file jusqu'au `setRemoteDescription` (ou
   laisser `addIceCandidate` échouer silencieusement seulement si `ignoreOffer`).
6. **Garde-fou anti-blocage** (la vraie leçon du bug « new ») : si `connectionState === 'new'` ou `iceConnectionState ===
   'new'|'checking'` plus de **8 s** après le début, **démolir la paire et la recréer** (fermer, `new RTCPeerConnection`, l'initiateur
   re-offre) ; compter 3 tentatives puis afficher « connexion impossible avec X ».
7. `restartIce()` sur `failed` ; sur `disconnected` attendre 4 s (0.1 : bon).
8. Le `signal {a, donnees}` du serveur doit préserver l'ordre par expéditeur (une seule file WebSocket : vrai).
9. **Reconnexion WebSocket** : après coupure, les pairs existants continuent ; ne recréer que les nouveaux `cid`.

### 4.2 Maillage à 2–8

- Maillage : chaque pair envoie **n−1 flux**. À 8 : 7 flux montants par navigateur : viable seulement avec de petites
  vignettes. **Stratégie** : limiter selon le nombre de pairs `n` (par `RTCRtpSender.setParameters`) :
  | participants | vidéo (par flux sortant) | audio |
  |---|---|---|
  | 2–3 | 640×360 ≤ 15 i/s, `maxBitrate` 400 kb/s | Opus 32–40 kb/s |
  | 4–5 | 320×180, 12 i/s, 150 kb/s | Opus 32 kb/s |
  | 6–8 | 240×135, 10 i/s, 80 kb/s ; vidéo coupée par défaut sauf orateur | Opus 24 kb/s |
- Réglage : `const p = sender.getParameters(); p.encodings[0].maxBitrate = 150_000; p.encodings[0].scaleResolutionDownBy = 2;
  p.encodings[0].maxFramerate = 12; p.degradationPreference = 'maintain-framerate'; await sender.setParameters(p);`
  (`getUserMedia` demande déjà `{width:{ideal:640}, height:{ideal:360}, frameRate:{ideal:15}}` ; `track.contentHint = 'motion'`).
- **La bande passante appartient au film** (≈ 5–8 Mb/s en 1080p transcodé) : ne pas dépasser **~600 kb/s montant
  au total** pour les caméras sur connexion modeste ; surveiller `getStats()` (`availableOutgoingBitrate`,
  `qualityLimitationReason`) toutes les 5 s et descendre d'un palier si `qualityLimitationReason !== 'none'` ou si
  `bufferedAmount`/`tampon` du film apparaît en même temps.
- Pas de *simulcast* ni de SFU : inutile à ≤ 8 (au-delà : SFU hors périmètre).
- Audio : `echoCancellation`, `noiseSuppression`, `autoGainControl` à `true` (par défaut) ; `channelCount: 1` ;
  Opus `usedtx` et `useinbandfec` via `setCodecPreferences`/SDP : facultatif.

### 4.3 Annulation d'écho quand le film sort d'un `<video>`

État de la connaissance **[doc : fils de discussion WebRTC/W3C et blogs ; non rejoué : l'AEC ne se teste pas avec des
périphériques simulés]** :
- **Chrome** (Chromium) : l'AEC3 ne retire **que l'audio reçu par des `RTCPeerConnection`** ; le son d'un `<video>`
  / `<audio>` ordinaire **n'est pas pris en compte** (bug Chromium 687574 ouvert de longue date). Une « AEC à l'échelle
  du navigateur » (*Chrome-wide AEC*, capture de la sortie du système) est déployée par Chrome sur certaines
  plateformes (surtout Windows et macOS), mais **pas garantie** (Linux, Android, ChromeOS non) et son activation dépend
  d'un drapeau de fonctionnalité.
- **Firefox** et **Safari** : l'AEC considère **tout l'audio sorti par le navigateur** (d'après les échanges du groupe
  de travail WebRTC) : le film est mieux supprimé ; qualité non vérifiée.
- Contrainte `echoCancellation` : la valeur `"all"` (vs `"remote-only"`) de `mediacapture-extensions` demande l'AEC sur
  tout l'audio **lorsque la plateforme sait le faire** ; la demander est sans risque : `{ echoCancellation: { ideal: 'all' }}`
  ou `true` en repli. **`restrictOwnAudio` et `suppressLocalAudioPlayback` ne concernent que `getDisplayMedia`**
  (capture d'écran/onglet) et ne servent pas ici.
- **Astuces connues** :
  1. **Casque recommandé** : seule solution fiable ; l'interface propose un bandeau « mets un casque pour éviter l'écho »
     à l'ouverture de la salle, et un bouton « haut-parleurs ».
  2. **Passer le film par WebRTC en boucle locale** (Mozilla Hubs : deux `RTCPeerConnection` locales, le son du film
     envoyé dans l'une et joué par un `<audio srcObject>` à la sortie de l'autre) : Chrome le traite alors comme du
     « distant » et l'annule. Coût : **latence ajoutée ~30–80 ms** au son du film par rapport à l'image (désynchro
     perceptible au-delà de ~45 ms d'avance du son), donc à n'activer que sur demande ; **non essayé ici** : à
     prototyper **par le module salle** avant de s'engager.
  3. **WebAudio** (`createMediaElementSource` + `AudioContext` → sortie) : **ne change pas** l'AEC de Chrome sauf *Chrome-wide* ;
     son intérêt est le **ducking** (baisser le film de ~10 dB pendant qu'un pair parle : `GainNode`, détecteur de voix
     par `AnalyserNode` ou `audioLevel` de `getStats`), ce qui réduit aussi l'écho perçu.
  4. **Pousser-pour-parler** ou **micro coupé par défaut** quand la lecture est en cours sur haut-parleurs.
  5. Ne **jamais** capturer la sortie du film pour la renvoyer aux autres (chacun lit le film : un doublon serait un écho).
- Recommandation : défaut = AEC navigateur + `echoCancellation: ideal 'all'` + bandeau casque + ducking WebAudio
  facultatif ; piste 2 documentée comme amélioration.

### 4.4 TURN avec coturn (`use-auth-secret`) **[doc]**

`/etc/turnserver.conf` :
```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=<SECRET LONG ALÉATOIRE>      # = CANAPE_TURN_SECRET
realm=canape.example.org
total-quota=100
stale-nonce=600
no-multicast-peers
min-port=49160
max-port=49200
no-cli
no-tlsv1
no-tlsv1_1
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
# cert=/etc/letsencrypt/live/…/fullchain.pem  pkey=…/privkey.pem   (turns:)
```
Identifiants temporaires (serveur Canapé, `GET /api/ice`) :
```ts
const expire = Math.floor(Date.now() / 1000) + 3600;
const username = `${expire}:${utilisateur.id}`;
const credential = createHmac('sha1', secret).update(username).digest('base64');
return { iceServers: [{ urls: stunUrls }, { urls: turnUrls, username, credential }] };   // turn:hote:3478?transport=udp, turn:hote:3478?transport=tcp, turns:hote:5349
```
Pièges : **`denied-peer-ip`** (empêche d'utiliser TURN pour atteindre le réseau interne du VPS ; CVE-2020-26262) ;
ouvrir dans le pare-feu 3478 (UDP+TCP), 5349 et la plage `min-port…max-port` en UDP ; l'heure du serveur doit être
juste ; `use-auth-secret` (pas `lt-cred-mech` avec utilisateurs fixes) ; `external-ip=` si le VPS est derrière un NAT (cas
des clouds) ; ne **pas** mettre le secret côté client. Sources : https://github.com/coturn/coturn/blob/master/README.turnserver ;
https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00 ; https://www.w3.org/TR/webrtc/#perfect-negotiation-example ;
https://developer.chrome.com/blog/more-native-echo-cancellation/ ; https://github.com/webrtc/samples/issues/1243 ;
https://webrtchacks.com/srcobject-intervention/

---

## 5. `node:sqlite` (Node 26), Argon2id, sessions

### 5.1 `node:sqlite` **[essai sur Node 26.4.0 + doc nodejs.org/api/sqlite.html]**

- Stabilité : **1.2 « release candidate »** (depuis v25.7.0) ; plus derrière un drapeau, **aucun avertissement**
  d'expérimental affiché en 26.4 (constaté). SQLite embarqué : **3.53.2** (constaté).
- **Nom de classe** : la doc la plus récente (v26.8) appelle la classe **`Database`** et déclare **`DatabaseSync` /
  `StatementSync` alias dépréciés** (DEP0210/0211). **Node 26.4.0 n'exporte que `DatabaseSync`** (exports constatés :
  `DatabaseSync, Session, StatementSync, backup, constants`). Pour survivre aux mises à jour mineures :
  `import * as sqlite from 'node:sqlite'; const Base = (sqlite as any).Database ?? sqlite.DatabaseSync;` dans **un seul**
  fichier (`serveur/src/db/`) ; `Node 26.x` change vite : épingler la version de Node du VPS (`/opt/canape/node`).
- Ouverture : `new DatabaseSync(chemin, { timeout: 5000 })` (**`timeout` = `busy_timeout`**, option de la v24.0 ;
  `PRAGMA busy_timeout` rend bien 5000 **[essai]**). `enableForeignKeyConstraints` est **`true` par défaut**
  (`PRAGMA foreign_keys` = 1 **[essai]**). `defensive: true` par défaut depuis 25.5/24.14 (désactive les écritures
  dangereuses sur le schéma).
- **WAL** : `db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA wal_autocheckpoint = 1000;
  PRAGMA journal_size_limit = 67108864;')` : retourne `wal` **[essai]**. En WAL : un écrivain + lecteurs simultanés ;
  les écritures concurrentes **attendent** `busy_timeout`.
- **API synchrone** : tout bloque la boucle d'événements ; les requêtes de Canapé sont courtes (< 1 ms) → pas de pool ;
  **une seule connexion** pour le processus ; éviter `SELECT` géants sans `LIMIT`, pas de transaction qui `await` quoi que ce
  soit (aucune interruption possible entre `BEGIN` et `COMMIT` autrement).
- **Transactions** : `BEGIN IMMEDIATE` (verrou d'écriture pris d'avance, évite `SQLITE_BUSY` au milieu) ; aide :
  ```ts
  function transaction<T>(db, fn: () => T): T {
    const imbriquee = db.isTransaction;               // propriété `isTransaction` (v24+) [essai : true après BEGIN]
    const point = imbriquee ? `sp${++n}` : null;
    db.exec(imbriquee ? `SAVEPOINT ${point}` : 'BEGIN IMMEDIATE');
    try { const r = fn(); db.exec(imbriquee ? `RELEASE ${point}` : 'COMMIT'); return r; }
    catch (e) { db.exec(imbriquee ? `ROLLBACK TO ${point}; RELEASE ${point}` : 'ROLLBACK'); throw e; }
  }
  ```
  `fn` est **synchrone** (jamais `async`).
- **Sauvegarde à chaud** : `import { backup } from 'node:sqlite'; const pages = await backup(db, 'sauvegarde.sqlite',
  { rate: 100 })` : copie cohérente en cours d'usage, renvoie le nombre de pages (**[essai]** : 2). Alternative simple :
  `db.exec("VACUUM INTO '/chemin/sauvegarde.sqlite'")` (synchrone, bloque brièvement : acceptable pour une petite base).
  Avant chaque mise à jour (script `mettre-a-jour`) : `backup` ou `cp` des trois fichiers en arrêtant le service.
- **Migrations** : dossier `serveur/migrations/NNN_nom.sql` appliqués dans l'ordre, chacun dans `BEGIN IMMEDIATE …
  COMMIT`, version dans `PRAGMA user_version` (ou table `reglages`) ; **jamais de modification d'une migration publiée**
  (déjà la règle du contrat) ; `ALTER TABLE … ADD COLUMN` seulement (SQLite ne sait pas tout modifier) ; pour un
  changement lourd : créer la nouvelle table, copier, `DROP`, renommer, **avec `PRAGMA foreign_keys=OFF` hors transaction**.
- **Typage** : `INTEGER` hors plage sûre lève `ERR_OUT_OF_RANGE` (rien à craindre ici) ; `undefined` se lie en `NULL` ;
  paramètres nommés `$nom` avec clés nues par défaut ; les inconnus lèvent une erreur : utile pour attraper les fautes de frappe ;
  `BLOB` = `Uint8Array`. Les lignes sont des objets à **prototype nul** (`Object: null prototype`) : `JSON.stringify` fonctionne, pas
  `row.hasOwnProperty`.
- **Instructions préparées** : les garder en cache (`Map`) ; `createTagStore()` (v24.9+) existe.
- Performances : plusieurs dizaines de milliers d'insertions/s en transaction ; sans transaction chaque `INSERT` fait un
  `fsync` (WAL `synchronous=NORMAL` limite le coût). Ne pas mettre `progression` (toutes les 10 s par spectateur) hors
  transaction groupée si beaucoup d'utilisateurs : `INSERT … ON CONFLICT DO UPDATE` suffit.

### 5.2 Argon2id avec `@node-rs/argon2` 2.2.2 **[essai + doc OWASP]**

- OWASP (Password Storage Cheat Sheet) : minimum **m = 19 MiB, t = 2, p = 1** ; équivalents : 46 MiB/1/1, 12 MiB/3/1,
  9 MiB/4/1, 7 MiB/5/1. **[essai]** : `hash('motdepasse', { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 })` →
  `$argon2id$v=19$m=19456,t=2,p=1$…` en **34 ms** sur ce poste ; `verify` renvoie `true` / `false`.
- Recommandation : **m = 47 104 (46 MiB), t = 2, p = 1** (≈ 80 ms ici, à mesurer sur le VPS ; viser 100–300 ms), format PHC
  (déjà dans le contrat). `algorithm: 2` = Argon2id (à écrire explicitement ; `Algorithm.Argon2id`).
- **Les fonctions sont asynchrones** (thread pool libuv, 4 fils par défaut) : 4 connexions simultanées × 46 MiB = ~190 Mo ;
  le **limiteur de débit** de la connexion (5 échecs/min) borne le risque de déni de service par Argon2.
- **Réhachage** : au succès d'une connexion, parser `m=,t=,p=` dans la chaîne PHC ; si inférieurs aux réglages
  courants → `hash` et `UPDATE`. Aucune API `needsRehash` n'existe dans la bibliothèque.
- **Utilisateur inconnu** : faire quand même un `verify` sur un hachage factice (**temps constant**) pour ne pas révéler
  quels identifiants existent ; même message d'erreur.
- Poivre : facultatif (OWASP : défense en profondeur ; secret hors base) ; non nécessaire ici.
- Longueur : accepter 8 à 128 caractères, **ne pas** imposer de composition ; refuser > 1 000 octets (dépense CPU).
- Binaires précompilés N-API (linux x64 glibc/musl) : **vérifier à l'installation sur le VPS** (`npm ci --omit=dev` dans la CI
  sur `ubuntu-24.04` = même architecture que le VPS ; si ARM : paquet `linux-arm64-gnu`).

### 5.3 Sessions et cookies

- Jeton : `randomBytes(32).toString('base64url')` ; en base **SHA-256 en hexadécimal** (déjà le contrat) : un hachage rapide
  suffit pour un jeton à haute entropie ; recherche par `WHERE id = ?` (pas de comparaison à temps constant nécessaire).
- Cookie `canape_session` : `HttpOnly; SameSite=Lax; Path=/; Secure` (derrière HTTPS) ; `Max-Age` 30 jours ; préfixe
  **`__Host-canape_session`** possible seulement en HTTPS (Secure, `Path=/`, pas de `Domain`) : le contrat fixe le nom `canape_session` ;
  garder, et ajouter le préfixe seulement si le module comptes l'accepte (non essayé).
- **Expiration glissante sans écriture à chaque requête** : mettre à jour `vu_le` et `expire_le` seulement si `vu_le`
  date de plus de 5 min ; sinon une écriture par requête de média/segment sature le WAL.
- **Rotation** : nouvel identifiant de session à la connexion (anti-fixation) ; à la déconnexion, suppression de la ligne ;
  désactivation d'un compte : `DELETE FROM sessions WHERE utilisateur_id = ?` (contrat) **et** fermer ses WebSocket.
- **CSRF** : `SameSite=Lax` + **contrôle d'`Origin`** sur toutes les requêtes qui modifient (contrat) ; l'`Origin` est parfois
  absent (vieux navigateurs, requêtes de même origine sans en-tête) : si absent, exiger `Sec-Fetch-Site: same-origin`.
- Sessions pour `<video>` et segments : **le cookie suffit** (même origine) ; ne pas mettre de jetons dans l'URL des médias
  (fuite dans les journaux nginx).
- Limite de débit de la connexion : `@fastify/rate-limit` par IP **et** par identifiant (contrat : 5 échecs/min).
Sources : https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html ;
https://nodejs.org/api/sqlite.html ; https://sqlite.org/wal.html ; https://github.com/napi-rs/node-rs/tree/main/packages/argon2 ;
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

---

## 6. Fastify 5

Versions du dépôt : `fastify` 5.12.8, `@fastify/websocket` 11.3.7, `@fastify/static` 10.1.10, `@fastify/rate-limit` 11.2.2,
`@fastify/cookie` 11.1.5.

- **`@fastify/websocket` avec authentification et `Origin`** **[essai : `recherche/tus/ws.mjs`]** : enregistrer
  `app.register(websocket, { options: { maxPayload: 65536 } })` (**1009** si un message dépasse, constaté) ; la route
  `app.get('/ws/seances/:id', { websocket: true, preValidation }, (socket, req) => …)` ; le crochet **`preValidation`** s'exécute
  **avant la mise à niveau** : y contrôler l'`Origin` (403, constaté), la session (401, constaté) et le droit à la séance (404) :
  le refus part comme réponse HTTP normale, sans poignée de main (constaté : `unexpected-response 403/401`). Handler :
  `(socket, req)` (v11 : le premier argument est le `WebSocket` de `ws`, plus d'objet `connection`).
- **Cœur du WebSocket** : battement par `socket.ping()` toutes les 25 s + fermeture si aucun `pong` en 60 s (nginx coupe
  à 60 s d'inactivité sans `proxy_read_timeout` long) ; `socket.on('close'|'error')` retirent le participant ; contre-pression :
  vérifier `socket.bufferedAmount` avant d'envoyer des rafales ; limite de débit de messages **maison** (jetons par
  connexion : 5/s réactions et messages), `@fastify/rate-limit` ne couvre pas les messages WebSocket.
- **`@fastify/static` + repli d'une application monopage** : `app.register(fastifyStatic, { root: clientBuild, wildcard: false,
  index: false })` puis
  `app.setNotFoundHandler((req, reply) => { if (/^\/(api|media|ws)\//.test(req.url)) return reply.code(404).send({erreur:'introuvable', message:'…'});
  return reply.header('Cache-Control','no-cache').sendFile('index.html'); })`. Un `GET` d'URL inconnue **sans** extension rend
  `index.html` ; une ressource manquante avec extension (`.js`, `.png`) doit rester **404**. En-têtes de cache : `/_app/immutable/*` →
  `public, max-age=31536000, immutable` ; `index.html`, `service-worker.js`, `manifest.webmanifest` → `no-cache`. `wildcard: false` évite
  l'enregistrement d'une route `*` qui masquerait les routes de l'API. **[doc/mémoire : non rejoué]**
- **`@fastify/rate-limit`** : `global: false`, `config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: … } }` par route
  sensible (connexion, invitation) ; `trustProxy: true` côté Fastify quand `CANAPE_DERRIERE_PROXY=1` (sinon `req.ip` serait celle de
  nginx) ; stockage en mémoire (un seul processus).
- **En-têtes de sécurité** (hook `onSend` ; nginx peut y ajouter HSTS) pour SvelteKit `adapter-static` + hls.js :
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-…hash du script de démarrage SvelteKit…';
    style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:;
    connect-src 'self' wss://<hote>; font-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self';
    frame-ancestors 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: same-origin
  Permissions-Policy: camera=(self), microphone=(self), geolocation=(), fullscreen=(self)
  Cross-Origin-Opener-Policy: same-origin
  ```
  Raisons : `media-src blob:` et `worker-src blob:` sont requis par **hls.js** (MediaSource → URL `blob:`, worker en `blob:`) ; le
  script de démarrage inline de SvelteKit se couvre par `kit.csp: { mode: 'hash', directives: {…} }` dans `svelte.config.js`
  (génère le hachage pour la page de repli : à **vérifier à la construction**) ; `'unsafe-inline'` pour les styles :
  Svelte injecte des attributs `style` ; **`connect-src` : `wss://hote` explicite** (Safari ancien n'inclut pas `ws:` dans `'self'`) ;
  **ne pas** mettre `Cross-Origin-Embedder-Policy` (casserait les ressources). **[doc : non essayé dans un navigateur ; à valider
  par le module livraison/e2e avec la console `Content-Security-Policy`]**.
- **Journal sous systemd** : Fastify `logger: true` écrit du **JSON (pino) sur stdout** → `journalctl -u canape -o cat | jq`.
  Recommandé : niveau `info` ; `redact: ['req.headers.cookie', 'req.headers.authorization']` ; **ne pas journaliser** les requêtes de
  segments et de `Range` (`disableRequestLogging` par route `/media/*` ou hook) ; pas de `pino-pretty` en production ; **pas de dates** dans
  le message (journald les met : `timestamp: false`). `StandardOutput=journal` (par défaut) ; `SyslogIdentifier=canape`.
  Arrêt propre : `process.on('SIGTERM', () => app.close())` (systemd envoie SIGTERM : fermer les WebSocket avec le code 1001 et arrêter
  ffmpeg avant de sortir).
- `trustProxy`, `bodyLimit` (1 Mo par défaut : bon pour le JSON), `requestTimeout: 0` pour les routes média (**les réponses
  longues de segments / `Range` ne doivent pas être coupées** : ne pas mettre de `connectionTimeout` global trop court) ; `keepAliveTimeout: 65_000`
  (supérieur à celui de nginx 60 s en amont si `keepalive` actif).
- Média : servir les fichiers par `reply.send(fs.createReadStream(chemin, {start, end}))` avec `Accept-Ranges: bytes`, `206`
  et `Content-Range` ; `@fastify/static` gère déjà `Range` pour des dossiers statiques (utilisable pour `/media/:id/prepare`) ;
  `Cache-Control: private, no-store` sur les médias authentifiés ; segments immuables : `private, max-age=3600`.

Sources : https://fastify.dev/docs/latest/ ; https://github.com/fastify/fastify-websocket ; https://github.com/fastify/fastify-static ;
https://github.com/fastify/fastify-rate-limit ; https://kit.svelte.dev/docs/configuration#csp

---

## 7. SvelteKit 2 + Svelte 5 en monopage

Versions du dépôt : `@sveltejs/kit` 2.70.4 (la dernière publiée sur npm est la **3.2.0**, avec `adapter-static` 4 qui exige kit 3 ;
`kit 2` reste en dist-tag `version-2` : **le contrat reste valable, ne pas migrer en 1.0**), `svelte` 5.57.3, `vite` 7.3.8, `adapter-static` 3.0.11.

- **Monopage** : `svelte.config.js` : `adapter: adapter({ fallback: 'index.html', pages: 'build', assets: 'build' })` ; dans
  `src/routes/+layout.ts` : `export const ssr = false; export const prerender = false;` (le repli remplace le prérendu) ; routes
  dynamiques (`/seances/[id]`) fonctionnent grâce au repli côté serveur (section 6). Pas de `+page.server.ts` / `+server.ts` :
  tout passe par l'API Fastify.
- **Magasins avec les runes** : fichiers `*.svelte.ts` ; pas d'export d'un `$state` primitif **réassigné** (un module ne peut pas exporter une
  variable réactive qui change de valeur) : exporter un **objet** ou une **classe** à instance unique :
  ```ts
  // client/src/lib/comptes/session.svelte.ts
  class Session { utilisateur = $state<Utilisateur | null>(null); chargee = $state(false);
    get connecte() { return this.utilisateur !== null; }       // ou $derived dans la classe
    async charger() { … } }
  export const session = new Session();
  ```
  `$derived` dans la classe pour les valeurs calculées ; `$effect` seulement pour les effets de bord (abonnement WebSocket, `hls.js`) avec
  **fonction de nettoyage** retournée ; `$state.raw` pour les gros objets non profondément réactifs (listes de films, états de lecture
  reçus par WebSocket : remplacés en bloc) ; `untrack` pour lire sans suivre. Passer l'état d'une séance par le **contexte**
  (`setContext`/`getContext`) plutôt qu'un singleton global (une salle à la fois : le singleton suffit pourtant).
- **`<video>` et hls.js** : instancier dans `onMount`/`$effect`, `hls.destroy()` au démontage, **`bind:this`** sur l'élément ; ne jamais
  lier `bind:currentTime` (réactivité à 4 Hz coûteuse et boucles avec la synchro) : lire `video.currentTime` à la demande.
- **Service worker** (`src/service-worker.ts`, enregistré automatiquement par SvelteKit) : importer `build`, `files`, `version` de
  `$service-worker` ; `install` : `cache.addAll([...build, ...files])` ; `activate` : supprimer les anciens caches ; `fetch` : **n'intercepter
  que les `GET` de même origine dont le chemin est dans `build`/`files`**, et **sortir sans `respondWith`** pour tout le reste :
  `/api/`, `/media/`, `/ws/`, requêtes `Range`, et **toute navigation** (laisser le réseau répondre ; en hors-ligne servir `index.html`
  du cache **seulement pour les navigations**). **Ne jamais** mettre en cache les médias, l'API, ni `/api/etat`. Pas de
  `skipWaiting` automatique pendant une séance (recharger casserait la lecture) : afficher « Nouvelle version : recharger ».
- **Manifeste** (`static/manifest.webmanifest`, `<link rel="manifest">` dans `app.html`) : `name`, `short_name`, `start_url: "/"`, `scope: "/"`,
  `display: "standalone"`, `background_color`/`theme_color` (même noir que l'interface), `lang: "fr"`, icônes **192, 512 et 512 « maskable »** en PNG
  (`purpose: "any"` et `"maskable"` séparés), plus `apple-touch-icon` 180 px et `<meta name="theme-color">` ; Chrome exige un service
  worker avec gestionnaire `fetch` et le manifeste valide pour proposer l'installation ; Safari iOS s'appuie sur `apple-touch-icon`.
- **Variables et API** : `fetch` typé dans `client/src/lib/api/` ; URL relatives (même origine) : le client ne connaît pas l'hôte ; WebSocket :
  `new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/seances/${id}`)`.
- Construction : `vite build` → `client/build/` ; vérifier `index.html` de repli et que les chemins `_app/immutable` sont servis avec `immutable`.
Sources : https://svelte.dev/docs/kit/single-page-apps ; https://svelte.dev/docs/kit/service-workers ; https://svelte.dev/docs/svelte/$state ;
https://svelte.dev/docs/kit/configuration#csp ; https://web.dev/articles/install-criteria

---

## 8. Playwright (`@playwright/test` 1.65.0) **[doc / mémoire ; non rejoué : pas de navigateurs sur ce poste pendant la recherche]**

- **Chromium** : `launchOptions.args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']` ; permissions du
  contexte `permissions: ['camera', 'microphone']` ; image et son contrôlés : `--use-file-for-fake-video-capture=/chemin/video.y4m` (ou `.mjpeg`) et
  `--use-file-for-fake-audio-capture=/chemin/son.wav` ; autoplay : `--autoplay-policy=no-user-gesture-required`.
- **Firefox** : `launchOptions.firefoxUserPrefs: { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true,
  'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 }`. Sans ces préférences `getUserMedia` reste suspendu (blague
  classique : le test se bloque sans erreur).
- **WebKit** : **pas** de périphérique simulé fiable ; Playwright n'expose pas d'option ; sous Linux headless `getUserMedia`
  échoue (aucune caméra). Plan : sur WebKit tester **lecture, synchro, chat** sans caméra (le client doit fonctionner sans média local :
  sécurité d'implémentation de la salle : `NotFoundError`/`NotAllowedError` → mode « spectateur » sans micro) ; l'autoplay exige un geste : **cliquer** d'abord sur « Lire ».
- **Pas de H.264/AAC dans les Chromium/Firefox de Playwright** (builds sans codecs propriétaires) : **les fixtures de test doivent être en
  WebM VP9/Opus** pour le mode `direct`, et les tests HLS (H.264) ne passent que sur `channel: 'chrome'` (Chrome stable : `npx playwright install chrome`) ou WebKit.
  **À valider au premier essai du module intégration.** Les fixtures se fabriquent avec ffmpeg (`testsrc2` + `sine`, 10 s, quelques centaines de ko).
- **Deux contextes qui se voient** : `const a = await browser.newContext({ permissions: […] }); const b = await browser.newContext(…)` : un seul `browser`, deux
  contextes isolés (cookies séparés), deux `page` ; chacun se connecte avec un compte différent (création par l'API / `canape admin inviter`) ; le
  WebRTC local fonctionne **sans STUN/TURN** (candidats `host`/mDNS : ajouter `--disable-features=WebRtcHideLocalIpsWithMdns` pour Chromium si les
  candidats `.local` posent problème en CI) ; vérifier la connexion par `pc.connectionState` exposé dans l'interface (`data-etat="connecte"`).
- **Test de synchro** : lancer la lecture dans A, attendre `data-etat` ou `video.currentTime` dans B par `expect.poll(() => b.evaluate(() =>
  document.querySelector('video').currentTime), { timeout: 10_000 }).toBeGreaterThan(1)` ; écart `|tA − tB| < 0,5 s`.
- **Configuration** : `projects: [{ name: 'chromium' }, { name: 'firefox' }, { name: 'webkit' }]`, `workers: 1` en CI (RAM), `retries: 1`,
  `use: { trace: 'retain-on-failure', video: 'off' }`, `webServer: { command: 'node serveur/src/index.ts serve --config …', url: '…/api/etat',
  reuseExistingServer: !process.env.CI }`, `timeout: 60_000`.
- **CI** : `npx playwright install --with-deps chromium firefox webkit` (≈ 1 Go de téléchargement : mettre `~/.cache/ms-playwright` en cache
  clé = version de Playwright) ; GitHub-hosted `ubuntu-24.04` convient ; **travail lourd** sur ce poste : jamais hors file Gagarine.
Sources : https://playwright.dev/docs/api/class-browsertype#browser-type-launch ; https://playwright.dev/docs/ci ;
https://webrtc.github.io/webrtc-org/testing/ (fake devices) ; https://bugzilla.mozilla.org/show_bug.cgi?id=1771789

---

## 9. GitHub Actions : déploiement par SSH

- **Clé à commande forcée** : `~deploy/.ssh/authorized_keys` :
  `restrict,command="/opt/canape/bin/recevoir" ssh-ed25519 AAAA… canape-deploiement` (`restrict` = pas de pty, pas de redirections, pas d'agent,
  pas de X11) ; l'utilisateur `deploy` n'a **aucun** droit hors `sudo -n /opt/canape/bin/mettre-a-jour` (`/etc/sudoers.d/canape` :
  `deploy ALL=(root) NOPASSWD: /opt/canape/bin/mettre-a-jour`). Côté CI : `ssh -i clé deploy@hote "<sha256>" < dist/canape-X.tar.gz`
  (le SHA-256 arrive dans `$SSH_ORIGINAL_COMMAND`, validé par `^[0-9a-f]{64}$` ; le paquet est lu sur l'entrée standard, écrit dans un fichier
  temporaire, vérifié, puis installé) : c'est la conception du contrat.
- **Empreinte de l'hôte** : secret `SSH_KNOWN_HOSTS` (ligne `known_hosts` obtenue une fois par `ssh-keyscan -t ed25519 hote` **vérifié à la main**) ;
  `StrictHostKeyChecking=yes` ; ne **pas** faire `ssh-keyscan` dans la CI (confiance aveugle).
- **Environnement protégé** : job `deploiement` avec `environment: production` ; dans les paramètres : **branches autorisées** : `main` seulement,
  relecteurs requis facultatifs (un clic « approuver »), **secrets (`SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`, `DEPLOY_HOST`) rattachés à l'environnement**, pas au dépôt.
- **`concurrency`** : `concurrency: { group: deploiement-production, cancel-in-progress: false }` (deux déploiements ne se croisent
  jamais ; ne **pas** annuler un déploiement en cours) ; pour la CI des PR : `group: ci-${{ github.ref }}`, `cancel-in-progress: true`.
- **Permissions** : `permissions: { contents: read }` au niveau du workflow ; `contents: write` seulement dans le job qui crée la release
  GitHub (`gh release create v$VERSION dist/* --notes-file …`, avec `GITHUB_TOKEN`).
- **Épinglage** : `uses: actions/checkout@<SHA de 40 caractères> # v5.x.y` pour **toutes** les actions (une étiquette peut être déplacée) ; Dependabot
  `package-ecosystem: github-actions` met les SHA à jour. Obtenir le SHA : `gh api repos/actions/checkout/git/ref/tags/v5` ; **à vérifier au moment d'écrire**
  (je n'ai pas figé de SHA ici : ils changent).
- **Node 26** : `actions/setup-node` avec `node-version: 26` (ou `node-version-file: .node-version` contenant `26.4.0`, identique à
  `/opt/canape/node`) et `cache: npm` ; Node 26 deviendra LTS à l'automne 2026. Vérifier que l'étiquette `26` est résolue (sinon `check-latest: true`).
  L'exécution de TypeScript natif : version **identique** entre CI et VPS (le dépôt épingle `26.4.0` dans `engines`).
- **Playwright dans la CI** : voir 8 ; artefacts : `actions/upload-artifact` sur échec (`playwright-report/`, `retention-days: 7`) ; `timeout-minutes: 20`.
- **Ordre** du flux `main` : `ci` (types, tests, build) → `paquet` (`scripts/paquet.sh`, `SHA256SUMS`) → `deploiement` (`environment: production`) → `release`.
  Si l'envoi échoue, **ne pas** créer la release ; `mettre-a-jour` vérifie `/api/etat` et revient en arrière (contrat).
- **Sécurité** : jamais `pull_request_target` avec le code d'un PR ; les secrets ne sont pas passés aux PR de forks ; `GITHUB_TOKEN` en lecture par défaut ;
  masquer le chemin du paquet dans les journaux n'est pas nécessaire.
Sources : https://docs.github.com/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions ;
https://docs.github.com/actions/deployment/targeting-different-environments ; https://github.com/actions/setup-node ;
https://man.openbsd.org/sshd#AUTHORIZED_KEYS_FILE_FORMAT
