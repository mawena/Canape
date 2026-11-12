#!/usr/bin/env bash
# Essai rejouable, SANS root, de deploiement/installer-serveur.sh 1.0 : installation, mise à niveau depuis la 0.1 (réglages
# migrés, retour à la 0.1 si la 1.0 ne démarre pas), téléchargement de la dernière release, refus d'un Node trop ancien,
# --essai, désinstallation. Faux paquets, faux systemctl, faux nginx, dossiers temporaires. La partie nginx détaillée
# (70 vérifications) est dans essai-nginx.sh.
# Utilisation : deploiement/essais/essai-installation.sh   (Node 22+ dans le PATH ; ESSAI_DETAIL=20 pour les sorties en échec)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
for o in node curl flock tar; do command -v "$o" >/dev/null 2>&1 || { echo "Il faut $o pour cet essai." >&2; exit 2; }; done
T="$(mktemp -d)"
APP="$T/opt"; SRV="$T/srv"; CONF="$T/etc/canape.conf"; BIN="$T/bin"; PAQUETS="$T/paquets"; UNITE="$T/canape.service"
CLI="$T/usr/canape"; CONVERTIR="$T/usr/canape-convertir"; NGX="$T/nginx"; REL="$T/release"
mkdir -p "$BIN" "$PAQUETS" "$T/usr" "$REL"
source "$RACINE/deploiement/essais/commun.sh"
trap 'arreter_faux_service; rm -rf "${T:?}"' EXIT

PORT="$(libre)"; DOM=canape.test
ecrire_faux_systemctl "$BIN/systemctl"; ecrire_faux_journalctl "$BIN/journalctl"
printf '#!/bin/sh\nexit 0\n' > "$BIN/nginx"; printf '#!/bin/sh\nexit 0\n' > "$BIN/ss"; chmod +x "$BIN/nginx" "$BIN/ss"
# faux Node : annonce la version voulue (FAUX_NODE), exécute le vrai Node pour le reste
mkdir -p "$T/faux-node/bin"
printf '#!/bin/sh\ncase "$1" in -v) echo "v${FAUX_NODE:-26}.0.0" ;; -p) echo "${FAUX_NODE:-26}" ;; *) exec "%s" "$@" ;; esac\n' "$(command -v node)" > "$T/faux-node/bin/node"
chmod +x "$T/faux-node/bin/node"
EXPORTS=(CANAPE_ESSAI_APP="$APP" CANAPE_ESSAI_SRV="$SRV" CANAPE_ESSAI_CONF="$CONF" CANAPE_ESSAI_UNITE="$UNITE" CANAPE_ESSAI_CLI="$CLI"
  CANAPE_ESSAI_LIEN_CONVERTIR="$CONVERTIR" CANAPE_ESSAI_NGINX_DIR="$NGX" CANAPE_ESSAI_LETSENCRYPT="$T/le" CANAPE_ESSAI_NGINX="$BIN/nginx"
  CANAPE_ESSAI_SYSTEMCTL="$BIN/systemctl" CANAPE_ESSAI_JOURNALCTL="$BIN/journalctl" CANAPE_ESSAI_CERTBOT=/inexistant/certbot
  CANAPE_ESSAI_SS="$BIN/ss" CANAPE_ESSAI_SANS_ROOT=1 CANAPE_ESSAI_ATTENTE=4 CANAPE_ESSAI_URL_RELEASE="file://$REL")
INST="$RACINE/deploiement/installer-serveur.sh"
installer() { env "${EXPORTS[@]}" "$@" > "$T/sortie" 2>&1 < /dev/null; CODE=$?; }
lancer() { # lancer [VAR=x ...] -- arguments de l'installeur
  local v=(); while [ $# -gt 0 ] && [ "$1" != -- ]; do v+=("$1"); shift; done; shift
  installer "${v[@]}" "$INST" "$@"
}
etat() { curl -s --max-time 3 "http://127.0.0.1:$PORT/api/etat" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'; }
lien() { basename "$(readlink "$APP/actuelle" 2>/dev/null)"; }
bac() { # remet un serveur vide
  arreter_faux_service
  rm -rf "${APP:?}" "${SRV:?}" "${T:?}/etc" "${UNITE:?}" "${UNITE:?}.pre-1.0" "${CLI:?}" "${CONVERTIR:?}" "${NGX:?}" "${T:?}/le" "${T:?}/systemctl.log" "${T:?}/service.log"
  mkdir -p "$T/etc" "$NGX/conf.d" "$SRV"
}
legacy() { # installation 0.1 : code à plat, réglages 0.1, unité 0.1, un film à plat
  mkdir -p "$APP/bin" "$APP/src" "$APP/public" "$APP/node_modules/ws" "$APP/deploiement" "$SRV/films"
  echo '#!/bin/sh' > "$APP/bin/canape"; echo '//' > "$APP/src/serveur.js"; echo '{}' > "$APP/package.json"; echo x > "$APP/deploiement/deployer.sh"
  printf '# réglages 0.1\nCANAPE_PORT=%s\nCANAPE_FILMS=%s/films\nCANAPE_MOT_DE_PASSE=motdepasse01\nCANAPE_SECRET=secret01\nCANAPE_DERRIERE_PROXY=1\n' "$PORT" "$SRV" > "$CONF"
  printf '[Service]\nExecStart=/opt/canape/node/bin/node /opt/canape/bin/canape\n' > "$UNITE"
  head -c 2000 /dev/urandom > "$SRV/films/ancien.mp4"
  ln -sf "$APP/bin/canape-convertir" "$CONVERTIR"
}
faire_paquet p100 1.0.0 aaaaaaa; P100="$PAQUETS/p100.tar.gz"
faire_paquet pcasse 1.0.1 bbbbbbb casse; PCASSE="$PAQUETS/pcasse.tar.gz"
NODE_FAUX="$T/faux-node/bin/node"

# ============================================================================================================
titre a "première installation, avec domaine (HTTP seul : pas de certbot dans l'essai)"
bac
lancer -- --domaine $DOM --paquet "$P100" --port "$PORT" --node "$NODE_FAUX"
verifier "code 0, « Terminé »" bash -c "[ $CODE = 0 ] && grep -q '^Terminé' '$T/sortie'"
verifier "Node copié dans /opt/canape/node (le binaire seul)" bash -c "[ -x '$APP/node/bin/node' ] && grep -q 'copié dans' '$T/sortie'"
verifier "lien actuelle -> 1.0.0-aaaaaaa, /api/etat répond 1.0.0" bash -c "[ '$(lien)' = 1.0.0-aaaaaaa ] && [ '$(etat)' = 1.0.0 ]"
verifier "scripts de déploiement installés (mettre-a-jour, recevoir, preparer…), sans le dossier essais" bash -c "[ -x '$APP/deploiement/mettre-a-jour' ] && [ -x '$APP/deploiement/recevoir' ] && [ -x '$APP/deploiement/preparer-deploiement-auto.sh' ] && [ ! -e '$APP/deploiement/essais' ]"
verifier "scripts non modifiables par le groupe ni les autres" bash -c "[ -z \"\$(find '$APP/deploiement' -perm /022)\" ]"
verifier "réglages créés : port, URL publique https://$DOM, dossiers, pas de mot de passe ni de secret" bash -c "grep -q '^CANAPE_PORT=$PORT\$' '$CONF' && grep -q '^CANAPE_URL_PUBLIQUE=https://$DOM\$' '$CONF' && grep -q '^CANAPE_DONNEES=$SRV/donnees\$' '$CONF' && grep -q '^CANAPE_TELEVERSEMENTS=' '$CONF' && grep -q '^CANAPE_CACHE=' '$CONF' && ! grep -qE '^(CANAPE_MOT_DE_PASSE|CANAPE_SECRET)=' '$CONF' && [ \$(grep -c '^CANAPE_URL_PUBLIQUE=' '$CONF') = 1 ]"
verifier "dossiers de données créés (donnees, films, cache, televersements)" bash -c "for d in donnees films cache televersements; do [ -d '$SRV/'\$d ] || exit 1; done"
verifier "unité : ExecStart sur le Node copié et le lien actuelle" grep -q "^ExecStart=$APP/node/bin/node $APP/actuelle/serveur/src/index.ts serve\$" "$UNITE"
verifier "unité : SystemCallFilter=@system-service @pkey et SystemCallErrorNumber=EPERM (sans @pkey Node meurt)" bash -c "grep -q '^SystemCallFilter=@system-service @pkey\$' '$UNITE' && grep -q '^SystemCallErrorNumber=EPERM\$' '$UNITE'"
verifier "unité : CPUWeight=50, IOWeight=50, ReadWritePaths=$SRV, durcissement gardé" bash -c "grep -q '^CPUWeight=50\$' '$UNITE' && grep -q '^IOWeight=50\$' '$UNITE' && grep -q '^ReadWritePaths=$SRV\$' '$UNITE' && grep -q '^ProtectSystem=strict\$' '$UNITE' && grep -q '^NoNewPrivileges=true\$' '$UNITE' && grep -q '^CapabilityBoundingSet=\$' '$UNITE'"
verifier "daemon-reload et enable demandés" bash -c "grep -q '^daemon-reload' '$T/systemctl.log' && grep -q '^enable canape' '$T/systemctl.log'"
verifier "premier démarrage : lien d'invitation de l'administrateur affiché (canape admin inviter --role admin)" bash -c "grep -q 'JETON-D-ESSAI' '$T/sortie' && grep -q 'https://$DOM/invitation/' '$T/sortie' && grep -q 'role admin' '$T/sortie'"
verifier "commande « canape » posée avec marqueur" grep -qF 'Géré par Canapé' "$CLI"
verifier "site nginx posé (bloc HTTP : pas de certbot), marqueur présent" grep -qF 'Géré par Canapé' "$NGX/conf.d/$DOM.conf"
verifier "pas de film à plat : pas de conseil d'importation" bash -c "! grep -q 'films importer' '$T/sortie'"
verifier "déploiement automatique proposé (preparer-deploiement-auto.sh)" sortie_contient "preparer-deploiement-auto.sh"
cp "$CONF" "$T/conf-a"

titre a2 "relance : idempotente, pas de nouvelle invitation"
lancer -- --domaine $DOM --paquet "$P100" --port "$PORT" --node "$NODE_FAUX"
verifier "code 0, version déjà en service" bash -c "[ $CODE = 0 ] && grep -q 'déjà en service' '$T/sortie'"
verifier "réglages inchangés" cmp -s "$T/conf-a" "$CONF"
verifier "pas de nouvelle invitation (le compte administrateur existe désormais)" bash -c "! grep -q 'JETON-D-ESSAI' '$T/sortie'"

# ============================================================================================================
titre b "mise à niveau depuis la 0.1 (films à plat, réglages 0.1)"
bac; legacy
cp "$CONF" "$T/conf-01"; cp "$UNITE" "$T/unite-01"; MD5_FILM="$(md5sum < "$SRV/films/ancien.mp4")"
lancer -- --domaine $DOM --paquet "$P100" --node "$NODE_FAUX"
verifier "code 0" code_nul
verifier "installation 0.1 détectée et annoncée" sortie_contient "Installation 0.1 détectée"
verifier "1.0.0 en service" bash -c "[ '$(lien)' = 1.0.0-aaaaaaa ] && [ '$(etat)' = 1.0.0 ]"
verifier "le port de la 0.1 est gardé ($PORT)" grep -q "^CANAPE_PORT=$PORT\$" "$CONF"
verifier "CANAPE_MOT_DE_PASSE et CANAPE_SECRET commentés (plus de ligne active)" bash -c "! grep -qE '^(CANAPE_MOT_DE_PASSE|CANAPE_SECRET)=' '$CONF' && grep -q '^#(retiré en 1.0) CANAPE_MOT_DE_PASSE=' '$CONF' && grep -q '^#(retiré en 1.0) CANAPE_SECRET=' '$CONF'"
verifier "CANAPE_URL_PUBLIQUE=https://$DOM ajoutée, dossiers ajoutés, CANAPE_FILMS gardé" bash -c "grep -q '^CANAPE_URL_PUBLIQUE=https://$DOM\$' '$CONF' && grep -q '^CANAPE_DONNEES=' '$CONF' && grep -q '^CANAPE_FILMS=$SRV/films\$' '$CONF' && [ \$(grep -c '^CANAPE_FILMS=' '$CONF') = 1 ]"
verifier "réglages et unité de la 0.1 sauvegardés à l'identique (.pre-1.0)" bash -c "cmp -s '$T/conf-01' '$CONF.pre-1.0' && cmp -s '$T/unite-01' '$UNITE.pre-1.0'"
verifier "code à plat de la 0.1 retiré (bin, src, public, node_modules, ancien deployer.sh), lien canape-convertir retiré" bash -c "[ ! -e '$APP/bin' ] && [ ! -e '$APP/src' ] && [ ! -e '$APP/public' ] && [ ! -e '$APP/node_modules' ] && [ ! -e '$APP/deploiement/deployer.sh' ] && [ ! -L '$CONVERTIR' ]"
verifier "le film posé à plat n'a pas été déplacé ni modifié" bash -c "[ \"\$(md5sum < '$SRV/films/ancien.mp4')\" = '$MD5_FILM' ]"
verifier "commande d'importation des films affichée (canape films importer … --proprietaire)" bash -c "grep -q 'canape films importer $SRV/films --proprietaire' '$T/sortie'"
verifier "lien d'invitation de l'administrateur affiché" sortie_contient "JETON-D-ESSAI"
verifier "unité 1.0 écrite (plus l'ancien ExecStart)" grep -q "actuelle/serveur/src/index.ts serve" "$UNITE"

titre c "mise à niveau depuis la 0.1 qui échoue (1.0 ne démarre pas) : retour à la 0.1"
bac; legacy
cp "$CONF" "$T/conf-01"; cp "$UNITE" "$T/unite-01"
lancer -- --domaine $DOM --paquet "$PCASSE" --node "$NODE_FAUX"
verifier "code non nul, échec annoncé" bash -c "[ $CODE != 0 ] && grep -q 'a échoué' '$T/sortie' && grep -q 'retour à la version 0.1' '$T/sortie'"
verifier "réglages 0.1 remis à l'identique (mot de passe et secret de nouveau actifs)" cmp -s "$T/conf-01" "$CONF"
verifier "unité 0.1 remise à l'identique" cmp -s "$T/unite-01" "$UNITE"
verifier "code de la 0.1 toujours en place" bash -c "[ -f '$APP/bin/canape' ] && [ -f '$APP/src/serveur.js' ] && [ -L '$CONVERTIR' ]"
verifier "le film n'a pas bougé, aucun site nginx n'a été posé" bash -c "[ -f '$SRV/films/ancien.mp4' ] && [ ! -e '$NGX/conf.d/$DOM.conf' ]"
verifier "service 0.1 relancé (restart demandé)" grep -q '^restart canape' "$T/systemctl.log"

# ============================================================================================================
titre d "sans --paquet : dernière release GitHub (simulée par file://), SHA256SUMS vérifié"
bac
cp "$P100" "$REL/canape-1.0.0.tar.gz"; ( cd "$REL" && sha256sum canape-1.0.0.tar.gz > SHA256SUMS )
lancer -- --port "$PORT" --node "$NODE_FAUX"
verifier "code 0, annonce du téléchargement et rien construit sur le serveur" bash -c "[ $CODE = 0 ] && grep -q 'téléchargement du paquet de la dernière release' '$T/sortie' && grep -q 'Dernière release : canape-1.0.0.tar.gz' '$T/sortie' && grep -q 'SHA-256 vérifié d.après SHA256SUMS' '$T/sortie'"
verifier "1.0.0 en service" test "$(etat)" = 1.0.0
bac
echo "0000000000000000000000000000000000000000000000000000000000000000  canape-1.0.0.tar.gz" > "$REL/SHA256SUMS"
lancer -- --port "$PORT" --node "$NODE_FAUX"
verifier "SHA256SUMS qui ne correspond pas : paquet refusé, rien installé" bash -c "[ $CODE != 0 ] && grep -q 'ne correspond pas à SHA256SUMS' '$T/sortie' && [ ! -e '$APP/actuelle' ]"
rm -f "$REL/SHA256SUMS"
bac
lancer -- --port "$PORT" --node "$NODE_FAUX"
verifier "pas de release : message clair qui propose --paquet" bash -c "[ $CODE != 0 ] && grep -q -- '--paquet <fichier>' '$T/sortie'"

# ============================================================================================================
titre e "refus avant toute modification"
bac
lancer FAUX_NODE=18 -- --paquet "$P100" --port "$PORT" --node "$NODE_FAUX"
verifier "Node 18 : refusé (la 1.0 demande 26), rien installé" bash -c "[ $CODE != 0 ] && grep -q 'trop ancien' '$T/sortie' && [ ! -e '$APP' ] && [ ! -e '$CONF' ]"
lancer -- --paquet "$T/inexistant.tar.gz" --node "$NODE_FAUX"
verifier "paquet inexistant : refusé" bash -c "[ $CODE != 0 ] && grep -q 'paquet introuvable' '$T/sortie'"
lancer -- --paquet "$P100" --port 80 --node "$NODE_FAUX"
verifier "port privilégié refusé" code_est 1

titre f "--essai : rien n'est modifié"
bac
lancer -- --essai --domaine $DOM --paquet "$P100" --port "$PORT" --node "$NODE_FAUX"
verifier "code 0, actions décrites" bash -c "[ $CODE = 0 ] && grep -q '\\[essai\\]' '$T/sortie' && grep -q 'Essai : rien n.est modifié' '$T/sortie'"
verifier "aucun dossier, réglage, unité, commande ni site nginx créé ; aucun appel systemctl" bash -c "[ ! -e '$APP' ] && [ ! -e '$CONF' ] && [ ! -e '$UNITE' ] && [ ! -e '$CLI' ] && [ -z \"\$(ls '$NGX/conf.d')\" ] && [ ! -e '$T/systemctl.log' ]"

# ============================================================================================================
titre g "désinstallation"
bac
lancer -- --domaine $DOM --paquet "$P100" --port "$PORT" --node "$NODE_FAUX"
lancer -- --desinstaller --domaine $DOM
verifier "code 0" code_nul
verifier "service, unité, /opt/canape, commande canape et site nginx retirés" bash -c "[ ! -e '$UNITE' ] && [ ! -e '$APP' ] && [ ! -e '$CLI' ] && [ ! -e '$NGX/conf.d/$DOM.conf' ]"
verifier "réglages, données et films gardés, avec la commande pour les supprimer" bash -c "[ -f '$CONF' ] && [ -d '$SRV/donnees' ] && grep -q 'Gardé volontairement' '$T/sortie'"

echo
echo "Résultat : $NB_OK vérification(s) réussie(s), $NB_KO échec(s)."
[ "$NB_KO" = 0 ]
