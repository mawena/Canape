#!/usr/bin/env bash
# Construit le paquet de livraison : dist/canape-<version>.tar.gz et dist/SHA256SUMS.
#   scripts/paquet.sh               npm ci, npm run build, puis assemblage
#   scripts/paquet.sh --sans-build  assemble sans npm ci ni npm run build (l'arbre est déjà construit : CI, essais)
# Le paquet tourne tel quel sur le serveur avec « node serveur/src/index.ts serve » : il contient le code du serveur
# (TypeScript, exécuté directement), les migrations, le code partagé, l'interface déjà construite (client/build), la
# ligne de commande bin/canape, les scripts deploiement/ et les node_modules de PRODUCTION du serveur seulement.
# Un fichier VERSION (« <version> <commit court> ») dit ce que contient le paquet ; c'est lui que lit mettre-a-jour.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE"
CONSTRUIRE=1
case "${1:-}" in
  "") ;;
  --sans-build) CONSTRUIRE=0 ;;
  -h|--aide) sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "Option inconnue : $1" >&2; exit 2 ;;
esac

echec() { echo "Erreur : $*" >&2; exit 1; }
VERSION="$(node -p "require('./package.json').version")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+.][0-9A-Za-z.-]+)?$ ]] || echec "version illisible dans package.json : « $VERSION »."
COMMIT="$(git rev-parse --short=7 HEAD 2>/dev/null || echo inconnu)"
NOM="canape-$VERSION"
echo "== Paquet Canapé $VERSION (commit $COMMIT)"

if [ "$CONSTRUIRE" = 1 ]; then
  echo "== npm ci"
  npm ci --no-audit --no-fund
  echo "== npm run build"
  npm run build
fi
[ -f client/build/index.html ] || echo "Avertissement : client/build/index.html absent (npm run build n'a rien produit ?)." >&2
for f in serveur/src/index.ts bin/canape package.json package-lock.json; do
  [ -e "$f" ] || echec "$f introuvable : le paquet ne peut pas être assemblé."
done

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP:?}"' EXIT
STAGE="$TMP/$NOM"
mkdir -p "$STAGE"

echo "== Assemblage"
copier() { # copier <chemin relatif> : fichier ou dossier, s'il existe
  [ -e "$1" ] || return 0
  mkdir -p "$STAGE/$(dirname "$1")"
  cp -a "$1" "$STAGE/$1"
}
copier serveur/src
copier serveur/migrations
copier serveur/package.json
copier partage/src
copier partage/package.json
copier client/package.json
copier client/build
copier bin
copier package.json
copier package-lock.json
copier deploiement
rm -rf "$STAGE/deploiement/essais"
find "$STAGE" -name '*.test.ts' -not -path '*/node_modules/*' -delete 2>/dev/null || true
rm -rf "$STAGE/serveur/tests"

echo "== node_modules de production (serveur seulement : le client est déjà construit)"
# Réinstallation à partir du verrou dans le dossier d'assemblage : seules les dépendances du serveur (et de ce qu'il
# importe : partage), sans les outils de développement. --ignore-scripts : les binaires précompilés (N-API) suffisent.
( cd "$STAGE" && npm ci --omit=dev --workspace=serveur --include-workspace-root=false --ignore-scripts --no-audit --no-fund --loglevel=error )
# Les espaces de travail du client ne servent pas à l'exécution : leurs liens dans node_modules sont retirés s'ils pendent.
find "$STAGE/node_modules" -maxdepth 2 -xtype l -delete 2>/dev/null || true

printf '%s %s\n' "$VERSION" "$COMMIT" > "$STAGE/VERSION"

echo "== Archive"
mkdir -p dist
rm -f "dist/$NOM.tar.gz" dist/SHA256SUMS
# Date fixe = celle du commit, propriétaire root, ordre trié : deux constructions du même commit donnent le même paquet.
DATE_COMMIT="$(git log -1 --format=%ct 2>/dev/null || date +%s)"
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime="@$DATE_COMMIT" -C "$STAGE" -cf - . | gzip -n -9 > "dist/$NOM.tar.gz"
( cd dist && sha256sum "$NOM.tar.gz" > SHA256SUMS )

# Contrôle : ce que mettre-a-jour exige.
LISTE="$(tar -tzf "dist/$NOM.tar.gz")"   # liste lue en entier : « grep -q » dans un tube ferait échouer tar (SIGPIPE) sous pipefail
grep -qx './VERSION' <<<"$LISTE" || echec "VERSION manque dans l'archive."
grep -qx './serveur/src/index.ts' <<<"$LISTE" || echec "serveur/src/index.ts manque dans l'archive."
echo
echo "Paquet : dist/$NOM.tar.gz ($(du -h "dist/$NOM.tar.gz" | cut -f1))"
cat dist/SHA256SUMS
