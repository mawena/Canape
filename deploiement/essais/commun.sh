#!/usr/bin/env bash
# Aides communes aux essais sans root (essai-mise-a-jour.sh, essai-installation.sh) : faux programmes, faux paquets.
# À « sourcer » ; attend RACINE (racine du dépôt) et T (dossier temporaire de l'essai) déjà définis.

NB_OK=0; NB_KO=0
verifier() { # verifier "description" commande...
  local d="$1"; shift
  if "$@" >/dev/null 2>&1; then NB_OK=$((NB_OK+1)); echo "    ok  : $d"
  else NB_KO=$((NB_KO+1)); echo "    ÉCHEC : $d"; sed 's/^/        | /' "$T/sortie" 2>/dev/null | tail -${ESSAI_DETAIL:-0}; fi
}
titre() { printf '\n[%s] %s\n' "$1" "$2"; }
sortie_contient() { grep -qF -- "$1" "$T/sortie"; }
code_nul() { [ "$CODE" = 0 ]; }
code_est() { [ "$CODE" = "$1" ]; }
libre() { local p; while :; do p=$((20000 + RANDOM % 20000)); ss -ltn 2>/dev/null | grep -q ":$p " || { echo "$p"; return; }; done; }

# Faux serveur : un seul fichier, lu par Node comme le vrai (TypeScript exécuté directement, sans type ici).
# Il « migre » la base à chaque démarrage (ajoute une ligne), répond /api/etat avec la version du fichier VERSION.
#   fichier CASSE            : migre puis meurt (démarrage impossible)
#   fichier MAUVAISE_VERSION : répond une autre version
ecrire_faux_serveur() { # $1 = dossier serveur/src
  mkdir -p "$1"
  cat > "$1/index.ts" <<'JS'
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [version] = fs.readFileSync(path.join(racine, 'VERSION'), 'utf8').trim().split(' ');
const conf = {};
if (process.env.CANAPE_CONFIG && fs.existsSync(process.env.CANAPE_CONFIG)) {
  for (const l of fs.readFileSync(process.env.CANAPE_CONFIG, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) conf[m[1]] = m[2];
  }
}
const donnees = process.env.CANAPE_DONNEES || conf.CANAPE_DONNEES;
const port = Number(process.env.CANAPE_PORT || conf.CANAPE_PORT || 8080);
const commande = process.argv[2];
if (commande === 'serve') {
  const base = path.join(donnees, 'canape.sqlite');
  const deja = fs.existsSync(base) && fs.readFileSync(base, 'utf8').includes(`migration ${version}\n`);
  if (!deja) fs.appendFileSync(base, `migration ${version}\n`);
  if (fs.existsSync(path.join(racine, 'CASSE'))) { console.error('fausse erreur : démarrage impossible'); process.exit(1); }
  const annoncee = fs.existsSync(path.join(racine, 'MAUVAISE_VERSION')) ? '0.0.0' : version;
  http.createServer((q, r) => {
    if (q.url === '/api/etat') {
      r.setHeader('content-type', 'application/json');
      r.end(JSON.stringify({ version: annoncee, utilisateur: null, installationRequise: !fs.existsSync(path.join(donnees, 'admin')) }));
    } else { r.statusCode = 404; r.end(); }
  }).listen(port, '127.0.0.1');
} else if (commande === 'admin' && process.argv[3] === 'inviter') {
  fs.writeFileSync(path.join(donnees, 'admin'), 'oui');
  console.log(`Invitation (${process.argv.slice(4).join(' ')}) : ${conf.CANAPE_URL_PUBLIQUE || 'http://localhost'}/invitation/JETON-D-ESSAI`);
} else { console.error('commande inconnue'); process.exit(2); }
JS
}

# faire_paquet <nom> <version> <commit> [casse|mauvaise-version|dangereux|sans-version|lien] → $PAQUETS/<nom>.tar.gz, SHA dans $PAQUET_SHA
faire_paquet() {
  local nom="$1" version="$2" commit="$3" mode="${4:-}" d="$T/construction/$1"
  rm -rf "$d"; mkdir -p "$d/bin" "$d/serveur/migrations" "$d/client/build" "$d/deploiement" "$PAQUETS"
  ecrire_faux_serveur "$d/serveur/src"
  printf '%s %s\n' "$version" "$commit" > "$d/VERSION"
  printf '{"name":"canape","version":"%s","type":"module"}\n' "$version" > "$d/package.json"
  echo '<html></html>' > "$d/client/build/index.html"
  printf '#!/bin/sh\nexec node "$(dirname "$(readlink -f "$0")")/../serveur/src/index.ts" "$@"\n' > "$d/bin/canape"; chmod +x "$d/bin/canape"
  ( cd "$RACINE/deploiement" && tar -cf - --exclude=./essais . ) | tar -xf - -C "$d/deploiement"
  case "$mode" in
    casse) : > "$d/CASSE" ;;
    mauvaise-version) : > "$d/MAUVAISE_VERSION" ;;
    sans-version) rm "$d/VERSION" ;;
    lien) ln -s /etc/passwd "$d/sortie" ;;
    dangereux) ;;
  esac
  if [ "$mode" = dangereux ]; then
    # entrée « ../ » : fabriquée avec --transform
    echo piege > "$d/piege.txt"
    tar -czf "$PAQUETS/$nom.tar.gz" -C "$d" --transform 's|^piege.txt|../piege.txt|' ./VERSION ./serveur piege.txt 2>/dev/null
  else
    tar -czf "$PAQUETS/$nom.tar.gz" -C "$d" .
  fi
  PAQUET_SHA="$(sha256sum "$PAQUETS/$nom.tar.gz" | cut -d' ' -f1)"
}

# faux systemctl : « start » lance le faux serveur du lien actuelle, « stop » le tue ; le reste est journalisé.
ecrire_faux_systemctl() { # $1 = fichier à écrire
  cat > "$1" <<FAUX
#!/bin/sh
exec 9>&-
echo "\$*" >> "$T/systemctl.log"
pid_vivant() { [ -s "$T/service.pid" ] && kill -0 "\$(cat "$T/service.pid")" 2>/dev/null; }
arreter() {
  if pid_vivant; then kill "\$(cat "$T/service.pid")"; for i in 1 2 3 4 5 6 7 8 9 10; do pid_vivant || break; sleep 0.2; done; fi
  rm -f "$T/service.pid"
}
demarrer() {
  [ -e "$APP/actuelle/serveur/src/index.ts" ] || { echo "faux systemctl : rien à démarrer ($APP/actuelle)" >&2; return 1; }
  arreter
  CANAPE_CONFIG="$CONF" setsid node "$APP/actuelle/serveur/src/index.ts" serve </dev/null >>"$T/service.log" 2>&1 &
  echo \$! > "$T/service.pid"
}
case "\$1" in
  start) demarrer ;;
  stop) arreter ;;
  restart) demarrer ;;
  is-active) pid_vivant ;;
  show) [ -s "$T/service.pid" ] && cat "$T/service.pid" || echo 0 ;;
  disable) arreter ;;
  cat) [ -e "$UNITE" ] ;;
esac
exit 0
FAUX
  chmod +x "$1"
}
ecrire_faux_journalctl() {
  printf '#!/bin/sh\ntail -n 10 "%s/service.log" 2>/dev/null\n' "$T" > "$1"; chmod +x "$1"
}
arreter_faux_service() { [ -s "$T/service.pid" ] && kill "$(cat "$T/service.pid")" 2>/dev/null; return 0; }
