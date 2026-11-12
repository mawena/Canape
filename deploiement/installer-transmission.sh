#!/usr/bin/env bash
# Installe et configure Transmission (transmission-daemon) pour Canapé, SUR le serveur, en root :
#   sudo /opt/canape/actuelle/deploiement/installer-transmission.sh [--essai] [--remplacer] [--port N] [--sans-canape]
# Lançable seule sur un serveur où Canapé est déjà installé (appelé aussi par installer-serveur.sh), idempotent :
# on peut le relancer sans rien casser (le mot de passe du RPC est gardé). Les torrents (publics et privés) sont
# alors téléchargés par Transmission, que les trackers privés acceptent ; WebTorrent ne sert plus qu'en secours.
#
# Ce que fait le script : apt-get install transmission-daemon ; arrêt du démon (il réécrit settings.json en
# s'arrêtant, tout ce qu'on y écrit pendant qu'il tourne serait perdu) ; settings.json (RPC sur 127.0.0.1 seulement,
# liste blanche 127.0.0.1, identifiant et mot de passe générés, umask 2, dossier des téléchargements, port des pairs,
# DHT/PEX/LPD laissés actifs pour les torrents publics : Transmission les coupe de lui-même pour les privés, pas de
# limite de ratio globale) ; debian-transmission dans le groupe canape ; dossier des téléchargements en 2770 ;
# CANAPE_TORRENT_MOTEUR et CANAPE_TRANSMISSION_* dans canape.conf ; redémarrage de Transmission puis de Canapé ;
# vérification que le RPC répond. nginx et le pare-feu ne sont jamais touchés : le port à ouvrir est seulement affiché.
set -euo pipefail

# Variables réservées aux essais (deploiement/essais/essai-transmission.sh) : chemins et commandes remplaçables par
# des faux, pour essayer sans root. En usage normal, elles ne sont pas définies.
SRV="${CANAPE_ESSAI_SRV:-/srv/canape}"
CONF="${CANAPE_ESSAI_CONF:-/etc/canape/canape.conf}"
TRDIR="${CANAPE_ESSAI_TRANSMISSION_DIR:-/etc/transmission-daemon}"
TRVAR="${CANAPE_ESSAI_TRANSMISSION_VAR:-/var/lib/transmission-daemon}"
SYSTEMD="${CANAPE_ESSAI_SYSTEMD_DIR:-/etc/systemd/system}"
APT="${CANAPE_ESSAI_APT:-apt-get}"
DPKG="${CANAPE_ESSAI_DPKG:-dpkg}"
SYSTEMCTL="${CANAPE_ESSAI_SYSTEMCTL:-systemctl}"
CURL="${CANAPE_ESSAI_CURL:-curl}"
SANS_ROOT="${CANAPE_ESSAI_SANS_ROOT:-0}"          # 1 = ni utilisateur système ni chown (essais)
ATTENTE="${CANAPE_ESSAI_ATTENTE:-30}"             # secondes d'attente de la réponse du RPC
RPC_PORT="${CANAPE_ESSAI_RPC_PORT:-9091}"
DEFAUT_PAIRS=51413
MARQUEUR="$TRDIR/canape.gere"

ESSAI=0
REMPLACER=0
SANS_CANAPE=0
PORT_PAIRS=""

aide() {
  cat <<AIDE
Utilisation : sudo $(basename "$0") [--essai] [--remplacer] [--port <N>] [--sans-canape]

Installe et configure Transmission pour Canapé (voir l'en-tête du script).

  --essai        affiche ce qui serait fait, sans rien modifier (root inutile)
  --remplacer    accepte de remplacer la configuration d'un Transmission déjà installé et réglé par quelqu'un
                 d'autre (l'ancien settings.json est gardé à côté, en .avant-canape-<date>)
  --port <N>     port des pairs (celui de CANAPE_TORRENT_PORT dans $CONF, sinon $DEFAUT_PAIRS)
  --sans-canape  ne redémarre pas Canapé à la fin
  -h, --aide     affiche ce message
AIDE
}

echec() { echo "Erreur : $*" >&2; exit 1; }
etape() { printf '\n== %s\n' "$*"; }
en_essai() { [ "$ESSAI" = 1 ]; }
en_root() { [ "$SANS_ROOT" != 1 ]; }
agir() { if en_essai; then printf '  [essai] %s\n' "$*"; else "$@"; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--aide|--help) aide; exit 0 ;;
    --essai) ESSAI=1 ;;
    --remplacer) REMPLACER=1 ;;
    --sans-canape) SANS_CANAPE=1 ;;
    --port) [ $# -ge 2 ] || echec "--port demande un numéro."; PORT_PAIRS="$2"; shift ;;
    --port=*) PORT_PAIRS="${1#--port=}" ;;
    *) echo "Option inconnue : $1" >&2; aide >&2; exit 2 ;;
  esac
  shift
done
if [ -n "$PORT_PAIRS" ]; then
  [[ "$PORT_PAIRS" =~ ^[0-9]+$ ]] && [ "$PORT_PAIRS" -ge 1024 ] && [ "$PORT_PAIRS" -le 65535 ] || echec "--port doit être un nombre entre 1024 et 65535."
fi

en_essai && echo "== Essai : rien n'est modifié =="

# ---------------------------------------------------------------------------------------------------------
etape "Vérifications"
if ! en_essai && en_root && [ "$(id -u)" != 0 ]; then echec "à lancer en root (sudo $0)."; fi
command -v python3 >/dev/null 2>&1 || echec "python3 est nécessaire pour écrire settings.json (apt-get install python3)."
[ -e "$CONF" ] || echec "$CONF est introuvable : Canapé n'est pas installé (deploiement/installer-serveur.sh)."
if en_root; then id canape >/dev/null 2>&1 || echec "l'utilisateur « canape » n'existe pas : Canapé n'est pas installé."; fi
conf_valeur() { sed -n "s/^$1=//p" "$CONF" | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"; }
if [ -z "$PORT_PAIRS" ]; then PORT_PAIRS="$(conf_valeur CANAPE_TORRENT_PORT)"; fi
case "$PORT_PAIRS" in ''|0) PORT_PAIRS=$DEFAUT_PAIRS ;; esac
[[ "$PORT_PAIRS" =~ ^[0-9]+$ ]] || echec "CANAPE_TORRENT_PORT n'est pas un numéro de port valide dans $CONF."
echo "Port des pairs : $PORT_PAIRS ; dossier des téléchargements : $SRV/telechargements ; RPC : 127.0.0.1:$RPC_PORT"

installe() { "$DPKG" -s transmission-daemon 2>/dev/null | grep -q '^Status: install ok installed'; }
JOURNEE="$(date +%Y%m%d-%H%M%S)"

# Un Transmission déjà installé et réglé par quelqu'un d'autre n'est jamais modifié sans confirmation explicite.
# « Réglé par quelqu'un d'autre » : pas notre marqueur, et des réglages différents de ceux d'une installation neuve
# (ou des torrents déjà présents).
a_nous=0
[ -e "$MARQUEUR" ] && a_nous=1
if installe && [ "$a_nous" = 0 ] && [ -e "$TRDIR/settings.json" ]; then
  touche="$(python3 - "$TRDIR/settings.json" "$TRVAR" <<'PY'
import json, os, sys
try:
    s = json.load(open(sys.argv[1]))
except Exception:
    print("réglages illisibles"); sys.exit()
neuf = {"download-dir": "/var/lib/transmission-daemon/downloads", "rpc-port": 9091, "rpc-authentication-required": False, "peer-port": 51413}
raisons = [f"{k} = {s.get(k)!r}" for k, v in neuf.items() if s.get(k, v) != v]
torrents = os.path.join(sys.argv[2], ".config", "transmission-daemon", "torrents")
if os.path.isdir(torrents) and any(f.endswith(".torrent") or f.endswith(".magnet") for f in os.listdir(torrents)):
    raisons.append("des torrents y sont déjà")
print("; ".join(raisons))
PY
)"
  if [ -n "$touche" ] && [ "$REMPLACER" != 1 ]; then
    echo "Transmission est déjà installé et réglé par quelqu'un d'autre ($touche)." >&2
    echo "Rien n'a été modifié. Canapé a besoin de ses propres réglages (RPC avec mot de passe, umask 2, dossier $SRV/telechargements, groupe canape)." >&2
    echo "Si Transmission ne sert qu'à Canapé, relancez avec --remplacer : l'ancien settings.json est gardé à côté (settings.json.avant-canape-<date>)." >&2
    echo "Sinon, gardez-le tel quel et réglez CANAPE_TRANSMISSION_URL / _UTILISATEUR / _MOT_DE_PASSE dans $CONF vous-même." >&2
    exit 3
  fi
fi

# ---------------------------------------------------------------------------------------------------------
etape "Paquet transmission-daemon"
if installe; then
  echo "transmission-daemon est déjà installé ($("$DPKG" -s transmission-daemon | sed -n 's/^Version: //p'))."
else
  agir env DEBIAN_FRONTEND=noninteractive "$APT" install -y transmission-daemon
  # Le démon démarre dès l'installation ; il est arrêté plus bas avant d'écrire ses réglages.
fi
en_essai || [ -e "$TRDIR" ] || mkdir -p "$TRDIR"
en_essai || { [ -e "$MARQUEUR" ] || echo "Réglé par Canapé (deploiement/installer-transmission.sh) le $JOURNEE." > "$MARQUEUR"; }
en_essai && echo "  [essai] marqueur $MARQUEUR écrit"

# ---------------------------------------------------------------------------------------------------------
etape "Arrêt de Transmission (il réécrit settings.json en s'arrêtant)"
agir "$SYSTEMCTL" stop transmission-daemon || true

# ---------------------------------------------------------------------------------------------------------
etape "Identifiants du RPC et réglages (dans $CONF)"
UTILISATEUR="$(conf_valeur CANAPE_TRANSMISSION_UTILISATEUR)"
MOTDEPASSE="$(conf_valeur CANAPE_TRANSMISSION_MOT_DE_PASSE)"
[ -n "$UTILISATEUR" ] || UTILISATEUR=canape
if [ -z "$MOTDEPASSE" ]; then
  if en_essai; then MOTDEPASSE="<mot-de-passe-généré>"
  else MOTDEPASSE="$(head -c 256 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 32)"; fi
  echo "Mot de passe du RPC généré (32 caractères, écrit dans $CONF)."
else
  echo "Identifiant et mot de passe du RPC déjà dans $CONF : gardés."
fi
conf_poser() { # remplace la ligne active CLÉ=… ou l'ajoute
  if en_essai; then echo "  [essai] $CONF : $1=$([ "$1" = CANAPE_TRANSMISSION_MOT_DE_PASSE ] && echo '<masqué>' || echo "$2")"; return; fi
  if grep -q "^$1=" "$CONF"; then
    CLE="$1" VAL="$2" python3 - "$CONF" <<'PY'
import os, sys
cle, val, chemin = os.environ["CLE"], os.environ["VAL"], sys.argv[1]
lignes = open(chemin).read().split("\n")
sortie, fait = [], False
for l in lignes:
    if l.startswith(cle + "="):
        if not fait: sortie.append(f"{cle}={val}"); fait = True
    else:
        sortie.append(l)
open(chemin, "w").write("\n".join(sortie))
PY
  else
    [ -z "$(tail -c1 "$CONF")" ] || echo >> "$CONF"
    printf '%s=%s\n' "$1" "$2" >> "$CONF"
  fi
}
conf_poser CANAPE_TORRENT_MOTEUR transmission
conf_poser CANAPE_TRANSMISSION_URL "http://127.0.0.1:$RPC_PORT/transmission/rpc"
conf_poser CANAPE_TRANSMISSION_UTILISATEUR "$UTILISATEUR"
conf_poser CANAPE_TRANSMISSION_MOT_DE_PASSE "$MOTDEPASSE"
conf_poser CANAPE_TORRENT_PORT "$PORT_PAIRS"
grep -q '^CANAPE_TELECHARGEMENTS=' "$CONF" 2>/dev/null || conf_poser CANAPE_TELECHARGEMENTS "$SRV/telechargements"
DOSSIER_TELECHARGEMENTS="$(conf_valeur CANAPE_TELECHARGEMENTS)"
[ -n "$DOSSIER_TELECHARGEMENTS" ] || DOSSIER_TELECHARGEMENTS="$SRV/telechargements"

etape "settings.json"
if en_essai; then
  echo "  [essai] $TRDIR/settings.json sauvegardé (.avant-canape-$JOURNEE si ce n'est pas le nôtre), puis réglé :"
  echo "  [essai]   rpc-bind-address 127.0.0.1, rpc-port $RPC_PORT, rpc-whitelist 127.0.0.1 (activée), rpc-authentication-required, rpc-username $UTILISATEUR, rpc-password <masqué>"
  echo "  [essai]   umask 2, download-dir $DOSSIER_TELECHARGEMENTS, incomplete-dir désactivé, peer-port $PORT_PAIRS (fixe)"
  echo "  [essai]   dht-enabled / pex-enabled / lpd-enabled actifs, ratio-limit-enabled false, idle-seeding-limit-enabled false"
else
  [ -e "$TRDIR/settings.json" ] || echo '{}' > "$TRDIR/settings.json"
  if [ "$a_nous" = 0 ] && [ ! -e "$TRDIR/settings.json.avant-canape-$JOURNEE" ]; then
    cp -p "$TRDIR/settings.json" "$TRDIR/settings.json.avant-canape-$JOURNEE"
    echo "Ancien settings.json gardé : $TRDIR/settings.json.avant-canape-$JOURNEE"
  fi
  CANAPE_RPC_UTILISATEUR="$UTILISATEUR" CANAPE_RPC_MOT_DE_PASSE="$MOTDEPASSE" python3 - "$TRDIR/settings.json" "$RPC_PORT" "$PORT_PAIRS" "$DOSSIER_TELECHARGEMENTS" <<'PY'
import json, os, sys
chemin, rpc, pairs, dossier = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
try:
    s = json.load(open(chemin))
except Exception:
    s = {}
s.update({
    "rpc-enabled": True, "rpc-bind-address": "127.0.0.1", "rpc-port": rpc, "rpc-url": "/transmission/",
    "rpc-whitelist-enabled": True, "rpc-whitelist": "127.0.0.1",
    "rpc-authentication-required": True, "rpc-username": os.environ["CANAPE_RPC_UTILISATEUR"],
    "rpc-password": os.environ["CANAPE_RPC_MOT_DE_PASSE"],
    "umask": 2, "download-dir": dossier, "incomplete-dir-enabled": False,
    "peer-port": pairs, "peer-port-random-on-start": False,
    "dht-enabled": True, "pex-enabled": True, "lpd-enabled": True,
    "ratio-limit-enabled": False, "idle-seeding-limit-enabled": False,
    "start-added-torrents": True, "watch-dir-enabled": False, "script-torrent-done-enabled": False,
})
with open(chemin, "w") as f:
    json.dump(s, f, indent=4, sort_keys=True)
    f.write("\n")
PY
  if en_root; then chown debian-transmission:debian-transmission "$TRDIR/settings.json" 2>/dev/null || true; fi
  chmod 0600 "$TRDIR/settings.json"
  echo "$TRDIR/settings.json écrit (droits 600)."
fi

# ---------------------------------------------------------------------------------------------------------
etape "Groupe canape et dossier des téléchargements"
if en_root; then
  if id debian-transmission >/dev/null 2>&1 || en_essai; then
    if id -nG debian-transmission 2>/dev/null | tr ' ' '\n' | grep -qx canape; then
      echo "debian-transmission est déjà dans le groupe canape."
    else
      agir usermod -aG canape debian-transmission
      en_essai || echo "debian-transmission ajouté au groupe canape."
    fi
  else
    echo "L'utilisateur debian-transmission n'existe pas : le paquet l'a-t-il créé ?" >&2
  fi
  if en_essai; then echo "  [essai] $DOSSIER_TELECHARGEMENTS : mode 2770, propriétaire canape:canape"
  else install -d -m 2770 -o canape -g canape "$DOSSIER_TELECHARGEMENTS" && chmod 2770 "$DOSSIER_TELECHARGEMENTS"; fi
else
  agir install -d -m 2770 "$DOSSIER_TELECHARGEMENTS"
  en_essai || chmod 2770 "$DOSSIER_TELECHARGEMENTS"
fi
en_essai || echo "$DOSSIER_TELECHARGEMENTS en 2770 (groupe canape) : Transmission y écrit, Canapé y lit et y fait ses liens physiques."
if [ -r /proc/sys/fs/protected_hardlinks ] && [ "$(cat /proc/sys/fs/protected_hardlinks)" = 1 ]; then
  echo "fs.protected_hardlinks=1 : Canapé fait ses liens physiques grâce au groupe (lecture et écriture sur les fichiers, umask 2)."
fi

# ---------------------------------------------------------------------------------------------------------
etape "Canapé démarre après Transmission"
DROPIN="$SYSTEMD/canape.service.d"
if en_essai; then
  echo "  [essai] $DROPIN/transmission.conf : After= et Wants=transmission-daemon.service, puis daemon-reload"
else
  mkdir -p "$DROPIN"
  printf '# Géré par Canapé (deploiement/installer-transmission.sh)\n[Unit]\nAfter=transmission-daemon.service\nWants=transmission-daemon.service\n' > "$DROPIN/transmission.conf"
  chmod 0644 "$DROPIN/transmission.conf"
  "$SYSTEMCTL" daemon-reload
  echo "$DROPIN/transmission.conf écrit."
fi

# ---------------------------------------------------------------------------------------------------------
etape "Redémarrage de Transmission, puis de Canapé"
agir "$SYSTEMCTL" enable transmission-daemon || true
agir "$SYSTEMCTL" restart transmission-daemon

rpc_repond() { # session-get avec identifiant de session et authentification
  local url="http://127.0.0.1:$RPC_PORT/transmission/rpc" sid
  sid="$("$CURL" -s --max-time 3 -u "$UTILISATEUR:$MOTDEPASSE" -D - -o /dev/null "$url" 2>/dev/null | tr -d '\r' | sed -n 's/^[Xx]-[Tt]ransmission-[Ss]ession-[Ii]d: //p' | head -1)"
  [ -n "$sid" ] || return 1
  "$CURL" -s --max-time 3 -u "$UTILISATEUR:$MOTDEPASSE" -H "X-Transmission-Session-Id: $sid" -d '{"method":"session-get","arguments":{"fields":["version"]}}' "$url" 2>/dev/null | grep -q '"result":"success"'
}
if en_essai; then
  echo "  [essai] attente (au plus ${ATTENTE} s) de la réponse du RPC sur 127.0.0.1:$RPC_PORT"
else
  ok=0
  for _ in $(seq 1 "$ATTENTE"); do
    if rpc_repond; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" = 1 ]; then echo "Le RPC de Transmission répond."
  else echo "Le RPC de Transmission ne répond pas : voir « journalctl -u transmission-daemon -n 50 » (et $TRDIR/settings.json)." >&2; exit 1; fi
fi
if [ "$SANS_CANAPE" = 1 ]; then
  echo "Canapé n'est pas redémarré (--sans-canape) : « sudo systemctl restart canape » pour qu'il lise ses nouveaux réglages."
elif en_essai; then
  echo "  [essai] systemctl restart canape (s'il tourne)"
elif "$SYSTEMCTL" is-active --quiet canape 2>/dev/null; then
  "$SYSTEMCTL" restart canape
  echo "Canapé redémarré."
else
  echo "Canapé ne tourne pas : il lira ses nouveaux réglages à son démarrage."
fi

# ---------------------------------------------------------------------------------------------------------
echo
echo "Terminé : Transmission pilote maintenant tous les torrents de Canapé."
echo
echo "À FAIRE par vous : ouvrir le port des pairs dans le pare-feu du serveur (il n'a pas été ouvert) :"
echo "  $PORT_PAIRS en TCP et en UDP, entrant (sans ça, peu de pairs vous joignent et le partage des torrents privés est faible)."
echo "  Exemple avec ufw :  sudo ufw allow $PORT_PAIRS/tcp && sudo ufw allow $PORT_PAIRS/udp"
echo "  Pare-feu du fournisseur (OVH, Hetzner…) : même règle dans son tableau de bord."
echo "Le RPC (port $RPC_PORT) n'écoute qu'en local ; ne l'ouvrez pas."
