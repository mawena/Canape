#!/usr/bin/env bash
# Installe (ou met à niveau, ou désinstalle) Canapé 1.0 SUR le serveur, en root, à partir d'un PAQUET
# (canape-<version>.tar.gz, construit par scripts/paquet.sh et publié avec chaque release GitHub) :
#   sudo ./installer-serveur.sh --domaine canape.exemple.fr [--paquet canape-1.0.0.tar.gz] [--port N] [--node /chemin/node]
#   sudo ./installer-serveur.sh --desinstaller --domaine canape.exemple.fr
# Sans --paquet, le paquet de la DERNIÈRE release GitHub est téléchargé (son SHA256SUMS est vérifié) : rien n'est
# construit sur le serveur, ce qui épargne le processeur des autres sites. Fonctionne aussi pour la première
# installation et pour la mise à niveau depuis la 0.1 (mêmes dossiers, réglages migrés, base créée au démarrage).
# Idempotent : on peut le relancer. Après l'installation, les mises à jour courantes se font par
# deploiement/mettre-a-jour (à la main ou par le déploiement automatique), sans toucher à nginx.
#
# Prudence : le serveur peut héberger d'autres sites. Rien n'est modifié dans nginx avant que « nginx -t » passe sur
# la configuration actuelle ; si la nouvelle configuration est refusée, l'état d'avant est remis exactement et nginx
# n'est jamais rechargé dans un état invalide. nginx n'est jamais redémarré (seulement « reload »), Node.js n'est
# jamais installé ni remplacé (une copie de celui qu'on indique va dans /opt/canape/node).
set -euo pipefail

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPOT="${CANAPE_DEPOT:-mawena/Canape}"
MARQUEUR='# Géré par Canapé (deploiement/installer-serveur.sh)'
MARQUEUR_CLI='# Géré par Canapé (deploiement/installer-serveur.sh)'

# Variables réservées aux essais (deploiement/essais/*.sh) : chemins et commandes remplaçables par des faux, pour
# essayer sans root. En usage normal, elles ne sont pas définies.
APP="${CANAPE_ESSAI_APP:-/opt/canape}"
SRV="${CANAPE_ESSAI_SRV:-/srv/canape}"
FILMS="$SRV/films"
UNITE="${CANAPE_ESSAI_UNITE:-/etc/systemd/system/canape.service}"
CLI="${CANAPE_ESSAI_CLI:-/usr/local/bin/canape}"
LIEN_CONVERTIR="${CANAPE_ESSAI_LIEN_CONVERTIR:-/usr/local/bin/canape-convertir}"
CONF="${CANAPE_ESSAI_CONF:-/etc/canape/canape.conf}"
NGX="${CANAPE_ESSAI_NGINX_DIR:-/etc/nginx}"
LE="${CANAPE_ESSAI_LETSENCRYPT:-/etc/letsencrypt}"
NGINX="${CANAPE_ESSAI_NGINX:-nginx}"
SYSTEMCTL="${CANAPE_ESSAI_SYSTEMCTL:-systemctl}"
CERTBOT="${CANAPE_ESSAI_CERTBOT:-certbot}"
SS="${CANAPE_ESSAI_SS:-ss}"
CURL="${CANAPE_ESSAI_CURL:-curl}"
URL_RELEASE="${CANAPE_ESSAI_URL_RELEASE:-https://github.com/$DEPOT/releases/latest/download}"
GABARIT="${CANAPE_ESSAI_GABARIT:-}"                      # vide : celui du paquet
NGINX_SEULEMENT="${CANAPE_ESSAI_NGINX_SEULEMENT:-0}"     # 1 = ne fait que la partie port + nginx (essais)
SANS_ROOT="${CANAPE_ESSAI_SANS_ROOT:-0}"                 # 1 = ni utilisateur système ni chown (essais)
NODE_MIN="${CANAPE_ESSAI_NODE_MIN:-26}"

DOMAINE=""
PORT_DEMANDE=""
NODE_OPT=""
PAQUET_OPT=""
ESSAI=0
DESINSTALLER=0
PORT=8080
NODE_BIN=""
CERT_OBTENU=0
HTTP_SEUL=0
TMP_INSTALL=""          # dossier temporaire (paquet téléchargé, extraction partielle)
SRC="$SOURCE"           # arbre qui fournit deploiement/ (le paquet extrait, sinon le clone)
PAQUET=""               # fichier du paquet
SHA_PAQUET=""
VERSION_PAQUET=""
LEGACY=0                # 1 = installation 0.1 détectée
NODE_COPIE_DEPUIS=""
INVITATION=""

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

aide() {
  cat <<AIDE
Utilisation : sudo $(basename "$0") [--domaine <nom>] [--paquet <fichier>] [--port <N>] [--node <chemin>] [--essai]
              sudo $(basename "$0") --desinstaller [--domaine <nom>] [--essai]

À lancer sur le serveur, en root (sudo). Installe la version contenue dans un paquet, dans $APP/versions/.

  --domaine <nom>   installe aussi le site nginx de ce nom, avec un certificat Let's Encrypt (certbot)
  --paquet <fichier>  paquet canape-<version>.tar.gz à installer ; sans cette option, celui de la dernière release
                    GitHub ($DEPOT) est téléchargé, avec vérification de son SHA256SUMS
  --port <N>        port local de Node (8080 par défaut, ou celui déjà inscrit dans $CONF, ou un port libre)
  --node <chemin>   Node.js $NODE_MIN ou plus à utiliser (nvm, par exemple) : il est copié dans $APP/node
  --desinstaller    retire le service, le site nginx et $APP ; garde $CONF, les données et les films
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
en_root() { [ "$SANS_ROOT" != 1 ]; }
# install -d avec propriétaire seulement quand on est vraiment root.
dossier() { # mode proprio groupe chemin...
  local mode="$1" p="$2" g="$3"; shift 3
  if en_root; then agir install -d -m "$mode" -o "$p" -g "$g" "$@"; else agir install -d -m "$mode" "$@"; fi
}

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
    --paquet) [ $# -ge 2 ] || echec "--paquet demande le fichier du paquet."; PAQUET_OPT="$2"; shift ;;
    --paquet=*) PAQUET_OPT="${1#--paquet=}" ;;
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
if [ -n "$PAQUET_OPT" ] && [ ! -f "$PAQUET_OPT" ]; then echec "paquet introuvable : $PAQUET_OPT"; fi
if [ "$ESSAI" = 0 ] && [ "$NGINX_SEULEMENT" = 0 ] && [ "$SANS_ROOT" != 1 ] && [ "$(id -u)" != 0 ]; then
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
  if [ -n "$TMP_INSTALL" ]; then rm -rf "${TMP_INSTALL:?}"; fi
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
# ---------------------------------------------------------------------------------------------------------
# Node.js
# ---------------------------------------------------------------------------------------------------------
version_node() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

verifier_noeud() {
  etape "Node.js $NODE_MIN ou plus"
  local src="" majeure o
  NODE_BIN="$APP/node/bin/node"
  if [ -n "$NODE_OPT" ]; then
    # Node indiqué par l'utilisateur (nvm…) : il est COPIÉ dans $APP/node, car le service ne peut pas lire un home.
    [ -x "$NODE_OPT" ] || { probleme "$NODE_OPT n'est pas exécutable." || true; return 0; }
    src="$(readlink -f "$NODE_OPT")"
  elif [ -x "$APP/node/bin/node" ] && [ "$(version_node "$APP/node/bin/node")" -ge "$NODE_MIN" ]; then
    echo "Node.js $("$APP/node/bin/node" -v) : copie déjà présente dans $APP/node, réutilisée."
  else
    src="$(command -v node 2>/dev/null || true)"
    case "$src" in /home/*|/root/*) src="" ;; esac
    if [ -n "$src" ] && [ "$(version_node "$src")" -lt "$NODE_MIN" ]; then src=""; fi
    if [ -z "$src" ]; then
      local home_u cand
      home_u="$(getent passwd "${SUDO_USER:-}" 2>/dev/null | cut -d: -f6 || true)"
      if [ -x "$APP/node/bin/node" ]; then
        echo "La copie $APP/node/bin/node est en version $("$APP/node/bin/node" -v) : Canapé 1.0 demande Node.js $NODE_MIN ou plus (TypeScript exécuté directement)." >&2
      else
        echo "Aucun Node.js $NODE_MIN+ utilisable par root et par le service." >&2
      fi
      echo "Le script n'installe jamais Node.js lui-même (d'autres applications du serveur peuvent en dépendre)." >&2
      echo "Installez Node.js $NODE_MIN pour votre utilisateur (nvm install $NODE_MIN), puis indiquez-le : il sera copié dans $APP/node :" >&2
      echo "  sudo $0${DOMAINE:+ --domaine $DOMAINE}${PORT_DEMANDE:+ --port $PORT_DEMANDE} --node \"\$(command -v node)\"" >&2
      echo "(le \$(…) est évalué par votre shell, avant sudo.)" >&2
      for cand in "$home_u"/.nvm/versions/node/*/bin/node; do [ -x "$cand" ] && echo "  Trouvé : $cand ($("$cand" -v))" >&2; done
      probleme "Node.js $NODE_MIN+ introuvable pour root." || true
      return 0
    fi
  fi
  if [ -n "$src" ]; then
    majeure="$(version_node "$src")"
    if [ "$majeure" -lt "$NODE_MIN" ]; then probleme "Node.js $("$src" -v) ($src) est trop ancien : Canapé 1.0 demande la version $NODE_MIN ou plus." || true; return 0; fi
    NODE_COPIE_DEPUIS="$src"
    echo "Node.js $("$src" -v) ($src) : bon ; il sera copié dans $APP/node (le service ne lit pas les dossiers personnels)."
  fi
  for o in tar curl sha256sum flock; do
    command -v "$o" >/dev/null 2>&1 || probleme "$o manque sur le serveur : sudo apt install $([ "$o" = sha256sum ] && echo coreutils || ([ "$o" = flock ] && echo util-linux || echo "$o"))" || true
  done
}

copier_noeud() { # copie le seul binaire node dans $APP/node (npm n'est pas nécessaire : le paquet contient ses node_modules)
  local src="$NODE_COPIE_DEPUIS" tmp="$APP/node.neuf"
  [ -n "$src" ] || return 0
  if en_essai; then echo "  [essai] copie de $src dans $APP/node/bin/node (vérifie la version $NODE_MIN+ de la copie)"; return 0; fi
  rm -rf "${tmp:?}"
  mkdir -p "$tmp/bin"
  cp "$src" "$tmp/bin/node"
  en_root && chown -R root:root "$tmp"
  chmod 0755 "$tmp/bin/node"
  if [ "$(version_node "$tmp/bin/node")" -lt "$NODE_MIN" ]; then rm -rf "${tmp:?}"; echo "Erreur : la copie de Node.js ne démarre pas en version $NODE_MIN+." >&2; exit 1; fi
  rm -rf "${APP:?}/node"
  mv "$tmp" "$APP/node"
  echo "Node.js $("$APP/node/bin/node" -v) copié dans $APP/node."
}

# ---------------------------------------------------------------------------------------------------------
# Le paquet
# ---------------------------------------------------------------------------------------------------------
prefixe_tar() { # « ./ » si les entrées du paquet commencent ainsi (liste lue en entier : pas de SIGPIPE sous pipefail)
  local liste; liste="$(tar -tzf "$1" 2>/dev/null || true)"
  if grep -q '^\./' <<<"$liste"; then echo './'; fi
}

obtenir_paquet() {
  etape "Paquet de Canapé"
  TMP_INSTALL="$(mktemp -d)"
  if [ -n "$PAQUET_OPT" ]; then
    PAQUET="$PAQUET_OPT"
    echo "Paquet indiqué : $PAQUET"
  elif en_essai; then
    echo "  [essai] sans --paquet : téléchargement de $URL_RELEASE/SHA256SUMS puis du paquet qui y est nommé (vérifié par SHA-256)."
    return 0
  else
    echo "Pas de --paquet : téléchargement du paquet de la dernière release GitHub ($DEPOT). Rien n'est construit sur ce serveur."
    local sommes nom attendu
    "$CURL" -fsSL --max-time 60 -o "$TMP_INSTALL/SHA256SUMS" "$URL_RELEASE/SHA256SUMS" \
      || echec "impossible de télécharger $URL_RELEASE/SHA256SUMS (dépôt privé ? pas encore de release ?). Téléchargez le paquet ailleurs et passez-le avec --paquet <fichier>."
    sommes="$(grep -E '^[0-9a-f]{64} [ *]canape-[0-9][^ /]*\.tar\.gz$' "$TMP_INSTALL/SHA256SUMS" | head -1 || true)"
    [ -n "$sommes" ] || echec "SHA256SUMS ne nomme aucun paquet canape-<version>.tar.gz."
    attendu="${sommes%% *}"; nom="${sommes##* }"; nom="${nom#\*}"
    echo "Dernière release : $nom"
    "$CURL" -fSL --max-time 900 -o "$TMP_INSTALL/$nom" "$URL_RELEASE/$nom" || echec "téléchargement de $nom impossible."
    [ "$(sha256sum "$TMP_INSTALL/$nom" | cut -d' ' -f1)" = "$attendu" ] || echec "le SHA-256 de $nom ne correspond pas à SHA256SUMS : paquet refusé."
    PAQUET="$TMP_INSTALL/$nom"
    echo "SHA-256 vérifié d'après SHA256SUMS."
  fi
  SHA_PAQUET="$(sha256sum "$PAQUET" | cut -d' ' -f1)"
  # On n'extrait que VERSION et deploiement/ : les scripts, le service et le gabarit nginx viennent du paquet installé.
  local p; p="$(prefixe_tar "$PAQUET")"
  local liste; liste="$(tar -tzf "$PAQUET" 2>/dev/null)" || echec "$PAQUET n'est pas une archive tar.gz lisible."
  if grep -Eq '(^/|(^|/)\.\.(/|$))' <<<"$liste"; then echec "le paquet contient des chemins absolus ou « .. » : refusé."; fi
  mkdir "$TMP_INSTALL/paquet"
  tar -xzf "$PAQUET" -C "$TMP_INSTALL/paquet" --no-same-owner --no-same-permissions -- "${p}VERSION" "${p}deploiement" 2>/dev/null \
    || echec "le paquet n'a pas VERSION et deploiement/ (est-ce bien un paquet construit par scripts/paquet.sh ?)."
  SRC="$TMP_INSTALL/paquet"
  read -r VERSION_PAQUET _ < "$SRC/VERSION" || true
  [ -x "$SRC/deploiement/mettre-a-jour" ] || echec "le paquet n'a pas deploiement/mettre-a-jour exécutable."
  echo "Paquet : Canapé $(cat "$SRC/VERSION") — SHA-256 $SHA_PAQUET"
}

# ---------------------------------------------------------------------------------------------------------
# Réglages
# ---------------------------------------------------------------------------------------------------------
conf_definir() { # ajoute CLÉ=valeur si aucune ligne active ne définit déjà la clé
  grep -q "^$1=" "$CONF" 2>/dev/null || printf '%s=%s\n' "$1" "$2" >> "$CONF"
}

reglages() {
  etape "Réglages $CONF"
  local port_conf
  if [ -e "$CONF" ]; then
    port_conf="$(sed -n 's/^CANAPE_PORT=\([0-9]*\).*/\1/p' "$CONF" | tail -1)"
    if grep -qE '^(CANAPE_MOT_DE_PASSE|CANAPE_SECRET)=' "$CONF"; then
      if en_essai; then
        echo "  [essai] $CONF (réglages 0.1) : copie $CONF.pre-1.0, CANAPE_MOT_DE_PASSE et CANAPE_SECRET commentés (les comptes les remplacent),"
        echo "  [essai]   CANAPE_URL_PUBLIQUE, CANAPE_DONNEES, CANAPE_CACHE, CANAPE_TELEVERSEMENTS ajoutés ; port gardé (${port_conf:-8080})"
        return 0
      fi
      [ -e "$CONF.pre-1.0" ] || cp -p "$CONF" "$CONF.pre-1.0"
      sed -i -E 's/^(CANAPE_MOT_DE_PASSE=|CANAPE_SECRET=)/#(retiré en 1.0) \1/' "$CONF"
      echo "CANAPE_MOT_DE_PASSE et CANAPE_SECRET retirés (commentés) : les comptes les remplacent. Ancienne version gardée : $CONF.pre-1.0"
    else
      echo "$CONF existe déjà : conservé."
    fi
    if en_essai; then
      [ "$port_conf" = "$PORT" ] || echo "  [essai] CANAPE_PORT=$PORT écrit dans $CONF (était : ${port_conf:-absent})"
      return 0
    fi
    if [ "$port_conf" != "$PORT" ]; then
      if grep -q '^CANAPE_PORT=' "$CONF"; then sed -i "s|^CANAPE_PORT=.*|CANAPE_PORT=$PORT|" "$CONF"; else printf 'CANAPE_PORT=%s\n' "$PORT" >> "$CONF"; fi
      echo "CANAPE_PORT=$PORT écrit dans $CONF (était : ${port_conf:-absent})."
      [ -n "$DOMAINE" ] || echo "Le port a changé : relancez avec --domaine pour que le fichier nginx suive." >&2
    fi
  elif en_essai; then
    echo "  [essai] $CONF créé d'après canape.conf.exemple (droits 640, groupe canape), CANAPE_PORT=$PORT, CANAPE_URL_PUBLIQUE=https://${DOMAINE:-<domaine>}"
    return 0
  else
    dossier 0750 root canape "$(dirname "$CONF")"
    if en_root; then install -m 0640 -o root -g canape "$SRC/deploiement/canape.conf.exemple" "$CONF"; else install -m 0640 "$SRC/deploiement/canape.conf.exemple" "$CONF"; fi
    sed -i -e "s|^CANAPE_PORT=.*|CANAPE_PORT=$PORT|" -e "s|=/srv/canape/|=$SRV/|" "$CONF"
    echo "$CONF créé (droits 640, groupe canape)."
    # le gabarit porte une URL d'exemple : remplacée plus bas, ou signalée
    sed -i '/^CANAPE_URL_PUBLIQUE=https:\/\/canape\.exemple\.fr$/d' "$CONF"
  fi
  if grep -q '^CANAPE_URL_PUBLIQUE=' "$CONF"; then
    echo "CANAPE_URL_PUBLIQUE déjà définie : $(sed -n 's/^CANAPE_URL_PUBLIQUE=//p' "$CONF" | tail -1)"
  elif [ -n "$DOMAINE" ]; then
    printf 'CANAPE_URL_PUBLIQUE=https://%s\n' "$DOMAINE" >> "$CONF"
    echo "CANAPE_URL_PUBLIQUE=https://$DOMAINE ajouté."
  else
    printf 'CANAPE_URL_PUBLIQUE=http://localhost:%s\n' "$PORT" >> "$CONF"
    echo "Pas de --domaine : CANAPE_URL_PUBLIQUE=http://localhost:$PORT (liens d'invitation et contrôle d'Origin faux en ligne) :" >&2
    echo "  relancez avec --domaine, ou corrigez CANAPE_URL_PUBLIQUE dans $CONF puis : sudo systemctl restart canape" >&2
  fi
  conf_definir CANAPE_HOTE 127.0.0.1
  conf_definir CANAPE_DERRIERE_PROXY 1
  conf_definir CANAPE_DONNEES "$SRV/donnees"
  conf_definir CANAPE_FILMS "$FILMS"
  conf_definir CANAPE_CACHE "$SRV/cache"
  conf_definir CANAPE_TELEVERSEMENTS "$SRV/televersements"
}

# ---------------------------------------------------------------------------------------------------------
# L'application
# ---------------------------------------------------------------------------------------------------------
ecrire_commande() { # /usr/local/bin/canape : la ligne de commande de Canapé, au nom de l'utilisateur du service
  local contenu
  if en_root; then
    contenu="#!/bin/sh
$MARQUEUR_CLI
# Ligne de commande de Canapé (admin inviter, films importer…), lancée au nom de l'utilisateur du service.
[ \"\$(id -u)\" = 0 ] || exec sudo \"\$0\" \"\$@\"
exec runuser -u canape -- env CANAPE_CONFIG=$CONF $APP/actuelle/bin/canape \"\$@\""
  else
    contenu="#!/bin/sh
$MARQUEUR_CLI
exec env CANAPE_CONFIG=$CONF $APP/actuelle/bin/canape \"\$@\""
  fi
  if en_essai; then echo "  [essai] $CLI écrit (au nom de canape, avec CANAPE_CONFIG=$CONF)"; return 0; fi
  if [ -e "$CLI" ] && ! grep -qF "$MARQUEUR_CLI" "$CLI"; then
    echo "$CLI existe déjà et n'a pas été créé par Canapé : laissé en place (utilisez $APP/actuelle/bin/canape)." >&2
    return 0
  fi
  printf '%s\n' "$contenu" > "$CLI.neuf"; chmod 0755 "$CLI.neuf"; mv -f "$CLI.neuf" "$CLI"
}

sauvegarder_installation_01() {
  # Installation 0.1 (code à plat dans $APP, pas de lien « actuelle ») : on garde de quoi la relancer si la mise en service échoue.
  if [ -f "$APP/bin/canape" ] && [ -f "$APP/src/serveur.js" ] && [ ! -L "$APP/actuelle" ]; then
    LEGACY=1
    echo "Installation 0.1 détectée dans $APP : mise à niveau vers la 1.0 (films et port conservés)."
    en_essai && return 0
    [ -e "$UNITE.pre-1.0" ] || { [ ! -e "$UNITE" ] || cp -p "$UNITE" "$UNITE.pre-1.0"; }
  fi
}

retour_arriere_01() {
  set +e
  echo "La mise à niveau a échoué : retour à la version 0.1 (réglages et service d'avant remis)." >&2
  [ ! -e "$CONF.pre-1.0" ] || cp -p "$CONF.pre-1.0" "$CONF"
  [ ! -e "$UNITE.pre-1.0" ] || cp -p "$UNITE.pre-1.0" "$UNITE"
  "$SYSTEMCTL" daemon-reload
  "$SYSTEMCTL" restart canape
  echo "Service 0.1 redémarré (systemctl status canape pour vérifier)." >&2
}

nettoyer_ancien_01() { # retire le code 0.1 à plat une fois la 1.0 en service
  [ "$LEGACY" = 1 ] || return 0
  local x
  for x in bin src public tests outils docs node_modules package.json package-lock.json README.md CHANGELOG.md LICENSE ROADMAP.md .gitignore; do
    [ ! -e "$APP/$x" ] || rm -rf "${APP:?}/$x"
  done
  [ ! -L "$LIEN_CONVERTIR" ] || rm -f "$LIEN_CONVERTIR"
  echo "Code de la 0.1 retiré de $APP (films, port et réglages conservés ; sauvegardes des réglages : $CONF.pre-1.0, $UNITE.pre-1.0)."
}

installer_application() {
  local x
  [ -x "$SRC/deploiement/mettre-a-jour" ] || [ -n "$PAQUET" ] || en_essai || echec "aucun paquet à installer."

  etape "Utilisateur et dossiers"
  if en_root; then
    if ! id canape >/dev/null 2>&1; then
      agir useradd --system --user-group --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin canape
      en_essai || echo "Utilisateur système « canape » créé."
    else
      echo "Utilisateur « canape » déjà présent."
    fi
  fi
  dossier 0755 root root "$APP" "$APP/versions"
  if [ -d "$FILMS" ] && ! en_essai; then echo "$FILMS existe : les films ne sont pas touchés."; fi
  dossier 2775 root canape "$SRV" "$FILMS"
  dossier 0750 canape canape "$SRV/donnees" "$SRV/cache" "$SRV/televersements"
  dossier 0750 root canape "$(dirname "$CONF")"
  if en_root && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
    if ! id -nG "$SUDO_USER" 2>/dev/null | tr ' ' '\n' | grep -qx canape; then
      agir usermod -aG canape "$SUDO_USER"
      en_essai || echo "« $SUDO_USER » ajouté au groupe canape : il pourra copier des films dans $FILMS (après une reconnexion)."
    fi
  fi

  etape "Node.js dans $APP/node"
  copier_noeud

  etape "Scripts de déploiement dans $APP/deploiement (root, non modifiables par les autres)"
  if en_essai; then
    echo "  [essai] $SRC/deploiement copié dans $APP/deploiement (sans essais/), propriétaire root, droits 755/644"
  else
    rm -rf "${APP:?}/deploiement.neuf"
    cp -a "$SRC/deploiement" "$APP/deploiement.neuf"
    rm -rf "$APP/deploiement.neuf/essais"
    en_root && chown -R root:root "$APP/deploiement.neuf"
    chmod -R u=rwX,go=rX "$APP/deploiement.neuf"
    for x in mettre-a-jour recevoir installer-serveur.sh preparer-deploiement-auto.sh; do
      [ ! -e "$APP/deploiement.neuf/$x" ] || chmod 0755 "$APP/deploiement.neuf/$x"
    done
    rm -rf "${APP:?}/deploiement"
    mv "$APP/deploiement.neuf" "$APP/deploiement"
    echo "Scripts installés."
  fi

  sauvegarder_installation_01
  reglages

  etape "Service systemd et commande « canape »"
  if en_essai; then
    echo "  [essai] $UNITE écrit (ExecStart=$APP/node/bin/node $APP/actuelle/serveur/src/index.ts serve, CPUWeight=50, IOWeight=50), daemon-reload, enable."
  else
    sed -e "s|/opt/canape|$APP|g" -e "s|/srv/canape|$SRV|g" -e "s|/etc/canape/canape.conf|$CONF|g" "$SRC/deploiement/canape.service" > "$UNITE"
    chmod 0644 "$UNITE"
    "$SYSTEMCTL" daemon-reload
    "$SYSTEMCTL" enable canape >/dev/null 2>&1 || true
    echo "Service canape écrit et activé."
  fi
  ecrire_commande

  etape "Mise en service de la version du paquet (deploiement/mettre-a-jour)"
  if en_essai; then
    echo "  [essai] $APP/deploiement/mettre-a-jour <paquet> $(printf '%.12s' "${SHA_PAQUET:-<sha256>}")… : SHA-256, extraction dans $APP/versions/<version>-<commit>/,"
    echo "  [essai]   arrêt du service, sauvegarde de la base, bascule du lien $APP/actuelle, démarrage, vérification de /api/etat (30 s), retour arrière si échec."
    return 0
  fi
  if ! "$APP/deploiement/mettre-a-jour" "$PAQUET" "$SHA_PAQUET"; then
    echo >&2
    echo "La mise en service de la nouvelle version a échoué (détails ci-dessus ; journal : journalctl -u canape -n 50)." >&2
    [ "$LEGACY" = 0 ] || retour_arriere_01
    exit 1
  fi
  nettoyer_ancien_01
}

lire_etat() { "$CURL" -fsS --max-time 5 "http://127.0.0.1:$PORT/api/etat" 2>/dev/null || true; }

verifier_service() {
  etape "Vérification"
  en_essai && { echo "  [essai] curl http://127.0.0.1:$PORT/api/etat ; premier démarrage sans compte : canape admin inviter --role admin"; return 0; }
  local reponse; reponse="$(lire_etat)"
  [ -n "$reponse" ] || echec "le service ne répond pas sur 127.0.0.1:$PORT (journalctl -u canape -n 50)."
  echo "/api/etat répond : $reponse"
  command -v ffprobe >/dev/null 2>&1 || echo "Conseil : sudo apt install ffmpeg (conversion et lecture des films : indispensable à Canapé 1.0)." >&2
  # Premier démarrage : aucun compte, on crée l'invitation de l'administrateur.
  if grep -Eq '"installationRequise"[[:space:]]*:[[:space:]]*true' <<<"$reponse"; then
    if INVITATION="$("$CLI" admin inviter --role admin 2>&1)"; then
      :
    else
      echo "L'invitation de l'administrateur n'a pas pu être créée automatiquement :" >&2
      printf '%s\n' "$INVITATION" >&2
      INVITATION=""
      echo "Créez-la vous-même : sudo canape admin inviter --role admin" >&2
    fi
  fi
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
    if [ -L "$LIEN_CONVERTIR" ]; then agir rm -f "$LIEN_CONVERTIR"; fi
    if [ -e "$CLI" ] && grep -qF "$MARQUEUR_CLI" "$CLI"; then agir rm -f "$CLI"; fi
    agir rm -rf "${APP:?}"
    en_essai || echo "$APP retiré."
  fi
  echo
  echo "Gardé volontairement :"
  echo "  - $(dirname "$CONF") (réglages) : sudo rm -r $(dirname "$CONF")"
  echo "  - $SRV (base de données, sauvegardes, films, cache) et l'utilisateur « canape » : sudo rm -r $SRV ; sudo userdel canape"
  echo "  - le déploiement automatique, s'il a été préparé : sudo $APP/deploiement/preparer-deploiement-auto.sh --retirer (à lancer AVANT cette désinstallation)"
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

if [ "$NGINX_SEULEMENT" = 0 ]; then verifier_noeud; obtenir_paquet; fi
[ -n "$GABARIT" ] || GABARIT="$SRC/deploiement/nginx/canape.conf"
etape "Vérifications avant de toucher à quoi que ce soit"
verifier_port
if [ -n "$DOMAINE" ]; then
  [ -f "$GABARIT" ] || probleme "gabarit nginx introuvable : $GABARIT" || true
  preverifier_nginx
fi
if [ "$ESSAI" = 1 ] && [ "$PROBLEMES" = 1 ]; then echo; echo "Essai terminé : des problèmes ci-dessus bloqueraient l'installation."; fi

if [ "$NGINX_SEULEMENT" = 0 ]; then
  if [ "$PROBLEMES" = 1 ] && en_essai; then echo "  [essai] application non installée tant que les problèmes ci-dessus ne sont pas réglés."
  else installer_application; fi
fi
if [ -n "$DOMAINE" ]; then
  [ "$ESSAI" = 1 ] && [ "$PROBLEMES" = 1 ] && { echo "  [essai] nginx non touché tant que les problèmes ci-dessus ne sont pas réglés."; exit 0; }
  installer_nginx
else
  echo
  echo "Sans --domaine, nginx n'est pas touché. Node écoute sur 127.0.0.1:$PORT ; relancez avec --domaine pour le site HTTPS."
fi
if [ "$NGINX_SEULEMENT" = 0 ]; then verifier_service; fi

if [ -n "$INVITATION" ]; then
  printf '\n************************************************************\n'
  printf ' Premier démarrage : créez le compte administrateur avec ce lien\n'
  printf ' (valable quelques jours ; en recréer un : sudo canape admin inviter --role admin) :\n\n'
  printf '%s\n' "$INVITATION" | sed 's/^/   /'
  printf '\n************************************************************\n'
fi
if [ "$NGINX_SEULEMENT" = 0 ] && [ "$ESSAI" = 0 ] && [ -d "$FILMS" ] && [ -n "$(find "$FILMS" -maxdepth 1 -type f 2>/dev/null | head -1)" ]; then
  echo
  echo "Films de la 0.1 trouvés à plat dans $FILMS (ils n'ont pas été déplacés). Après la création du compte administrateur,"
  echo "reprenez-les dans la médiathèque (le dossier d'origine n'est pas modifié ; --aide pour les options) :"
  echo "  sudo canape films importer $FILMS --proprietaire <identifiant de l'administrateur>"
fi
if [ "$ESSAI" = 0 ] && [ -n "$DOMAINE" ]; then
  echo
  schema=https; [ "$HTTP_SEUL" = 1 ] && schema=http
  echo "Vérifiez : sudo nginx -t ; systemctl status canape ; curl -I $schema://$DOMAINE"
fi
if [ "$NGINX_SEULEMENT" = 0 ] && [ "$ESSAI" = 0 ] && ! id canape-deploiement >/dev/null 2>&1; then
  echo
  echo "Déploiement automatique (un push sur main met le serveur à jour) : voir docs/DEPLOIEMENT.md, puis"
  echo "  sudo $APP/deploiement/preparer-deploiement-auto.sh <clé-publique-de-déploiement.pub>"
fi
echo
echo "Terminé."
