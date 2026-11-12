#!/usr/bin/env bash
# Déploie Canapé sur un serveur à soi (SSH, nginx) DEPUIS LE POSTE. Il envoie le code dans un dossier temporaire du
# serveur puis y lance deploiement/installer-serveur.sh (la seule source de l'installation : mêmes garde-fous pour
# les autres sites du serveur, retour arrière nginx, etc.). On peut aussi lancer ce script directement sur le
# serveur, depuis un clone : voir installer-serveur.sh.
#   deploiement/deployer.sh <utilisateur@serveur> [--domaine <nom>] [--port <N>] [--node <chemin>] [--essai]
# Idempotent : on peut le relancer à chaque mise à jour.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIBLE=""
DOMAINE=""
PORT=""
NOEUD=""
ESSAI=0
SSH_OPTS=${SSH_OPTS:-}          # options ssh supplémentaires, par exemple SSH_OPTS="-p 2222 -i ~/.ssh/vps"
PREPARATION='canape-deploiement' # dossier temporaire (dans le dossier personnel du serveur)

aide() {
  cat <<AIDE
Utilisation : $(basename "$0") <utilisateur@serveur> [--domaine <nom>] [--port <N>] [--node <chemin>] [--essai]

  <utilisateur@serveur>  compte SSH du serveur (il doit pouvoir utiliser sudo)
  --domaine <nom>        installe aussi le site nginx pour ce nom de domaine (HTTPS Let's Encrypt avec certbot)
  --port <N>             port local de Node sur le serveur (sinon : 8080, ou un port libre choisi seul si 8080 est pris)
  --node <chemin>        Node.js 18+ du SERVEUR à copier dans /opt/canape/node (si root n'a pas de node : nvm…)
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
    --port) [ $# -ge 2 ] || echec "--port demande un numéro."; PORT="$2"; shift ;;
    --node) [ $# -ge 2 ] || echec "--node demande un chemin."; NOEUD="$2"; shift ;;
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
for f in bin/canape src/serveur.js public/index.html package.json package-lock.json deploiement/canape.service deploiement/canape.conf.exemple deploiement/nginx/canape.conf deploiement/installer-serveur.sh; do
  [ -e "$RACINE/$f" ] || echec "fichier introuvable dans le dépôt : $f"
done

# ---------------------------------------------------------------------------------------------------------
# Les commandes
# ---------------------------------------------------------------------------------------------------------
# shellcheck disable=SC2206  # SSH_OPTS est volontairement découpée en mots
OPTS=($SSH_OPTS)
RSYNC_FICHIERS=(bin src public package.json package-lock.json deploiement)

ARGS_INSTALLEUR=()
[ -z "$DOMAINE" ] || ARGS_INSTALLEUR+=(--domaine "$DOMAINE")
[ -z "$PORT" ] || ARGS_INSTALLEUR+=(--port "$PORT")
[ -z "$NOEUD" ] || ARGS_INSTALLEUR+=(--node "$NOEUD")
COMMANDE_DISTANTE="cd $PREPARATION/code && sudo ./deploiement/installer-serveur.sh ${ARGS_INSTALLEUR[*]:-}"

if [ "$ESSAI" = 1 ]; then
  echo "== Essai : rien n'est exécuté sur $CIBLE =="
  echo
  echo "1. Envoi du code (bin/ src/ public/ package*.json deploiement/) vers $CIBLE:$PREPARATION/code/ :"
  echo "   cd $RACINE && rsync -az --delete --relative -e 'ssh ${OPTS[*]:-}' ${RSYNC_FICHIERS[*]} $CIBLE:$PREPARATION/code/"
  echo
  echo "2. Installation sur le serveur, avec sudo (mot de passe demandé au besoin) :"
  echo "   ssh -t ${OPTS[*]:-} $CIBLE '$COMMANDE_DISTANTE'"
  echo "   (c'est installer-serveur.sh qui fait tout ; voir « installer-serveur.sh --essai » pour le détail)"
  echo
  echo "3. Nettoyage : ssh ${OPTS[*]:-} $CIBLE 'rm -rf $PREPARATION'"
  echo
  echo "Ce que fait installer-serveur.sh (simulation locale, rien n'est modifié) :"
  echo "------------------------------------------------------------"
  "$RACINE/deploiement/installer-serveur.sh" --essai "${ARGS_INSTALLEUR[@]}" || true
  echo "------------------------------------------------------------"
  exit 0
fi

command -v rsync >/dev/null 2>&1 || echec "rsync est requis sur ce poste (sudo apt install rsync via pkexec, par exemple)."
command -v ssh >/dev/null 2>&1 || echec "ssh est requis sur ce poste."

echo "== Envoi du code vers $CIBLE =="
ssh "${OPTS[@]}" "$CIBLE" "rm -rf $PREPARATION && mkdir -p $PREPARATION/code"
( cd "$RACINE" && rsync -az --delete --relative -e "ssh ${OPTS[*]:-}" "${RSYNC_FICHIERS[@]}" "$CIBLE:$PREPARATION/code/" )

echo "== Installation sur le serveur (sudo : le mot de passe peut être demandé) =="
CODE=0
ssh -t "${OPTS[@]}" "$CIBLE" "$COMMANDE_DISTANTE" || CODE=$?
ssh "${OPTS[@]}" "$CIBLE" "rm -rf $PREPARATION" || true
[ "$CODE" = 0 ] || { echo "L'installation a échoué (code $CODE) : voir les messages ci-dessus ; nginx a été remis dans son état d'avant si besoin." >&2; exit "$CODE"; }
echo
echo "Terminé."
