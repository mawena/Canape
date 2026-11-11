#!/usr/bin/env bash
# Construit dist/canape_<version>_all.deb : tests, paquet, sommes SHA-256, lintian.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Une seule version partout : debian/changelog et package.json
deb_version="$(dpkg-parsechangelog -S Version)"
app_version="$(node -p "require('./package.json').version")"
if [[ "$deb_version" != "$app_version" ]]; then
  echo "Versions différentes : debian/changelog=$deb_version, package.json=$app_version" >&2
  exit 1
fi

make clean >/dev/null
make test
dpkg-buildpackage -us -uc -b
make clean >/dev/null

mkdir -p dist
mv -f "../canape_${deb_version}_all.deb" dist/
rm -f "../canape_${deb_version}_"*.buildinfo "../canape_${deb_version}_"*.changes
(cd dist && sha256sum ./*.deb | sed 's| \./| |' > SHA256SUMS)

# Lintian sans erreur ni avertissement
lintian -I --fail-on error,warning "dist/canape_${deb_version}_all.deb"
echo "Paquet : dist/canape_${deb_version}_all.deb"
