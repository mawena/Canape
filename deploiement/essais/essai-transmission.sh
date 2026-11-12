#!/usr/bin/env bash
# Essai rejouable, SANS root, de deploiement/installer-transmission.sh : --essai, première installation, relance
# (idempotente, mot de passe gardé), Transmission déjà réglé par quelqu'un d'autre (refus puis --remplacer), RPC muet.
# Faux apt-get, dpkg, systemctl, curl ; dossiers temporaires (chemins surchargés par variables CANAPE_ESSAI_*).
# Utilisation : deploiement/essais/essai-transmission.sh   (python3 nécessaire)
set -uo pipefail
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
command -v python3 >/dev/null || { echo "Il faut python3 pour cet essai." >&2; exit 2; }
T="$(mktemp -d)"; trap 'rm -rf "${T:?}"' EXIT
source "$RACINE/deploiement/essais/commun.sh"
SCRIPT="$RACINE/deploiement/installer-transmission.sh"
BIN="$T/bin"; mkdir -p "$BIN" "$T/etc/canape" "$T/tr" "$T/srv" "$T/systemd" "$T/var"
CONF="$T/etc/canape/canape.conf"
printf '# réglages\nCANAPE_PORT=8080\nCANAPE_TORRENT_PORT=\n' > "$CONF"

# Faux programmes : ils notent leurs appels ; dpkg répond « installé » si le fichier $T/installe existe.
cat > "$BIN/apt-get" <<SH
#!/bin/sh
echo "apt-get \$*" >> "$T/appels.log"; touch "$T/installe"; mkdir -p "$T/tr"; [ -e "$T/tr/settings.json" ] || echo '{"download-dir":"/var/lib/transmission-daemon/downloads","rpc-port":9091,"rpc-authentication-required":false,"peer-port":51413}' > "$T/tr/settings.json"
SH
cat > "$BIN/dpkg" <<SH
#!/bin/sh
[ -e "$T/installe" ] && { echo "Status: install ok installed"; echo "Version: 4.0.5-1"; exit 0; }
exit 1
SH
cat > "$BIN/systemctl" <<SH
#!/bin/sh
echo "systemctl \$*" >> "$T/appels.log"; exit 0
SH
# faux curl : si $T/rpc-muet existe, ne répond rien ; sinon imite le 409 puis le succès
cat > "$BIN/curl" <<SH
#!/bin/sh
[ -e "$T/rpc-muet" ] && exit 7
case "\$*" in *-D*) printf 'HTTP/1.1 409 Conflict\r\nX-Transmission-Session-Id: abc123\r\n\r\n' ;; *) echo '{"result":"success","arguments":{"version":"4.0.5"}}' ;; esac
SH
chmod +x "$BIN"/*
EXP=(CANAPE_ESSAI_SRV="$T/srv" CANAPE_ESSAI_CONF="$CONF" CANAPE_ESSAI_TRANSMISSION_DIR="$T/tr" CANAPE_ESSAI_TRANSMISSION_VAR="$T/var"
  CANAPE_ESSAI_SYSTEMD_DIR="$T/systemd" CANAPE_ESSAI_APT="$BIN/apt-get" CANAPE_ESSAI_DPKG="$BIN/dpkg" CANAPE_ESSAI_SYSTEMCTL="$BIN/systemctl"
  CANAPE_ESSAI_CURL="$BIN/curl" CANAPE_ESSAI_SANS_ROOT=1 CANAPE_ESSAI_ATTENTE=2)
lancer() { env "${EXP[@]}" "$SCRIPT" "$@" > "$T/sortie" 2>&1 < /dev/null; CODE=$?; }
reglage() { python3 -c "import json,sys; print(json.load(open('$T/tr/settings.json')).get('$1'))"; }
conf() { sed -n "s/^$1=//p" "$CONF" | tail -1; }

titre a "--essai : n'écrit rien"
lancer --essai
verifier "code 0, annonce l'essai" bash -c "[ $CODE = 0 ] && grep -q 'Essai : rien' '$T/sortie'"
verifier "décrit apt-get install, settings.json, redémarrage" bash -c "grep -q 'apt-get install -y transmission-daemon' '$T/sortie' && grep -q 'umask 2' '$T/sortie' && grep -q 'restart canape' '$T/sortie'"
verifier "ne touche à rien (pas d'appel, pas de settings, conf inchangée)" bash -c "[ ! -e '$T/appels.log' ] && [ ! -e '$T/tr/settings.json' ] && ! grep -q TRANSMISSION '$CONF' && [ ! -d '$T/srv/telechargements' ]"
verifier "annonce le port à ouvrir (51413, TCP et UDP), sans l'ouvrir" bash -c "grep -q '51413 en TCP et en UDP' '$T/sortie'"

titre b "première installation"
lancer
verifier "code 0, « Terminé »" bash -c "[ $CODE = 0 ] && grep -q '^Terminé' '$T/sortie'"
verifier "apt-get install transmission-daemon, arrêt avant l'écriture, redémarrage de Transmission puis de Canapé (dans cet ordre)" bash -c "grep -n . '$T/appels.log' | sed 's/^[0-9]*://' | tr '\n' '|' | grep -q 'apt-get install -y transmission-daemon|systemctl stop transmission-daemon|.*systemctl restart transmission-daemon|'"
verifier "settings.json : RPC sur 127.0.0.1, liste blanche, authentification, umask 2" bash -c "[ \"\$(python3 -c \"import json; s=json.load(open('$T/tr/settings.json')); print(s['rpc-bind-address'], s['rpc-whitelist'], s['rpc-whitelist-enabled'], s['rpc-authentication-required'], s['umask'])\")\" = '127.0.0.1 127.0.0.1 True True 2' ]"
verifier "settings.json : download-dir, incomplete-dir désactivé, port des pairs, DHT/PEX/LPD, pas de limite de ratio" bash -c "[ \"\$(python3 -c \"import json; s=json.load(open('$T/tr/settings.json')); print(s['download-dir'], s['incomplete-dir-enabled'], s['peer-port'], s['dht-enabled'], s['pex-enabled'], s['lpd-enabled'], s['ratio-limit-enabled'])\")\" = '$T/srv/telechargements False 51413 True True True False' ]"
verifier "settings.json en 600" bash -c "[ \"\$(stat -c %a '$T/tr/settings.json')\" = 600 ]"
verifier "canape.conf : moteur, URL, identifiant, mot de passe (32 caractères), port" bash -c "[ \"\$(grep -c '^CANAPE_TRANSMISSION_MOT_DE_PASSE=.\{32\}\$' '$CONF')\" = 1 ] && grep -q '^CANAPE_TORRENT_MOTEUR=transmission' '$CONF' && grep -q '^CANAPE_TRANSMISSION_UTILISATEUR=canape' '$CONF' && grep -q '^CANAPE_TRANSMISSION_URL=http://127.0.0.1:9091/transmission/rpc' '$CONF' && grep -q '^CANAPE_TORRENT_PORT=51413\$' '$CONF' && [ \"\$(grep -c '^CANAPE_TORRENT_PORT=' '$CONF')\" = 1 ]"
verifier "le mot de passe n'est pas affiché" bash -c "! grep -qF '$(conf CANAPE_TRANSMISSION_MOT_DE_PASSE)' '$T/sortie'"
verifier "dossier des téléchargements en 2770" bash -c "[ \"\$(stat -c %a '$T/srv/telechargements')\" = 2770 ]"
verifier "ordre systemd : Canapé après Transmission" bash -c "grep -q 'After=transmission-daemon.service' '$T/systemd/canape.service.d/transmission.conf'"
verifier "marqueur posé, pas de sauvegarde (Transmission neuf)" bash -c "[ -e '$T/tr/canape.gere' ] && ! ls '$T/tr' | grep -q avant-canape"
MDP="$(conf CANAPE_TRANSMISSION_MOT_DE_PASSE)"

titre c "relance : idempotente, mot de passe gardé, pas de doublon"
cp "$CONF" "$T/conf.avant"; : > "$T/appels.log"
lancer
verifier "code 0" code_nul
verifier "mot de passe inchangé, une seule ligne par clé" bash -c "[ '$(conf CANAPE_TRANSMISSION_MOT_DE_PASSE)' = '$MDP' ] && [ \"\$(grep -c '^CANAPE_TORRENT_MOTEUR=' '$CONF')\" = 1 ] && [ \"\$(grep -c '^CANAPE_TRANSMISSION_URL=' '$CONF')\" = 1 ]"
verifier "pas de réinstallation du paquet" bash -c "! grep -q 'apt-get' '$T/appels.log'"
verifier "settings.json réécrit avec le même mot de passe" bash -c "[ \"\$(python3 -c \"import json; print(json.load(open('$T/tr/settings.json'))['rpc-password'])\")\" = '$MDP' ]"

titre d "port choisi : --port 51999"
lancer --port 51999
verifier "peer-port et CANAPE_TORRENT_PORT à 51999, annonce du port" bash -c "[ '$(reglage peer-port)' = 51999 ] && [ '$(conf CANAPE_TORRENT_PORT)' = 51999 ] && grep -q '51999 en TCP et en UDP' '$T/sortie'"
lancer --port 80
verifier "port privilégié refusé" bash -c "[ $CODE != 0 ] && grep -q 'entre 1024 et 65535' '$T/sortie'"

titre e "Transmission déjà installé et réglé par quelqu'un d'autre"
rm -f "$T/tr/canape.gere" "$T/tr/settings.json.avant-canape-"*; : > "$T/appels.log"
echo '{"download-dir":"/mnt/disque/torrents","rpc-port":9091,"rpc-authentication-required":true,"rpc-username":"moi","peer-port":51413}' > "$T/tr/settings.json"
cp "$T/tr/settings.json" "$T/tr/avant.json"; cp "$CONF" "$T/conf.avant"
lancer
verifier "refus (code 3), explication, --remplacer proposé" bash -c "[ $CODE = 3 ] && grep -q 'réglé par quelqu' '$T/sortie' && grep -q -- '--remplacer' '$T/sortie'"
verifier "rien n'a bougé : réglages, conf, aucun arrêt ni redémarrage" bash -c "cmp -s '$T/tr/settings.json' '$T/tr/avant.json' && cmp -s '$CONF' '$T/conf.avant' && [ ! -s '$T/appels.log' ]"
lancer --remplacer
verifier "avec --remplacer : réglé, ancien fichier gardé" bash -c "[ $CODE = 0 ] && ls '$T/tr' | grep -q 'settings.json.avant-canape-' && [ '$(reglage download-dir)' = '$T/srv/telechargements' ]"
verifier "l'ancien contenu est dans la sauvegarde" bash -c "grep -q '/mnt/disque/torrents' '$T'/tr/settings.json.avant-canape-*"

titre f "Transmission neuf déjà installé (réglages d'usine) : pas de confirmation nécessaire"
rm -f "$T/tr/canape.gere" "$T"/tr/settings.json.avant-canape-*
echo '{"download-dir":"/var/lib/transmission-daemon/downloads","rpc-port":9091,"rpc-authentication-required":false,"peer-port":51413}' > "$T/tr/settings.json"
lancer
verifier "code 0 sans --remplacer" code_nul

titre g "le RPC ne répond pas après le redémarrage"
touch "$T/rpc-muet"
lancer
verifier "code 1 et message clair" bash -c "[ $CODE = 1 ] && grep -q 'ne répond pas' '$T/sortie' && grep -q journalctl '$T/sortie'"
rm -f "$T/rpc-muet"

titre h "Canapé absent"
mv "$CONF" "$CONF.x"
lancer
verifier "refuse : Canapé n'est pas installé" bash -c "[ $CODE != 0 ] && grep -q 'Canapé n.est pas installé' '$T/sortie'"
mv "$CONF.x" "$CONF"

printf '\n%d vérifications réussies, %d en échec.\n' "$NB_OK" "$NB_KO"
[ "$NB_KO" = 0 ]
