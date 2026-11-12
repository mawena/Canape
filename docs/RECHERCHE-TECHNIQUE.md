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

*(complétée à la fin du document ; voir la fin pour les sections 2 à 9)*

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
