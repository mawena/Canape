#!/usr/bin/env bash
# Prépare le déploiement automatique (GitHub Actions) SUR le serveur, en root, une seule fois :
#   sudo /opt/canape/deploiement/preparer-deploiement-auto.sh <clé-publique.pub | "ssh-ed25519 AAAA… commentaire">
#   sudo /opt/canape/deploiement/preparer-deploiement-auto.sh --essai <clé publique>     (ne modifie rien)
#   sudo /opt/canape/deploiement/preparer-deploiement-auto.sh --retirer                  (défait tout, sauf les données)
#
# Crée l'utilisateur « canape-deploiement » (sans mot de passe, sans autre droit), y installe la clé publique avec la
# commande forcée « recevoir » et « restrict » (pas de shell, pas de redirection, pas d'agent), et l'autorise, par
# sudo, à lancer UNIQUEMENT mettre-a-jour. Affiche ensuite les valeurs des secrets GitHub.
# La paire de clés se crée sur le poste (jamais sur le serveur) :
#   ssh-keygen -t ed25519 -N "" -C canape-deploiement -f ~/.ssh/canape-deploiement
set -euo pipefail

UTILISATEUR=canape-deploiement
APP="${CANAPE_ESSAI_APP:-/opt/canape}"
DEPLOIEMENT="$APP/deploiement"
MAISON="${CANAPE_ESSAI_MAISON:-/var/lib/$UTILISATEUR}"
SUDOERS="${CANAPE_ESSAI_SUDOERS:-/etc/sudoers.d/$UTILISATEUR}"
HOTE_CLE="${CANAPE_ESSAI_CLE_HOTE:-/etc/ssh/ssh_host_ed25519_key.pub}"
SANS_ROOT="${CANAPE_ESSAI_SANS_ROOT:-0}"

ESSAI=0; RETIRER=0; CLE_ARG=""
aide() {
  cat <<AIDE
Utilisation : sudo $(basename "$0") <clé publique SSH (fichier .pub ou texte)> [--essai]
              sudo $(basename "$0") --retirer [--essai]
  --essai     montre ce qui serait fait, sans rien modifier (root inutile ; la clé et le fichier sudoers sont quand même vérifiés)
  --retirer   supprime l'utilisateur $UTILISATEUR, sa clé et son droit sudo (les données de Canapé ne sont pas touchées)
AIDE
}
echec() { printf 'Erreur : %b\n' "$*" >&2; exit 1; }
agir() { if [ "$ESSAI" = 1 ]; then printf '  [essai] %s\n' "$*"; else "$@"; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--aide|--help) aide; exit 0 ;;
    --essai) ESSAI=1 ;;
    --retirer) RETIRER=1 ;;
    -*) echo "Option inconnue : $1" >&2; aide >&2; exit 2 ;;
    *) [ -z "$CLE_ARG" ] || echec "une seule clé publique à la fois."; CLE_ARG="$1" ;;
  esac
  shift
done
if [ "$ESSAI" = 0 ] && [ "$SANS_ROOT" != 1 ] && [ "$(id -u)" != 0 ]; then echec "à lancer en root : sudo $0 $*"; fi

# ------------------------------------------------------------------------------------------------------------
if [ "$RETIRER" = 1 ]; then
  echo "== Retrait du déploiement automatique =="
  [ ! -e "$SUDOERS" ] || agir rm -f "$SUDOERS"
  if id "$UTILISATEUR" >/dev/null 2>&1; then agir userdel --remove "$UTILISATEUR" || true; else echo "Utilisateur $UTILISATEUR : absent."; fi
  [ ! -d "$MAISON" ] || agir rm -rf "${MAISON:?}"
  echo "Retiré. Pensez à supprimer les secrets VPS_* du dépôt GitHub (gh secret delete …) et la clé privée du poste."
  exit 0
fi

# ------------------------------------------------------------------------------------------------------------
[ -n "$CLE_ARG" ] || { aide >&2; echec "indiquez la clé publique SSH de déploiement."; }
if [ -f "$CLE_ARG" ]; then CLE="$(head -n 1 "$CLE_ARG")"; else CLE="$CLE_ARG"; fi
CLE="$(printf '%s' "$CLE" | tr -d '\r\n')"
# Une seule ligne « type base64 [commentaire] », sans option devant (une option pourrait annuler la commande forcée).
[[ "$CLE" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521))\ [A-Za-z0-9+/=]+(\ [^\"]*)?$ ]] \
  || echec "« $CLE_ARG » n'est pas une clé PUBLIQUE SSH (attendu : « ssh-ed25519 AAAA… commentaire », sans option)."
TMP="$(mktemp -d)"; trap 'rm -rf "${TMP:?}"' EXIT
printf '%s\n' "$CLE" > "$TMP/cle.pub"
EMPREINTE_CLE="$(ssh-keygen -l -f "$TMP/cle.pub" 2>/dev/null)" || echec "ssh-keygen ne reconnaît pas cette clé publique."
echo "Clé de déploiement : $EMPREINTE_CLE"

# Sudoers : validé par visudo AVANT d'être installé (un fichier sudoers faux peut bloquer sudo pour tout le monde).
cat > "$TMP/sudoers" <<SUD
# Géré par Canapé (deploiement/preparer-deploiement-auto.sh) : l'utilisateur de déploiement ne peut lancer que mettre-a-jour,
# sur un paquet que « recevoir » vient de déposer.
Defaults:$UTILISATEUR !requiretty
$UTILISATEUR ALL=(root) NOPASSWD: $DEPLOIEMENT/mettre-a-jour /var/tmp/canape-recevoir.*/paquet.tar.gz *
SUD
if command -v visudo >/dev/null 2>&1; then
  visudo -cf "$TMP/sudoers" >/dev/null || echec "le fichier sudoers produit est refusé par visudo (rien n'est installé) :\n$(cat "$TMP/sudoers")"
  echo "Fichier sudoers validé par visudo."
else
  echec "visudo introuvable : sudo n'est pas installé ?"
fi

# Les scripts exécutés en root par sudo ne doivent être modifiables par personne d'autre que root.
verifier_droits() {
  [ -d "$DEPLOIEMENT" ] || echec "$DEPLOIEMENT n'existe pas : installez Canapé d'abord (deploiement/installer-serveur.sh)."
  [ -x "$DEPLOIEMENT/mettre-a-jour" ] && [ -x "$DEPLOIEMENT/recevoir" ] || echec "mettre-a-jour ou recevoir manque dans $DEPLOIEMENT (relancez installer-serveur.sh)."
  local chemin mauvais=""
  for chemin in "$APP" "$DEPLOIEMENT" "$DEPLOIEMENT/mettre-a-jour" "$DEPLOIEMENT/recevoir"; do
    if [ "$SANS_ROOT" != 1 ] && [ "$(stat -c %u "$chemin")" != 0 ]; then mauvais="$mauvais\n  $chemin n'appartient pas à root"; fi
    if [ -n "$(find "$chemin" -maxdepth 0 -perm /022)" ]; then mauvais="$mauvais\n  $chemin est modifiable par le groupe ou tout le monde"; fi
  done
  [ -z "$mauvais" ] || echec "droits dangereux (l'utilisateur de déploiement pourrait lancer du code modifié en root) :$(printf '%b' "$mauvais")\nCorrigez : sudo chown -R root:root $DEPLOIEMENT && sudo chmod -R go-w $DEPLOIEMENT"
  echo "Droits de $DEPLOIEMENT : root, non modifiable par les autres : bon."
}
verifier_droits

echo
echo "== Utilisateur, clé et sudo =="
if id "$UTILISATEUR" >/dev/null 2>&1; then
  echo "Utilisateur $UTILISATEUR déjà présent."
else
  # Shell réel (sshd lance la commande forcée par « shell -c »), mais aucun mot de passe et aucun droit.
  agir useradd --system --user-group --home-dir "$MAISON" --create-home --shell /bin/bash "$UTILISATEUR"
fi
# « * » : pas de connexion par mot de passe, mais la clé reste acceptée (un compte verrouillé par « ! » est refusé par sshd).
agir usermod -p '*' "$UTILISATEUR"
# .ssh et authorized_keys appartiennent à root : l'utilisateur de déploiement ne peut pas changer la commande forcée.
agir install -d -m 0755 -o root -g root "$MAISON/.ssh"
LIGNE="command=\"$DEPLOIEMENT/recevoir\",restrict $CLE"
if [ "$ESSAI" = 1 ]; then
  printf '  [essai] %s/.ssh/authorized_keys (root:root 0644) :\n    %s\n' "$MAISON" "$LIGNE"
  printf '  [essai] %s (root:root 0440) :\n' "$SUDOERS"; sed 's/^/    /' "$TMP/sudoers"
else
  printf '%s\n' "$LIGNE" > "$MAISON/.ssh/authorized_keys"
  chmod 0644 "$MAISON/.ssh/authorized_keys"; [ "$SANS_ROOT" = 1 ] || chown root:root "$MAISON/.ssh/authorized_keys"
  install -m 0440 -o "$([ "$SANS_ROOT" = 1 ] && id -un || echo root)" -g "$([ "$SANS_ROOT" = 1 ] && id -gn || echo root)" "$TMP/sudoers" "$SUDOERS"
  echo "Clé installée dans $MAISON/.ssh/authorized_keys (commande forcée + restrict)."
  echo "Droit sudo posé dans $SUDOERS."
fi

echo
if [ -r "$HOTE_CLE" ]; then
  EMP_HOTE="$(ssh-keygen -l -f "$HOTE_CLE" | awk '{print $2}')"
  echo "============================================================"
  echo " À mettre dans les secrets GitHub du dépôt (voir docs/DEPLOIEMENT.md) :"
  echo "   VPS_HOTE            adresse ou nom du serveur (ssh)"
  echo "   VPS_PORT            port ssh (22 par défaut)"
  echo "   VPS_UTILISATEUR     $UTILISATEUR"
  echo "   VPS_CLE_SSH         le contenu de la clé PRIVÉE (fichier sans .pub) du poste"
  echo "   VPS_EMPREINTE_HOTE  la clé d'hôte du serveur (une ligne) :"
  echo "      $(awk '{print $1" "$2}' "$HOTE_CLE")"
  echo " Empreinte correspondante, pour vérifier : $EMP_HOTE"
  echo "============================================================"
else
  echo "Clé d'hôte $HOTE_CLE illisible : lancez  ssh-keyscan -t ed25519 <serveur>  depuis le poste pour obtenir VPS_EMPREINTE_HOTE."
fi
[ "$ESSAI" = 0 ] || echo "(essai : rien n'a été modifié)"
