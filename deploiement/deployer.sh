#!/usr/bin/env bash
# Déploie Canapé sur un serveur à soi (SSH, nginx). À lancer depuis le poste, depuis n'importe où :
#   deploiement/deployer.sh <utilisateur@serveur> [--domaine <nom>] [--essai]
# Idempotent : on peut le relancer à chaque mise à jour.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIBLE=""
DOMAINE=""
ESSAI=0
SSH_OPTS=${SSH_OPTS:-}          # options ssh supplémentaires, par exemple SSH_OPTS="-p 2222 -i ~/.ssh/vps"
PREPARATION='canape-deploiement' # dossier temporaire (dans le dossier personnel du serveur)

aide() {
  cat <<AIDE
Utilisation : $(basename "$0") <utilisateur@serveur> [--domaine <nom>] [--essai]

  <utilisateur@serveur>  compte SSH du serveur (il doit pouvoir utiliser sudo)
  --domaine <nom>        installe aussi le site nginx pour ce nom de domaine (HTTPS Let's Encrypt avec certbot)
  --essai                affiche ce qui serait fait, sans rien exécuter sur le serveur
  -h, --aide             affiche ce message

Variable : SSH_OPTS pour des options ssh (port, clé…), par exemple SSH_OPTS="-p 2222".
AIDE
}

echec() { echo "Erreur : $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--aide|--help) aide; exit 0 ;;
    --essai) ESSAI=1 ;;
    --domaine) [ $# -ge 2 ] || echec "--domaine demande un nom de domaine."; DOMAINE="$2"; shift ;;
    --domaine=*) DOMAINE="${1#--domaine=}" ;;
    -*) echo "Option inconnue : $1" >&2; aide >&2; exit 2 ;;
    *) [ -z "$CIBLE" ] || echec "un seul serveur à la fois (reçu « $CIBLE » et « $1 »)."; CIBLE="$1" ;;
  esac
  shift
done

[ -n "$CIBLE" ] || { aide >&2; exit 2; }
case "$CIBLE" in *@*) ;; *) echec "indiquez le serveur sous la forme utilisateur@serveur (reçu « $CIBLE »)." ;; esac
if [ -n "$DOMAINE" ]; then
  [[ "$DOMAINE" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ ]] || echec "« $DOMAINE » n'est pas un nom de domaine valide."
fi
for f in bin/canape src/serveur.js public/index.html package.json package-lock.json deploiement/canape.service deploiement/canape.conf.exemple deploiement/nginx/canape.conf; do
  [ -e "$RACINE/$f" ] || echec "fichier introuvable dans le dépôt : $f"
done

# ---------------------------------------------------------------------------------------------------------
# Script exécuté sur le serveur, en root (sudo bash). Reçoit le domaine (ou rien) en premier argument.
# ---------------------------------------------------------------------------------------------------------
script_distant() {
  cat <<'DISTANT'
set -euo pipefail
DOMAINE="${1:-}"
PREP="$2"
UTILISATEUR_SSH="${3:-}"
APP=/opt/canape
FILMS=/srv/canape/films
CONF=/etc/canape/canape.conf
etape() { printf '\n== %s\n' "$*"; }

etape "Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé. Canapé demande Node.js 18 ou plus. Sur Ubuntu/Debian :" >&2
  echo "  sudo apt install nodejs npm        (si la version proposée est trop ancienne : https://nodejs.org ou NodeSource)" >&2
  exit 1
fi
VERSION_NODE="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$VERSION_NODE" -lt 18 ]; then
  echo "Node.js $(node -v) est trop ancien : Canapé demande la version 18 ou plus." >&2
  echo "  Installez une version récente (https://nodejs.org ou NodeSource : https://github.com/nodesource/distributions), puis relancez." >&2
  exit 1
fi
command -v npm >/dev/null 2>&1 || { echo "npm manque : sudo apt install npm" >&2; exit 1; }
command -v rsync >/dev/null 2>&1 || { echo "rsync manque sur le serveur : sudo apt install rsync" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl manque sur le serveur : sudo apt install curl" >&2; exit 1; }
echo "Node.js $(node -v) : bon."
NODE_BIN="$(command -v node)"

etape "Utilisateur et dossiers"
if ! id canape >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin canape
  echo "Utilisateur système « canape » créé."
else
  echo "Utilisateur « canape » déjà présent."
fi
install -d -m 0755 -o root -g root "$APP"
install -d -m 2775 -o root -g canape /srv/canape "$FILMS"
chmod 2775 "$FILMS"; chown root:canape "$FILMS"
install -d -m 0750 -o root -g canape /etc/canape
if [ -n "$UTILISATEUR_SSH" ] && [ "$UTILISATEUR_SSH" != root ] && ! id -nG "$UTILISATEUR_SSH" | tr ' ' '\n' | grep -qx canape; then
  usermod -aG canape "$UTILISATEUR_SSH"
  echo "« $UTILISATEUR_SSH » ajouté au groupe canape : il pourra copier des films dans $FILMS (après une reconnexion SSH)."
fi

etape "Code dans $APP"
rsync -a --delete --exclude node_modules --exclude .git "$PREP/code/" "$APP/"
chown -R root:root "$APP"
( cd "$APP" && npm ci --omit=dev --no-audit --no-fund --loglevel=error )
ln -sf "$APP/bin/canape-convertir" /usr/local/bin/canape-convertir
chmod 0755 "$APP/bin/canape" "$APP/bin/canape-convertir"

etape "Réglages $CONF"
MOT_DE_PASSE_NOUVEAU=""
if [ -e "$CONF" ]; then
  echo "$CONF existe déjà : conservé tel quel (ni mot de passe ni secret regénérés)."
else
  MOT_DE_PASSE_NOUVEAU="$(LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' </dev/urandom | head -c 16 || true)"
  SECRET_NOUVEAU="$(LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64 || true)"
  install -m 0640 -o root -g canape "$APP/deploiement/canape.conf.exemple" "$CONF"
  sed -i "s|^CANAPE_MOT_DE_PASSE=.*|CANAPE_MOT_DE_PASSE=$MOT_DE_PASSE_NOUVEAU|; s|^CANAPE_SECRET=.*|CANAPE_SECRET=$SECRET_NOUVEAU|" "$CONF"
  echo "$CONF créé (droits 640, groupe canape)."
fi

etape "Service systemd"
sed "s|^ExecStart=.*|ExecStart=$NODE_BIN $APP/bin/canape|" "$APP/deploiement/canape.service" > /etc/systemd/system/canape.service
chmod 0644 /etc/systemd/system/canape.service
systemctl daemon-reload
systemctl enable canape >/dev/null 2>&1
systemctl restart canape
echo "Service canape redémarré."

if [ -n "$DOMAINE" ]; then
  etape "nginx pour $DOMAINE"
  command -v nginx >/dev/null 2>&1 || { echo "nginx n'est pas installé : sudo apt install nginx, puis relancez." >&2; exit 1; }
  if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then
    SITE=/etc/nginx/sites-available/canape.conf
    LIEN=/etc/nginx/sites-enabled/canape.conf
  else
    SITE=/etc/nginx/conf.d/canape.conf
    LIEN=""
  fi
  CERT="/etc/letsencrypt/live/$DOMAINE/fullchain.pem"
  GABARIT="$APP/deploiement/nginx/canape.conf"
  activer() { [ -z "$LIEN" ] || ln -sf "$SITE" "$LIEN"; }
  recharger() { nginx -t && systemctl reload nginx; }

  if [ ! -e "$CERT" ]; then
    # Pas encore de certificat : on pose d'abord le seul bloc HTTP (port 80), pour que certbot puisse valider le domaine.
    awk '{print} /^}/ {exit}' "$GABARIT" | sed "s/canape\.exemple\.fr/$DOMAINE/g" > "$SITE"
    activer; recharger
    if command -v certbot >/dev/null 2>&1; then
      certbot certonly --nginx -d "$DOMAINE" --deploy-hook "systemctl reload nginx"
    else
      echo "certbot n'est pas installé : le site n'est servi qu'en HTTP (port 80), sans HTTPS ni caméra." >&2
      echo "  Installez-le (sudo apt install certbot python3-certbot-nginx), puis relancez ce script avec --domaine $DOMAINE." >&2
    fi
  fi
  if [ -e "$CERT" ]; then
    sed "s/canape\.exemple\.fr/$DOMAINE/g" "$GABARIT" > "$SITE"
    activer; recharger
    echo "Site https://$DOMAINE installé, nginx rechargé."
  fi
fi

etape "Vérification"
PORT="$(sed -n 's/^CANAPE_PORT=\([0-9]*\).*/\1/p' "$CONF" | tail -1)"
PORT="${PORT:-8080}"
OK=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if REPONSE="$(curl -fsS "http://127.0.0.1:$PORT/api/etat" 2>/dev/null)"; then OK=1; break; fi
  sleep 1
done
if [ "$OK" = 1 ]; then
  echo "/api/etat répond : $REPONSE"
else
  echo "Le service ne répond pas sur 127.0.0.1:$PORT. Derniers messages :" >&2
  journalctl -u canape -n 20 --no-pager >&2 || true
  exit 1
fi
command -v ffprobe >/dev/null 2>&1 || echo "Conseil : sudo apt install ffmpeg (compatibilité des films et canape-convertir)."

if [ -n "$MOT_DE_PASSE_NOUVEAU" ]; then
  printf '\n************************************************************\n'
  printf ' Mot de passe du salon (affiché cette seule fois) : %s\n' "$MOT_DE_PASSE_NOUVEAU"
  printf ' Il est aussi dans %s (CANAPE_MOT_DE_PASSE).\n' "$CONF"
  printf '************************************************************\n'
fi
rm -rf "$PREP"
DISTANT
}

# ---------------------------------------------------------------------------------------------------------
# Les commandes
# ---------------------------------------------------------------------------------------------------------
# shellcheck disable=SC2206  # SSH_OPTS est volontairement découpée en mots
OPTS=($SSH_OPTS)
UTILISATEUR="${CIBLE%@*}"
RSYNC_FICHIERS=(bin src public package.json package-lock.json deploiement)

if [ "$ESSAI" = 1 ]; then
  echo "== Essai : rien n'est exécuté sur $CIBLE =="
  echo
  echo "1. Envoi du code (bin/ src/ public/ package*.json deploiement/) vers $CIBLE:$PREPARATION/code/ :"
  echo "   cd $RACINE && rsync -az --delete --relative -e 'ssh ${OPTS[*]:-}' ${RSYNC_FICHIERS[*]} $CIBLE:$PREPARATION/code/"
  echo
  echo "2. Envoi du script d'installation : ssh ${OPTS[*]:-} $CIBLE 'cat > $PREPARATION/distant.sh'"
  echo
  echo "3. Exécution sur le serveur, avec sudo (mot de passe demandé au besoin) :"
  echo "   ssh -t ${OPTS[*]:-} $CIBLE sudo bash $PREPARATION/distant.sh '${DOMAINE}' $PREPARATION $UTILISATEUR"
  echo
  echo "Contenu du script exécuté sur le serveur :"
  echo "------------------------------------------------------------"
  script_distant
  echo "------------------------------------------------------------"
  if [ -z "$DOMAINE" ]; then
    echo "Sans --domaine, nginx n'est pas touché."
  else
    echo "Avec --domaine $DOMAINE : site nginx installé, nginx -t, rechargement, certbot si présent."
  fi
  exit 0
fi

command -v rsync >/dev/null 2>&1 || echec "rsync est requis sur ce poste (sudo apt install rsync via pkexec, par exemple)."
command -v ssh >/dev/null 2>&1 || echec "ssh est requis sur ce poste."

echo "== Envoi du code vers $CIBLE =="
ssh "${OPTS[@]}" "$CIBLE" "rm -rf $PREPARATION && mkdir -p $PREPARATION/code"
( cd "$RACINE" && rsync -az --delete --relative -e "ssh ${OPTS[*]:-}" "${RSYNC_FICHIERS[@]}" "$CIBLE:$PREPARATION/code/" )
script_distant | ssh "${OPTS[@]}" "$CIBLE" "cat > $PREPARATION/distant.sh"

echo "== Installation sur le serveur (sudo : le mot de passe peut être demandé) =="
ssh -t "${OPTS[@]}" "$CIBLE" sudo bash "$PREPARATION/distant.sh" "'$DOMAINE'" "$PREPARATION" "$UTILISATEUR"
echo
echo "Terminé."
