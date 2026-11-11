# Protocole WebSocket — Canapé

Connexion : `GET /ws` (WebSocket), authentifiée par le cookie de session `canape_session`. L'en-tête `Origin`, s'il
est présent, doit avoir le même hôte que la requête. Refus avant la poignée de main : 401 (pas de session),
403 (origine étrangère), 503 (4 participants déjà présents). Messages en JSON texte, 64 Ko au plus (sinon fermeture 1009).

## Client → serveur

| Message | Effet |
|---|---|
| `{"type":"ping","t":<ms locales>}` | répond `pong` (estimation du décalage d'horloge) |
| `{"type":"lecture","position":<s>}` | lance la lecture à cette position |
| `{"type":"pause","position":<s>,"fin":<bool>}` | pause (`fin` : la lecture est arrivée au bout, pas d'annonce) |
| `{"type":"position","position":<s>}` | déplacement dans le film (garde l'état lecture/pause) |
| `{"type":"film","film":"<chemin relatif>"\|null}` | choisit le film (vérifié côté serveur), remet la position à 0, en pause |
| `{"type":"tampon","enCours":<bool>}` | ce navigateur charge (plus d'une seconde) / est prêt |
| `{"type":"media","micro":<bool>,"camera":<bool>}` | état du micro et de la caméra (affichage des vignettes) |
| `{"type":"signal","a":<id>,"donnees":{…}}` | signalisation WebRTC pour le participant `a` : `{"description":RTCSessionDescriptionInit}` ou `{"candidate":RTCIceCandidateInit}` |

## Serveur → client

| Message | Contenu |
|---|---|
| `bienvenue` | `{id, prenom, serveur:<ms>, participants:[{id,prenom,micro,camera}], etat}` envoyé à l'arrivée |
| `arrivee` | `{participant:{id,prenom,micro,camera}}` |
| `depart` | `{id, prenom}` |
| `etat` | `{etat, raison, par}` diffusé à tous (y compris l'auteur) à chaque changement |
| `media` | `{id, micro, camera}` |
| `signal` | `{de:<id>, donnees:{…}}` relayé tel quel |
| `pong` | `{t:<écho>, serveur:<ms>}` |
| `erreur` | `{message}` |

### L'état (`etat`)

```json
{ "film": "Dossier/Film.mp4" | null, "lecture": true, "position": 12.3, "instant": 1731360000000,
  "version": 7, "attente": ["Kofi"], "serveur": 1731360000123 }
```

`position` est la position (secondes) à l'instant serveur `instant` (ms). Position attendue maintenant :
`lecture ? position + (heureServeur - instant) / 1000 : position`. `attente` : prénoms de ceux qui chargent.
`serveur` : heure du serveur à l'envoi.

`raison` : `lecture`, `pause`, `position`, `film`, `fin`, `attente` (quelqu'un charge pendant la lecture : le salon
se met en pause), `attente-info` (la liste d'attente change), `lecture-attente` (lecture demandée pendant un
chargement : elle reprendra toute seule), `reprise` (tout le monde est prêt, la lecture reprend).

## Horloge

Le client envoie des `ping` (6 rapprochés à l'arrivée, puis toutes les 5 s). Pour chaque `pong` :
`rtt = t1 - t0`, `décalage = serveur + rtt/2 - t1` ; on retient l'échantillon au plus petit `rtt` parmi les 10
derniers. Heure serveur ≈ `Date.now() + décalage`.

## Rattrapage (client)

`écart = positionAttendue - currentTime` : si `|écart| > 1 s`, saut ; entre 0,3 et 1 s, vitesse 1,05 ou 0,95 jusqu'à
passer sous 0,1 s ; en pause, saut si `|écart| > 0,05 s`. Seules les commandes de l'interface envoient des messages :
appliquer un état reçu ne produit jamais de message (pas d'écho).

## Appel vidéo

Maillage : chaque participant ouvre une `RTCPeerConnection` avec chacun des autres (deux transceivers `audio` et
`video` `sendrecv`, pistes posées par `replaceTrack`, donc sans renégociation quand la caméra arrive plus tard).
« Perfect negotiation » : le participant dont l'identifiant est le plus grand est *polite*. Redémarrage ICE
(`restartIce`) sur `failed`, ou sur `disconnected` pendant plus de 4 s.
