#!/usr/bin/env bash
# Installe (ou met à jour, ou désinstalle) Canapé SUR le serveur, en root, depuis un clone du dépôt :
#   git clone https://github.com/mawena/Canape.git ~/Canape && cd ~/Canape
#   sudo ./deploiement/installer-serveur.sh --domaine canape.exemple.fr [--port N] [--node /chemin/node] [--essai]
#   sudo ./deploiement/installer-serveur.sh --desinstaller --domaine canape.exemple.fr
# Idempotent : on le relance à chaque mise à jour (git pull, puis la même commande).
#
# Prudence : le serveur peut héberger d'autres sites. Rien n'est modifié dans nginx avant que « nginx -t » passe sur
# la configuration actuelle ; si la nouvelle configuration est refusée, l'état d'avant est remis exactement et nginx
# n'est jamais rechargé dans un état invalide. nginx n'est jamais redémarré (seulement « reload »), Node.js n'est
# jamais installé ni remplacé.
set -euo pipefail

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP=/opt/canape
FILMS=/srv/canape/films
UNITE=/etc/systemd/system/canape.service
LIEN_CONVERTIR=/usr/local/bin/canape-convertir
MARQUEUR='# Géré par Canapé (deploiement/installer-serveur.sh)'

# Variables réservées aux essais (deploiement/essais/essai-nginx.sh) : chemins et commandes remplaçables par des faux,
# pour essayer la partie nginx sans root. En usage normal, elles ne sont pas définies.
CONF="${CANAPE_ESSAI_CONF:-/etc/canape/canape.conf}"
NGX="${CANAPE_ESSAI_NGINX_DIR:-/etc/nginx}"
LE="${CANAPE_ESSAI_LETSENCRYPT:-/etc/letsencrypt}"
NGINX="${CANAPE_ESSAI_NGINX:-nginx}"
SYSTEMCTL="${CANAPE_ESSAI_SYSTEMCTL:-systemctl}"
CERTBOT="${CANAPE_ESSAI_CERTBOT:-certbot}"
SS="${CANAPE_ESSAI_SS:-ss}"
GABARIT="${CANAPE_ESSAI_GABARIT:-$SOURCE/deploiement/nginx/canape.conf}"
NGINX_SEULEMENT="${CANAPE_ESSAI_NGINX_SEULEMENT:-0}"   # 1 = ne fait que la partie port + nginx (essais)

DOMAINE=""
PORT_DEMANDE=""
NODE_OPT=""
ESSAI=0
DESINSTALLER=0
PORT=8080
NODE_BIN=""
NPM_BIN=""
MOT_DE_PASSE_NOUVEAU=""
CERT_OBTENU=0
HTTP_SEUL=0

# État pour le retour arrière nginx
SAUVE=""
SITE=""
LIEN=""
SITE_EXISTAIT=0
LIEN_EXISTAIT=0
LIEN_CIBLE=""
NGINX_MODIFIE=0
NGINX_RECHARGE=0
PROBLEMES=0
AVERTISSEMENTS_AVANT=""
NODE_COPIE_DEPUIS=""

aide() {
  cat <<AIDE
Utilisation : sudo $(basename "$0") [--domaine <nom>] [--port <N>] [--node <chemin>] [--essai]
              sudo $(basename "$0") --desinstaller [--domaine <nom>] [--essai]

À lancer sur le serveur, en root (sudo), depuis un clone du dépôt. Le code est copié dans $APP : le clone
n'est jamais le code qui tourne.

  --domaine <nom>   installe aussi le site nginx de ce nom, avec un certificat Let's Encrypt (certbot)
  --port <N>        port local de Node (8080 par défaut, ou celui déjà inscrit dans $CONF)
  --node <chemin>   Node.js 18+ à utiliser, si « node » est introuvable pour root (nvm, par exemple)
  --desinstaller    retire le service, le site nginx et $APP ; garde $CONF et les films
  --essai           affiche ce qui serait fait, sans rien modifier (root inutile)
  -h, --aide        affiche ce message
AIDE
}

echec() { echo "Erreur : $*" >&2; exit 1; }
etape() { printf '\n== %s\n' "$*"; }
# Problème bloquant ; en --essai, on le signale et on continue le compte rendu.
probleme() {
  if [ "$ESSAI" = 1 ]; then
    printf '  [essai] bloquerait : %s\n' "$*" >&2
    PROBLEMES=1
    return 1
  fi
  echo "Erreur : $*" >&2
  exit 1
}
# Action qui modifie le système : exécutée, ou seulement décrite en --essai.
agir() {
  if [ "$ESSAI" = 1 ]; then printf '  [essai] %s\n' "$*"; else "$@"; fi
}
en_essai() { [ "$ESSAI" = 1 ]; }

# ---------------------------------------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--aide|--help) aide; exit 0 ;;
    --essai) ESSAI=1 ;;
    --desinstaller) DESINSTALLER=1 ;;
    --domaine) [ $# -ge 2 ] || echec "--domaine demande un nom de domaine."; DOMAINE="$2"; shift ;;
    --domaine=*) DOMAINE="${1#--domaine=}" ;;
    --port) [ $# -ge 2 ] || echec "--port demande un numéro."; PORT_DEMANDE="$2"; shift ;;
    --port=*) PORT_DEMANDE="${1#--port=}" ;;
    --node) [ $# -ge 2 ] || echec "--node demande le chemin de node."; NODE_OPT="$2"; shift ;;
    --node=*) NODE_OPT="${1#--node=}" ;;
    *) echo "Option inconnue : $1" >&2; aide >&2; exit 2 ;;
  esac
  shift
done

if [ -n "$DOMAINE" ]; then
  [[ "$DOMAINE" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ ]] || echec "« $DOMAINE » n'est pas un nom de domaine valide."
fi
if [ -n "$PORT_DEMANDE" ]; then
  [[ "$PORT_DEMANDE" =~ ^[0-9]+$ ]] && [ "$PORT_DEMANDE" -ge 1024 ] && [ "$PORT_DEMANDE" -le 65535 ] \
    || echec "« $PORT_DEMANDE » n'est pas un port valide (1024 à 65535)."
fi
if [ "$ESSAI" = 0 ] && [ "$NGINX_SEULEMENT" = 0 ] && [ "$(id -u)" != 0 ]; then
  echec "à lancer en root : sudo $0 $*"
fi
DOMAINE_RE="${DOMAINE//./\\.}"

# ---------------------------------------------------------------------------------------------------------
# Retour arrière nginx
# ---------------------------------------------------------------------------------------------------------
choisir_fichiers_nginx() {
  if [ -d "$NGX/sites-available" ] && [ -d "$NGX/sites-enabled" ]; then
    SITE="$NGX/sites-available/$DOMAINE.conf"
    LIEN="$NGX/sites-enabled/$DOMAINE.conf"
  else
    SITE="$NGX/conf.d/$DOMAINE.conf"
    LIEN=""
  fi
}

sauvegarder_etat_nginx() {
  SAUVE="$(mktemp -d)"
  SITE_EXISTAIT=0; LIEN_EXISTAIT=0; LIEN_CIBLE=""
  if [ -e "$SITE" ]; then cp -p "$SITE" "$SAUVE/site"; SITE_EXISTAIT=1; fi
  if [ -n "$LIEN" ] && [ -L "$LIEN" ]; then LIEN_EXISTAIT=1; LIEN_CIBLE="$(readlink "$LIEN")"; fi
}

restaurer_nginx() {
  set +e
  echo "Retour arrière : nginx est remis dans l'état d'avant." >&2
  if [ "$SITE_EXISTAIT" = 1 ]; then cp -p "$SAUVE/site" "$SITE"; else rm -f "$SITE"; fi
  if [ -n "$LIEN" ]; then
    if [ "$LIEN_EXISTAIT" = 1 ]; then ln -sfn "$LIEN_CIBLE" "$LIEN"; else rm -f "$LIEN"; fi
  fi
  rm -f "$SITE".tmp.*
  if "$NGINX" -t >/dev/null 2>&1; then
    echo "nginx -t repasse : la configuration d'avant est rétablie." >&2
    # On ne recharge que si on avait déjà rechargé avec un état valide de Canapé (bloc provisoire) : il faut l'enlever.
    if [ "$NGINX_RECHARGE" = 1 ]; then
      "$SYSTEMCTL" reload nginx && NGINX_RECHARGE=0 && echo "nginx rechargé sans Canapé." >&2
    fi
  else
    echo "ATTENTION : nginx -t échoue encore après le retour arrière. Le problème ne vient pas du fichier de Canapé :" >&2
    "$NGINX" -t >&2
  fi
  NGINX_MODIFIE=0
}

sortie() {
  local code=$?
  trap - EXIT
  set +e
  if [ "$NGINX_MODIFIE" = 1 ] && [ "$code" -ne 0 ]; then restaurer_nginx; fi
  if [ -n "$SAUVE" ]; then rm -rf "$SAUVE"; fi
  exit "$code"
}
trap sortie EXIT
trap 'exit 130' INT TERM

# nginx -t ; en cas d'échec montre pourquoi
tester_nginx() {
  local sortie_nginx
  if sortie_nginx="$("$NGINX" -t 2>&1)"; then return 0; fi
  printf '%s\n' "$sortie_nginx" >&2
  return 1
}

avertissements_nginx() { # lignes [warn] de « nginx -t », sans date ni pid, pour comparer avant/après
  "$NGINX" -t 2>&1 | sed -n -E 's/^(nginx: |[0-9\/]+ [0-9:]+ )?\[warn\] ([0-9]+#[0-9]+: (\*[0-9]+ )?)?//p' | sort -u || true
}

signaler_nouveaux_avertissements() {
  local apres nouveaux
  apres="$(avertissements_nginx)"
  nouveaux="$(comm -13 <(printf '%s\n' "$AVERTISSEMENTS_AVANT") <(printf '%s\n' "$apres") | sed '/^$/d')"
  if [ -n "$nouveaux" ]; then
    printf 'Nouveaux avertissements de nginx -t depuis la pose de Canapé :\n%s\n' "$nouveaux" | sed '2,$s/^/  /' >&2
  else
    echo "nginx -t : aucun nouvel avertissement."
  fi
}

recharger_nginx() {
  tester_nginx || return 1
  "$SYSTEMCTL" reload nginx
  NGINX_RECHARGE=1
}

# ---------------------------------------------------------------------------------------------------------
# Port
# ---------------------------------------------------------------------------------------------------------
lignes_port() { # lignes « ss -ltnp » dont le port local est $1
  "$SS" -H -ltnp 2>/dev/null | awk -v p="$1" '{n=split($4,a,":"); if (a[n]==p) print}' || true
}

port_libre_proche() { # premier port libre à partir de $1 (toute écoute existante, quelle que soit l'adresse, le rend occupé)
  local occupes p
  occupes="$("$SS" -H -ltn 2>/dev/null | awk '{n=split($4,a,":"); print a[n]}' | sort -un || true)"
  for ((p = $1; p < $1 + 500; p++)); do
    grep -qx "$p" <<<"$occupes" || { echo "$p"; return; }
  done
}

verifier_port() {
  local conf_port lignes pid libre
  conf_port="$(sed -n 's/^CANAPE_PORT=\([0-9]*\).*/\1/p' "$CONF" 2>/dev/null | tail -1 || true)"
  PORT="${PORT_DEMANDE:-${conf_port:-8080}}"
  if ! command -v "$SS" >/dev/null 2>&1; then
    echo "Port $PORT : « ss » introuvable, occupation non vérifiée." >&2
    return 0
  fi
  lignes="$(lignes_port "$PORT")"
  if [ -z "$lignes" ]; then echo "Port $PORT : libre."; return 0; fi
  pid="$("$SYSTEMCTL" show -p MainPID --value canape 2>/dev/null || true)"
  if [ -n "$pid" ] && [ "$pid" != 0 ] && grep -Eq "pid=$pid[,)]" <<<"$lignes"; then
    echo "Port $PORT : tenu par le service canape lui-même (mise à jour) : normal."
    return 0
  fi
  echo "Le port $PORT est déjà utilisé par un autre programme :" >&2
  printf '  %s\n' "$lignes" >&2
  # Premier déploiement sans --port : on choisit seul un port libre (8780 et suivants).
  if [ -z "$PORT_DEMANDE" ] && [ -z "$conf_port" ]; then
    libre="$(port_libre_proche 8780)"
    if [ -n "$libre" ]; then
      echo "Port $PORT occupé : Canapé prend le port libre $libre (écrit dans CANAPE_PORT)."
      PORT="$libre"
      return 0
    fi
  fi
  libre="$(port_libre_proche $((PORT + 1)))"
  probleme "port $PORT occupé. Relancez avec un port libre, par exemple :  sudo $0 --port ${libre:-8781}${DOMAINE:+ --domaine $DOMAINE}" || true
  return 0
}

# ---------------------------------------------------------------------------------------------------------
# nginx : vérifications préalables (rien n'est modifié)
# ---------------------------------------------------------------------------------------------------------
autres_fichiers_nginx() { # configuration nginx hors fichier de Canapé
  local f
  for f in "$NGX/nginx.conf" "$NGX"/conf.d/* "$NGX"/sites-enabled/*; do
    [ -f "$f" ] || continue
    [ "$(readlink -f "$f")" = "$(readlink -f "$SITE")" ] && continue
    printf '%s\n' "$f"
  done
}

ipv6_ailleurs() { # un autre site écoute-t-il déjà sur [::]:$1 ?
  local f
  while IFS= read -r f; do
    grep -Eq "(^|[;{}])[[:space:]]*listen[[:space:]]+\[::\]:$1([[:space:];]|\$)" "$f" && return 0
  done < <(autres_fichiers_nginx)
  return 1
}

preverifier_nginx() {
  choisir_fichiers_nginx
  if ! command -v "$NGINX" >/dev/null 2>&1; then
    probleme "nginx n'est pas installé. Installez-le (sudo apt install nginx) puis relancez." || return 0
    return 0
  fi
  # 1. La configuration actuelle doit déjà être valide : sinon le problème est antérieur à Canapé.
  if ! tester_nginx; then
    probleme "« nginx -t » échoue DÉJÀ avant toute modification de Canapé (message ci-dessus). Rien n'a été touché. Corrigez d'abord la configuration existante (sudo nginx -t), puis relancez." || return 0
  else
    echo "nginx -t : la configuration actuelle est valide (code de sortie 0)."
    AVERTISSEMENTS_AVANT="$(avertissements_nginx)"
    [ -z "$AVERTISSEMENTS_AVANT" ] || printf 'Avertissements déjà présents (ignorés, ils ne viennent pas de Canapé) :\n%s\n' "$AVERTISSEMENTS_AVANT" | sed 's/^/  /'
  fi
  # 2. Un fichier du même nom qui n'est pas le nôtre n'est jamais écrasé.
  if [ -e "$SITE" ] && ! grep -qF "$MARQUEUR" "$SITE"; then
    probleme "$SITE existe déjà et n'a pas été créé par Canapé (marqueur absent). Il n'est pas écrasé. Renommez-le ou supprimez-le vous-même si c'est voulu." || return 0
  fi
  if [ -n "$LIEN" ] && [ -e "$LIEN" -o -L "$LIEN" ] && [ "$(readlink -f "$LIEN")" != "$(readlink -f "$SITE")" ]; then
    probleme "$LIEN existe déjà et ne pointe pas sur $SITE. Il n'est pas écrasé." || return 0
  fi
  # 3. Un autre fichier ne doit pas déjà déclarer ce domaine.
  local f
  while IFS= read -r f; do
    if grep -Eiq "(^|[;{}])[[:space:]]*server_name([[:space:]]+[^;]*)?[[:space:]]$DOMAINE_RE([[:space:]]|;)" "$f"; then
      probleme "$f déclare déjà « server_name $DOMAINE » : ce n'est pas un fichier de Canapé (pas de marqueur), il n'est pas touché et rien n'est modifié. S'il est obsolète, retirez-le vous-même (par exemple : sudo rm $f, et le fichier visé dans sites-available si $f est un lien), vérifiez avec sudo nginx -t, puis relancez." || return 0
      break
    fi
  done < <(autres_fichiers_nginx)
  if ! command -v "$CERTBOT" >/dev/null 2>&1; then
    echo "Note : certbot n'est pas installé ; le site ne sera servi qu'en HTTP (sudo apt install certbot python3-certbot-nginx pour l'HTTPS)." >&2
  fi
}

# ---------------------------------------------------------------------------------------------------------
# nginx : pose du fichier de Canapé
# ---------------------------------------------------------------------------------------------------------
generer_site() { # $1 = http (premier bloc seulement) ou complet
  local p
  {
    printf '%s\n' "$MARQUEUR"
    if [ "$1" = http ]; then awk '{print} /^}/ {exit}' "$GABARIT"; else cat "$GABARIT"; fi
  } | sed -e "s/canape\.exemple\.fr/$DOMAINE/g" -e "s|CANAPE_PORT_A_REMPLACER|$PORT|g" -e "s|/etc/letsencrypt/|$LE/|g" > "$SITE.tmp.$$.0"
  # IPv6 : « listen [::]:N » seulement si un autre site écoute déjà ainsi. Sinon Canapé deviendrait, en IPv6, le site
  # par défaut de tous les autres domaines du serveur.
  for p in $(grep -oE 'listen[[:space:]]+\[::\]:[0-9]+' "$GABARIT" | grep -oE '[0-9]+$' | sort -u); do
    if ! ipv6_ailleurs "$p"; then
      sed -i -E "/^[[:space:]]*listen[[:space:]]+\[::\]:$p([[:space:];]|\$)/d" "$SITE.tmp.$$.0"
    fi
  done
  mv "$SITE.tmp.$$.0" "$SITE.tmp.$$"
}

poser_site() { # $1 = http | complet
  generer_site "$1"
  mv -f "$SITE.tmp.$$" "$SITE"
  if [ -n "$LIEN" ]; then ln -sfn "$SITE" "$LIEN"; fi
  if ! recharger_nginx; then
    echo "nginx refuse la configuration avec le fichier de Canapé ($1)." >&2
    restaurer_nginx
    exit 1
  fi
}

hook_recharge_existe() {
  grep -rqsi nginx "$LE/renewal-hooks/deploy" 2>/dev/null \
    || grep -qsiE '^(deploy_hook|renew_hook)[[:space:]]*=.*nginx' "$LE"/renewal/*.conf 2>/dev/null
}

installer_nginx() {
  etape "nginx pour $DOMAINE"
  local cert="$LE/live/$DOMAINE/fullchain.pem" cle="$LE/live/$DOMAINE/privkey.pem" hook=()
  if en_essai; then
    echo "  [essai] fichier $SITE${LIEN:+ + lien $LIEN}, sauvegardé avant pour un retour arrière ;"
    echo "  [essai] port Node $PORT dans proxy_pass ; lignes « listen [::]:… » gardées seulement si un autre site les a ;"
    if [ -e "$cert" ]; then echo "  [essai] certificat présent : fichier complet, nginx -t, systemctl reload nginx."
    else echo "  [essai] pas de certificat : bloc HTTP provisoire, nginx -t, reload, certbot certonly --nginx -d $DOMAINE, puis fichier complet."; fi
    return 0
  fi
  sauvegarder_etat_nginx
  NGINX_MODIFIE=1
  if [ ! -e "$cert" ] || [ ! -e "$cle" ]; then
    if command -v "$CERTBOT" >/dev/null 2>&1; then
      poser_site http   # pour que certbot valide le domaine par le port 80
      hook_recharge_existe || hook=(--deploy-hook "systemctl reload nginx")
      if ! "$CERTBOT" certonly --nginx -d "$DOMAINE" "${hook[@]}"; then
        echo "certbot a échoué (DNS ? port 80 joignable ?)." >&2
        restaurer_nginx
        exit 1
      fi
      CERT_OBTENU=1
    else
      poser_site http
      HTTP_SEUL=1
      NGINX_MODIFIE=0
      echo "certbot n'est pas installé : $DOMAINE n'est servi qu'en HTTP (port 80), sans HTTPS ni caméra." >&2
      echo "  Installez-le (sudo apt install certbot python3-certbot-nginx) puis relancez cette commande." >&2
      return 0
    fi
  fi
  poser_site complet
  NGINX_MODIFIE=0
  echo "Site https://$DOMAINE installé, nginx rechargé (reload)."
  signaler_nouveaux_avertissements
}

# ---------------------------------------------------------------------------------------------------------
# L'application
# ---------------------------------------------------------------------------------------------------------
version_node() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

verifier_noeud() {
  etape "Node.js"
  local src="" majeure o
  if [ -n "$NODE_OPT" ]; then
    # Node indiqué par l'utilisateur (nvm…) : il est COPIÉ dans $APP/node, car le service ne peut pas lire un home.
    [ -x "$NODE_OPT" ] || { probleme "$NODE_OPT n'est pas exécutable." || true; return 0; }
    src="$(readlink -f "$NODE_OPT")"
    majeure="$(version_node "$src")"
    if [ "$majeure" -lt 18 ]; then probleme "Node.js $("$src" -v) ($src) est trop ancien : Canapé demande la version 18 ou plus." || true; return 0; fi
    [ -d "$(dirname "$src")/../lib/node_modules/npm" ] || { probleme "npm est introuvable à côté de $src (attendu : $(dirname "$src")/../lib/node_modules/npm)." || true; return 0; }
    NODE_COPIE_DEPUIS="$src"
    NODE_BIN="$APP/node/bin/node"
    echo "Node.js $("$src" -v) ($src) : bon ; il sera copié dans $APP/node (le service ne lit pas les dossiers personnels)."
  elif [ -x "$APP/node/bin/node" ]; then
    NODE_BIN="$APP/node/bin/node"
    if [ "$(version_node "$NODE_BIN")" -lt 18 ]; then probleme "la copie $NODE_BIN est trop ancienne : relancez avec --node." || true; return 0; fi
    echo "Node.js $("$NODE_BIN" -v) : copie déjà présente dans $APP/node, réutilisée."
  else
    src="$(command -v node 2>/dev/null || true)"
    case "$src" in /home/*|/root/*) src="" ;; esac
    if [ -z "$src" ] || [ "$(version_node "$src")" -lt 18 ]; then
      local home_u cand
      home_u="$(getent passwd "${SUDO_USER:-}" 2>/dev/null | cut -d: -f6 || true)"
      echo "Aucun Node.js 18+ utilisable par root et par le service. Le script n'installe jamais Node.js lui-même (d'autres applications du serveur peuvent en dépendre)." >&2
      echo "Si Node.js est installé pour votre utilisateur (nvm…), indiquez-le : il sera copié dans $APP/node :" >&2
      echo "  sudo $0${DOMAINE:+ --domaine $DOMAINE}${PORT_DEMANDE:+ --port $PORT_DEMANDE} --node \"\$(command -v node)\"" >&2
      echo "(le \$(…) est évalué par votre shell, avant sudo.)" >&2
      for cand in "$home_u"/.nvm/versions/node/*/bin/node; do [ -x "$cand" ] && echo "  Trouvé : $cand" >&2; done
      probleme "Node.js introuvable pour root." || true
      return 0
    fi
    NODE_BIN="$(readlink -f "$src")"
    echo "Node.js $("$NODE_BIN" -v) ($NODE_BIN) : bon."
  fi
  if [ -x "$(dirname "$NODE_BIN")/npm" ]; then NPM_BIN="$(dirname "$NODE_BIN")/npm"
  elif [ -n "$NODE_COPIE_DEPUIS" ]; then NPM_BIN="$APP/node/bin/npm"
  else NPM_BIN="$(command -v npm 2>/dev/null || true)"; fi
  [ -n "$NPM_BIN" ] || { probleme "npm manque : sudo apt install npm" || true; return 0; }
  for o in rsync curl; do
    command -v "$o" >/dev/null 2>&1 || probleme "$o manque sur le serveur : sudo apt install $o" || true
  done
}

copier_noeud() { # copie node + npm dans $APP/node (rien d'autre : pas les paquets globaux)
  local src="$NODE_COPIE_DEPUIS" racine tmp="$APP/node.neuf"
  [ -n "$src" ] || return 0
  racine="$(cd "$(dirname "$src")/.." && pwd)"
  if en_essai; then echo "  [essai] copie de $src et de npm dans $APP/node (vérifie la version 18+ de la copie)"; return 0; fi
  rm -rf "$tmp"
  mkdir -p "$tmp/bin" "$tmp/lib/node_modules"
  cp "$src" "$tmp/bin/node"
  cp -a "$racine/lib/node_modules/npm" "$tmp/lib/node_modules/"
  ln -s ../lib/node_modules/npm/bin/npm-cli.js "$tmp/bin/npm"
  [ ! -e "$racine/lib/node_modules/npm/bin/npx-cli.js" ] || ln -s ../lib/node_modules/npm/bin/npx-cli.js "$tmp/bin/npx"
  chown -R root:root "$tmp"; chmod 0755 "$tmp/bin/node"
  if [ "$(version_node "$tmp/bin/node")" -lt 18 ]; then rm -rf "$tmp"; echo "Erreur : la copie de Node.js ne démarre pas en version 18+." >&2; exit 1; fi
  rm -rf "$APP/node"
  mv "$tmp" "$APP/node"
  echo "Node.js $("$APP/node/bin/node" -v) copié dans $APP/node."
}

installer_application() {
  local f
  for f in bin/canape src/serveur.js public/index.html package.json package-lock.json deploiement/canape.service deploiement/canape.conf.exemple deploiement/nginx/canape.conf; do
    [ -e "$SOURCE/$f" ] || echec "fichier introuvable dans le dépôt : $f (le script doit être lancé depuis un clone complet de Canapé)."
  done
  [ "$SOURCE" != "$APP" ] || echec "lancez ce script depuis un clone du dépôt (par exemple ~/Canape), pas depuis $APP : il est remplacé à chaque installation."

  etape "Utilisateur et dossiers"
  if ! id canape >/dev/null 2>&1; then
    agir useradd --system --user-group --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin canape
    en_essai || echo "Utilisateur système « canape » créé."
  else
    echo "Utilisateur « canape » déjà présent."
  fi
  agir install -d -m 0755 -o root -g root "$APP"
  if [ -d "$FILMS" ] && ! en_essai; then
    echo "$FILMS existe : les films ne sont pas touchés."
  fi
  agir install -d -m 2775 -o root -g canape /srv/canape "$FILMS"
  agir install -d -m 0750 -o root -g canape /etc/canape
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
    if ! id -nG "$SUDO_USER" 2>/dev/null | tr ' ' '\n' | grep -qx canape; then
      agir usermod -aG canape "$SUDO_USER"
      en_essai || echo "« $SUDO_USER » ajouté au groupe canape : il pourra copier des films dans $FILMS (après une reconnexion)."
    fi
  fi

  etape "Code dans $APP"
  agir rsync -a --delete --exclude /node --exclude /node.neuf --exclude node_modules --exclude .git "$SOURCE/" "$APP/"
  copier_noeud
  if en_essai; then
    echo "  [essai] chown -R root:root $APP ; (cd $APP && npm ci --omit=dev) avec $NPM_BIN ; lien $LIEN_CONVERTIR"
  else
    chown -R root:root "$APP"
    ( cd "$APP" && env PATH="$(dirname "$NODE_BIN"):$PATH" "$NPM_BIN" ci --omit=dev --no-audit --no-fund --loglevel=error )
    ln -sf "$APP/bin/canape-convertir" "$LIEN_CONVERTIR"
    chmod 0755 "$APP/bin/canape" "$APP/bin/canape-convertir"
  fi

  etape "Réglages $CONF"
  if [ -e "$CONF" ]; then
    echo "$CONF existe déjà : conservé (ni mot de passe ni secret regénérés)."
    local port_conf
    port_conf="$(sed -n 's/^CANAPE_PORT=\([0-9]*\).*/\1/p' "$CONF" | tail -1)"
    if [ "$port_conf" != "$PORT" ]; then
      if en_essai; then echo "  [essai] CANAPE_PORT=$PORT écrit dans $CONF (était : ${port_conf:-absent})"
      else
        if grep -q '^CANAPE_PORT=' "$CONF"; then sed -i "s|^CANAPE_PORT=.*|CANAPE_PORT=$PORT|" "$CONF"; else printf 'CANAPE_PORT=%s\n' "$PORT" >> "$CONF"; fi
        echo "CANAPE_PORT=$PORT écrit dans $CONF (était : ${port_conf:-absent})."
        [ -n "$DOMAINE" ] || echo "Le port a changé : relancez avec --domaine pour que le fichier nginx suive." >&2
      fi
    fi
  elif en_essai; then
    echo "  [essai] $CONF créé (droits 640, groupe canape), mot de passe et secret générés, CANAPE_PORT=$PORT"
  else
    MOT_DE_PASSE_NOUVEAU="$(LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' </dev/urandom | head -c 16 || true)"
    local secret
    secret="$(LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64 || true)"
    install -m 0640 -o root -g canape "$APP/deploiement/canape.conf.exemple" "$CONF"
    sed -i "s|^CANAPE_MOT_DE_PASSE=.*|CANAPE_MOT_DE_PASSE=$MOT_DE_PASSE_NOUVEAU|; s|^CANAPE_SECRET=.*|CANAPE_SECRET=$secret|; s|^CANAPE_PORT=.*|CANAPE_PORT=$PORT|" "$CONF"
    echo "$CONF créé (droits 640, groupe canape)."
  fi

  etape "Service systemd"
  if en_essai; then
    echo "  [essai] $UNITE écrit (ExecStart=$NODE_BIN $APP/bin/canape), daemon-reload, enable, restart canape."
  else
    sed "s|^ExecStart=.*|ExecStart=$NODE_BIN $APP/bin/canape|" "$APP/deploiement/canape.service" > "$UNITE"
    chmod 0644 "$UNITE"
    "$SYSTEMCTL" daemon-reload
    "$SYSTEMCTL" enable canape >/dev/null 2>&1
    "$SYSTEMCTL" restart canape
    en_essai || echo "Service canape redémarré."
  fi
}

verifier_service() {
  etape "Vérification"
  en_essai && { echo "  [essai] curl http://127.0.0.1:$PORT/api/etat (10 essais)"; return 0; }
  local reponse="" ok=0 i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if reponse="$(curl -fsS "http://127.0.0.1:$PORT/api/etat" 2>/dev/null)"; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" = 1 ]; then
    echo "/api/etat répond : $reponse"
  else
    echo "Le service ne répond pas sur 127.0.0.1:$PORT. Derniers messages :" >&2
    journalctl -u canape -n 20 --no-pager >&2 || true
    exit 1
  fi
  command -v ffprobe >/dev/null 2>&1 || echo "Conseil : sudo apt install ffmpeg (compatibilité des films et canape-convertir)."
}

# ---------------------------------------------------------------------------------------------------------
# Désinstallation
# ---------------------------------------------------------------------------------------------------------
desinstaller() {
  etape "Désinstallation de Canapé"
  if [ -n "$DOMAINE" ] && command -v "$NGINX" >/dev/null 2>&1; then
    choisir_fichiers_nginx
    if ! tester_nginx; then
      probleme "« nginx -t » échoue DÉJÀ avant toute modification (message ci-dessus). Rien n'a été touché. Corrigez d'abord nginx, puis relancez." || true
    fi
  fi
  if [ "$NGINX_SEULEMENT" = 0 ]; then
    if [ -e "$UNITE" ] || "$SYSTEMCTL" cat canape >/dev/null 2>&1; then
      agir "$SYSTEMCTL" disable --now canape || true
      agir rm -f "$UNITE"
      agir "$SYSTEMCTL" daemon-reload
      en_essai || echo "Service canape arrêté et retiré."
    else
      echo "Service canape : absent."
    fi
  fi
  if [ -n "$DOMAINE" ] && command -v "$NGINX" >/dev/null 2>&1; then
    if [ -e "$SITE" ] && ! grep -qF "$MARQUEUR" "$SITE"; then
      echo "$SITE n'a pas été créé par Canapé : laissé en place, nginx non touché." >&2
    elif [ -e "$SITE" ] || [ -L "${LIEN:-/nonexistent}" ]; then
      if en_essai; then
        echo "  [essai] retrait de $SITE${LIEN:+ et du lien $LIEN}, nginx -t, reload (retour arrière si nginx -t échoue)."
      else
        sauvegarder_etat_nginx
        NGINX_MODIFIE=1
        [ -z "$LIEN" ] || rm -f "$LIEN"
        rm -f "$SITE"
        if ! tester_nginx; then
          restaurer_nginx
          exit 1
        fi
        "$SYSTEMCTL" reload nginx
        NGINX_MODIFIE=0
        echo "Site nginx de $DOMAINE retiré, nginx rechargé (reload)."
      fi
    else
      echo "Site nginx de $DOMAINE : absent."
    fi
  elif [ -z "$DOMAINE" ]; then
    echo "Pas de --domaine : le site nginx n'est pas touché (relancez avec --domaine pour le retirer)."
  fi
  if [ "$NGINX_SEULEMENT" = 0 ]; then
    if [ -L "$LIEN_CONVERTIR" ] && [ "$(readlink "$LIEN_CONVERTIR")" = "$APP/bin/canape-convertir" ]; then agir rm -f "$LIEN_CONVERTIR"; fi
    agir rm -rf "$APP"
    en_essai || echo "$APP retiré."
  fi
  echo
  echo "Gardé volontairement :"
  echo "  - $(dirname "$CONF") (mot de passe et secret) : sudo rm -r $(dirname "$CONF")"
  echo "  - les films dans $FILMS (et l'utilisateur « canape ») : sudo rm -r /srv/canape ; sudo userdel canape"
  if [ -n "$DOMAINE" ]; then echo "  - le certificat Let's Encrypt : sudo certbot delete --cert-name $DOMAINE"; fi
}

# ---------------------------------------------------------------------------------------------------------
# Déroulement
# ---------------------------------------------------------------------------------------------------------
en_essai && echo "== Essai : rien n'est modifié =="

if [ "$DESINSTALLER" = 1 ]; then
  desinstaller
  exit 0
fi

if [ "$NGINX_SEULEMENT" = 0 ]; then verifier_noeud; fi
etape "Vérifications avant de toucher à quoi que ce soit"
verifier_port
if [ -n "$DOMAINE" ]; then preverifier_nginx; fi
if [ "$ESSAI" = 1 ] && [ "$PROBLEMES" = 1 ]; then echo; echo "Essai terminé : des problèmes ci-dessus bloqueraient l'installation."; fi

if [ "$NGINX_SEULEMENT" = 0 ]; then installer_application; fi
if [ -n "$DOMAINE" ]; then
  [ "$ESSAI" = 1 ] && [ "$PROBLEMES" = 1 ] && { echo "  [essai] nginx non touché tant que les problèmes ci-dessus ne sont pas réglés."; exit 0; }
  installer_nginx
else
  echo
  echo "Sans --domaine, nginx n'est pas touché. Node écoute sur 127.0.0.1:$PORT ; relancez avec --domaine pour le site HTTPS."
fi
if [ "$NGINX_SEULEMENT" = 0 ]; then verifier_service; fi

if [ -n "$MOT_DE_PASSE_NOUVEAU" ]; then
  printf '\n************************************************************\n'
  printf ' Mot de passe du salon (affiché cette seule fois) : %s\n' "$MOT_DE_PASSE_NOUVEAU"
  printf ' Il est aussi dans %s (CANAPE_MOT_DE_PASSE).\n' "$CONF"
  printf '************************************************************\n'
fi
if [ "$ESSAI" = 0 ] && [ -n "$DOMAINE" ]; then
  echo
  schema=https; [ "$HTTP_SEUL" = 1 ] && schema=http
  echo "Vérifiez : sudo nginx -t ; systemctl status canape ; curl -I $schema://$DOMAINE"
fi
echo
echo "Terminé."
