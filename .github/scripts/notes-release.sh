#!/usr/bin/env bash
# Extrait du CHANGELOG la section d'une version :
#   notes-release.sh <version> [CHANGELOG.md]            -> le corps de la section (notes de la release)
#   notes-release.sh --resume <version> [CHANGELOG.md]   -> la première phrase de la section (titre de la release)
set -euo pipefail

resume=0
if [ "${1:-}" = "--resume" ]; then resume=1; shift; fi
version="${1:?version manquante (ex. 1.0.0)}"
fichier="${2:-CHANGELOG.md}"
[ -f "$fichier" ] || { echo "Erreur : $fichier introuvable." >&2; exit 1; }

# De « ## [<version>] » jusqu'au « ## » suivant ; les lignes de liens de fin de fichier ([x.y.z]: https://…) sont ignorées.
section="$(awk -v v="$version" '
  /^## \[/ { if (dedans) exit; dedans = (index($0, "## [" v "]") == 1); next }
  dedans && /^\[[^]]+\]: / { next }
  dedans { print }
' "$fichier" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' | sed '1{/^$/d}')"
[ -n "$section" ] || { echo "Erreur : pas de section « ## [$version] » (ou section vide) dans $fichier." >&2; exit 1; }

if [ "$resume" = 0 ]; then printf '%s\n' "$section"; exit 0; fi

# Premier paragraphe qui n'est pas un titre, sur une ligne, coupé à la première fin de phrase.
paragraphe="$(printf '%s\n' "$section" | awk '
  /^#/ { if (n) exit; next }
  /^[[:space:]]*$/ { if (n) exit; next }
  { n = 1; printf "%s ", $0 }
')"
paragraphe="$(printf '%s' "$paragraphe" | sed -e 's/[[:space:]]\+/ /g' -e 's/^ //' -e 's/ $//')"
[ -n "$paragraphe" ] || { echo "Erreur : la section $version n'a pas de phrase de résumé." >&2; exit 1; }
# première phrase : jusqu'au premier « . » suivi d'une espace ou de la fin ; sans le point final
phrase="$(printf '%s' "$paragraphe" | sed -E 's/\.( .*)?$//; s/^(([^.]|\.[^ ])*)\. .*$/\1/')"
printf '%s\n' "$phrase"
