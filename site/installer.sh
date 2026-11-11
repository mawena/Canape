#!/bin/sh
# Installe Canapé depuis son dépôt APT signé : https://mawena.github.io/Canape/
#   curl -fsSL https://mawena.github.io/Canape/installer.sh | sh
# Il fait exactement les trois étapes de la page : clé du dépôt, dépôt, installation. Ce qui demande les droits
# administrateur passe par pkexec (la fenêtre d'authentification d'Ubuntu s'ouvre) ; lancé en root, il n'en a pas
# besoin. Ensuite, `sudo apt update && sudo apt upgrade` apporte les nouvelles versions.
set -eu

NOM_DEPOT=Canape   # nom du dépôt GitHub
DEPOT="https://mawena.github.io/$NOM_DEPOT/apt"
CLE=/usr/share/keyrings/canape.gpg
SOURCE=/etc/apt/sources.list.d/canape.sources

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Canapé : apt-get introuvable ; Canapé s'installe sur Ubuntu ou une distribution Debian." >&2
  exit 1
fi

telecharger() {   # adresse fichier
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -qO "$2" "$1"
  else echo "Canapé : il faut curl ou wget." >&2; exit 1
  fi
}

if [ "$(id -u)" -ne 0 ]; then
  # Pas root : on télécharge ici, puis on relance ce même script en administrateur par pkexec
  if ! command -v pkexec >/dev/null 2>&1; then
    echo "Canapé : il faut les droits administrateur (pkexec introuvable). Lancez ce script en root, ou suivez les étapes de la page." >&2
    exit 1
  fi
  copie="$(mktemp)"
  trap 'rm -f "$copie"' EXIT
  telecharger "https://mawena.github.io/$NOM_DEPOT/installer.sh" "$copie"
  chmod 644 "$copie"
  echo "Une fenêtre de mot de passe va s'ouvrir pour installer Canapé."
  pkexec /bin/sh "$copie"
  exit $?
fi

echo "1/3 Clé du dépôt -> $CLE"
telecharger "$DEPOT/canape.gpg" "$CLE.tmp" && chmod 644 "$CLE.tmp" && mv "$CLE.tmp" "$CLE"
echo "2/3 Dépôt -> $SOURCE"
telecharger "$DEPOT/canape.sources" "$SOURCE.tmp" && chmod 644 "$SOURCE.tmp" && mv "$SOURCE.tmp" "$SOURCE"
echo "3/3 Installation"
apt-get update
apt-get install -y canape
echo
echo "Canapé est installé : http://localhost:8080"
echo "Le mot de passe commun a été créé ; pour le lire : pkexec cat /etc/canape/secrets.conf"
