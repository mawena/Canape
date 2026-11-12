#!/usr/bin/env bash
# Essai rejouable, SANS root, de deploiement/mettre-a-jour, deploiement/recevoir et deploiement/preparer-deploiement-auto.sh.
# Faux paquets (un petit serveur Node qui répond /api/etat avec sa version ; une version « cassée »), faux systemctl,
# faux sudo, dossiers temporaires à la place de /opt/canape et /srv/canape. Rien n'est modifié hors du dossier temporaire.
# Utilisation : deploiement/essais/essai-mise-a-jour.sh   (Node 22+ dans le PATH ; ESSAI_DETAIL=20 pour voir les sorties en échec)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
for o in node curl flock ssh-keygen visudo; do command -v "$o" >/dev/null 2>&1 || { echo "Il faut $o pour cet essai." >&2; exit 2; }; done
T="$(mktemp -d)"
APP="$T/opt"; SRV="$T/srv"; CONF="$T/canape.conf"; BIN="$T/bin"; PAQUETS="$T/paquets"; UNITE="$T/canape.service"
mkdir -p "$APP" "$SRV/donnees" "$BIN" "$PAQUETS" "$T/tmp"
source "$RACINE/deploiement/essais/commun.sh"
trap 'arreter_faux_service; rm -rf "$T"' EXIT

PORT="$(libre)"
printf 'CANAPE_PORT=%s\nCANAPE_DONNEES=%s/donnees\n' "$PORT" "$SRV" > "$CONF"
ecrire_faux_systemctl "$BIN/systemctl"; ecrire_faux_journalctl "$BIN/journalctl"
printf '#!/bin/sh\necho "$*" >> "%s/sudo.log"\nexec "$@"\n' "$T" > "$BIN/sudo"; chmod +x "$BIN/sudo"
EXPORTS=(CANAPE_ESSAI_APP="$APP" CANAPE_ESSAI_SRV="$SRV" CANAPE_ESSAI_CONF="$CONF" CANAPE_ESSAI_SANS_ROOT=1
  CANAPE_ESSAI_SYSTEMCTL="$BIN/systemctl" CANAPE_ESSAI_JOURNALCTL="$BIN/journalctl" CANAPE_ESSAI_ATTENTE=4)
MAJ="$RACINE/deploiement/mettre-a-jour"
maj() { env "${EXPORTS[@]}" "$MAJ" "$@" > "$T/sortie" 2>&1; CODE=$?; }
recevoir() { # recevoir "<commande ssh>" <fichier stdin> [VAR=valeur ...]
  local cmd="$1" entree="$2"; shift 2
  env "${EXPORTS[@]}" CANAPE_ESSAI_METTRE_A_JOUR="$MAJ" CANAPE_ESSAI_SUDO="$BIN/sudo" CANAPE_ESSAI_TMP="$T/tmp" "$@" \
    SSH_ORIGINAL_COMMAND="$cmd" "$RACINE/deploiement/recevoir" < "$entree" > "$T/sortie" 2>&1; CODE=$?
}
etat() { curl -s --max-time 3 "http://127.0.0.1:$PORT/api/etat" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'; }
lien() { basename "$(readlink "$APP/actuelle" 2>/dev/null)"; }
base() { md5sum "$SRV/donnees/canape.sqlite" "$SRV/donnees/canape.sqlite-wal" 2>/dev/null | cut -d' ' -f1 | tr '\n' ' '; }
versions() { ls -1 "$APP/versions" | grep -v '^\.' | tr '\n' ' '; }
nb_versions() { ls -1 "$APP/versions" | grep -vc '^\.' || true; }
nb_sauvegardes() { ls -1 "$SRV/donnees/sauvegardes" | wc -l; }
reste_temp() { find "$APP/versions" -maxdepth 1 -name '.neuf.*' | grep -q .; }

faire_paquet p100 1.0.0 aaaaaaa; S100="$PAQUET_SHA"
faire_paquet p101 1.0.1 bbbbbbb; S101="$PAQUET_SHA"
faire_paquet p102casse 1.0.2 ccccccc casse; S102C="$PAQUET_SHA"
faire_paquet p102mv 1.0.2 ddddddd mauvaise-version; S102M="$PAQUET_SHA"

# ============================================================================================================
titre a "première installation d'un paquet (pas de version avant, pas de base)"
maj "$PAQUETS/p100.tar.gz" "$S100"
verifier "code 0" code_nul
verifier "SHA-256 vérifié, version annoncée" bash -c "grep -q 'SHA-256 vérifié' '$T/sortie' && grep -q 'Canapé 1.0.0 (commit aaaaaaa)' '$T/sortie'"
verifier "lien actuelle -> versions/1.0.0-aaaaaaa" test "$(lien)" = 1.0.0-aaaaaaa
verifier "le service répond avec la version 1.0.0 (/api/etat)" test "$(etat)" = 1.0.0
verifier "la base a été créée par la migration du faux service" grep -q 'migration 1.0.0' "$SRV/donnees/canape.sqlite"
verifier "pas de base avant : rien à sauvegarder, dossier de sauvegarde vide de fichiers" bash -c "[ -z \"\$(ls '$SRV/donnees/sauvegardes'/*/ 2>/dev/null)\" ] && grep -q 'rien à sauvegarder' '$T/sortie'"
verifier "aucun dossier temporaire ne reste dans versions/" bash -c "! find '$APP/versions' -maxdepth 1 -name '.neuf.*' | grep -q ."
# on ajoute un -wal pour que la sauvegarde ait à gérer les deux fichiers
echo "wal-de-1.0.0" > "$SRV/donnees/canape.sqlite-wal"

titre b "mise à jour 1.0.0 -> 1.0.1 : sauvegarde, bascule, vérification"
AVANT="$(base)"
maj "$PAQUETS/p101.tar.gz" "$S101"
verifier "code 0" code_nul
verifier "lien sur 1.0.1-bbbbbbb, service en 1.0.1" bash -c "[ '$(lien)' = 1.0.1-bbbbbbb ] && [ '$(etat)' = 1.0.1 ]"
SAUV="$(ls -d "$SRV/donnees/sauvegardes"/*avant-1.0.1-bbbbbbb 2>/dev/null | head -1)"
verifier "sauvegarde créée, nommée d'après la nouvelle version" test -n "$SAUV"
verifier "la sauvegarde contient canape.sqlite et le -wal, identiques à l'état d'avant" bash -c "[ \"\$(md5sum '$SAUV/canape.sqlite' '$SAUV/canape.sqlite-wal' | cut -d' ' -f1 | tr '\n' ' ')\" = '$AVANT' ]"
verifier "l'ancienne version 1.0.0 est gardée" test -d "$APP/versions/1.0.0-aaaaaaa"
verifier "le service a été arrêté puis redémarré (systemctl stop puis start)" bash -c "grep -n '^stop canape' '$T/systemctl.log' | tail -1 | cut -d: -f1 | xargs -I{} sh -c 'tail -n +{} \"$T/systemctl.log\" | grep -q \"^start canape\"'"
maj "$PAQUETS/p101.tar.gz" "$S101"
verifier "même version relancée : « déjà en service », code 0" bash -c "[ $CODE = 0 ] && grep -q 'déjà en service' '$T/sortie'"

# ============================================================================================================
titre c "échec : le nouveau service ne démarre pas -> retour arrière complet"
echo "wal-avant-échec" > "$SRV/donnees/canape.sqlite-wal"
AVANT="$(base)"; NB_V="$(nb_versions)"
maj "$PAQUETS/p102casse.tar.gz" "$S102C"
verifier "code 1 (échec) et message clair" bash -c "[ $CODE = 1 ] && grep -q 'la mise à jour vers 1.0.2-ccccccc a échoué' '$T/sortie'"
verifier "retour arrière annoncé : base restaurée, lien remis, service redémarré" bash -c "grep -q 'Base de données restaurée' '$T/sortie' && grep -q 'Lien .* remis sur' '$T/sortie' && grep -q 'redémarré sur l.ancienne version (1.0.1)' '$T/sortie'"
verifier "base (canape.sqlite et -wal) restaurée à l'identique, octet pour octet" test "$(base)" = "$AVANT"
verifier "lien actuelle de nouveau sur 1.0.1-bbbbbbb" test "$(lien)" = 1.0.1-bbbbbbb
verifier "l'ancienne version répond (1.0.1)" test "$(etat)" = 1.0.1
verifier "la version cassée n'est pas gardée, aucun dossier temporaire" bash -c "[ ! -e '$APP/versions/1.0.2-ccccccc' ] && [ '$(nb_versions)' = '$NB_V' ] && ! find '$APP/versions' -maxdepth 1 -name '.neuf.*' | grep -q ."
verifier "les derniers messages du journal du service sont affichés" sortie_contient "fausse erreur"

titre c2 "échec : le service répond avec une autre version -> même retour arrière"
AVANT="$(base)"
maj "$PAQUETS/p102mv.tar.gz" "$S102M"
verifier "code 1, version vue ≠ version attendue annoncée" bash -c "[ $CODE = 1 ] && grep -q 'répond avec la version « 0.0.0 » au lieu de « 1.0.2 »' '$T/sortie'"
verifier "base identique, lien sur 1.0.1, service en 1.0.1" bash -c "[ \"$(base)\" = '$AVANT' ] && [ '$(lien)' = 1.0.1-bbbbbbb ] && [ '$(etat)' = 1.0.1 ]"

# ============================================================================================================
titre d "trois versions gardées, cinq sauvegardes"
for v in 1.0.2:eeeeeee 1.0.3:fffffff 1.0.4:1111111 1.0.5:2222222 1.0.6:3333333; do
  faire_paquet "p-${v%%:*}" "${v%%:*}" "${v##*:}"; maj "$PAQUETS/p-${v%%:*}.tar.gz" "$PAQUET_SHA"
  [ "$CODE" = 0 ] || { echo "    (mise à jour $v : code $CODE)"; break; }
done
verifier "dernière mise à jour réussie, service en 1.0.6" test "$(etat)" = 1.0.6
verifier "exactement 3 versions gardées : 1.0.4, 1.0.5, 1.0.6" test "$(versions)" = "1.0.4-1111111 1.0.5-2222222 1.0.6-3333333 "
verifier "la version précédente (1.0.5) est gardée pour le retour manuel" test -d "$APP/versions/1.0.5-2222222"
verifier "exactement 5 sauvegardes gardées" test "$(nb_sauvegardes)" = 5
retour_manuel() { ln -sfn "$APP/versions/1.0.5-2222222" "$APP/actuelle" && "$BIN/systemctl" restart canape && sleep 1 && [ "$(etat)" = 1.0.5 ]; }
verifier "retour arrière manuel : ln -sfn vers la version précédente puis redémarrage, le service sert 1.0.5" retour_manuel

# ============================================================================================================
titre e "verrou : deux mises à jour simultanées"
ln -sfn "$APP/versions/1.0.6-3333333" "$APP/actuelle"; "$BIN/systemctl" restart canape; sleep 1
( exec 9>"$APP/.mettre-a-jour.verrou"; flock 9; sleep 3 ) &
sleep 0.5
faire_paquet p107 1.0.7 4444444
maj "$PAQUETS/p107.tar.gz" "$PAQUET_SHA"
verifier "refusée avec le code 75 et un message clair" bash -c "[ $CODE = 75 ] && grep -q 'autre mise à jour est déjà en cours' '$T/sortie'"
verifier "rien n'a changé (lien sur 1.0.6)" test "$(lien)" = 1.0.6-3333333
wait
maj "$PAQUETS/p107.tar.gz" "$PAQUET_SHA"
verifier "le verrou libéré, la mise à jour passe" bash -c "[ $CODE = 0 ] && [ '$(etat)' = 1.0.7 ]"

# ============================================================================================================
titre f "paquets refusés avant tout arrêt du service"
AVANT="$(base)"; L0="$(lien)"; SC0="$(wc -l < "$T/systemctl.log")"
maj "$PAQUETS/p101.tar.gz" 0000000000000000000000000000000000000000000000000000000000000000
verifier "SHA-256 faux : code 3, message, rien modifié" bash -c "[ $CODE = 3 ] && grep -q 'ne correspond pas' '$T/sortie'"
maj "$PAQUETS/p101.tar.gz" pas-un-sha
verifier "SHA-256 mal formé : code 2" code_est 2
maj "$T/inexistant.tar.gz" "$S101"
verifier "paquet inexistant : code 2" code_est 2
faire_paquet pdanger 1.0.8 5555555 dangereux
maj "$PAQUETS/pdanger.tar.gz" "$PAQUET_SHA"
verifier "paquet avec une entrée « ../ » : code 4, refusé" bash -c "[ $CODE = 4 ] && grep -q 'chemins absolus ou « .. »' '$T/sortie'"
verifier "  et rien n'a été écrit à côté de versions/" bash -c "[ ! -e '$APP/piege.txt' ] && [ ! -e '$APP/versions/../piege.txt' ]"
faire_paquet plien 1.0.8 5555555 lien
maj "$PAQUETS/plien.tar.gz" "$PAQUET_SHA"
verifier "paquet avec un lien vers /etc/passwd : code 4" bash -c "[ $CODE = 4 ] && grep -q 'lien qui sort' '$T/sortie'"
faire_paquet psansv 1.0.8 5555555 sans-version
maj "$PAQUETS/psansv.tar.gz" "$PAQUET_SHA"
verifier "paquet sans VERSION : code 4" code_est 4
echo "pas une archive" > "$T/faux.tar.gz"
maj "$T/faux.tar.gz" "$(sha256sum "$T/faux.tar.gz" | cut -d' ' -f1)"
verifier "fichier qui n'est pas une archive : code 4" code_est 4
verifier "aucun de ces refus n'a touché au service, au lien, à la base ni laissé de dossier temporaire" bash -c "[ \"$(base)\" = '$AVANT' ] && [ '$(lien)' = '$L0' ] && [ \$(wc -l < '$T/systemctl.log') = $SC0 ] && ! find '$APP/versions' -maxdepth 1 -name '.neuf.*' | grep -q ."

# ============================================================================================================
titre g "recevoir : la commande forcée de la clé SSH"
L0="$(lien)"; SC0="$(wc -l < "$T/systemctl.log")"
faire_paquet p110 1.1.0 6666666; S110="$PAQUET_SHA"; P110="$PAQUETS/p110.tar.gz"
recevoir "ls -la" "$P110"
verifier "commande quelconque (ls -la) : refusée, code 2" bash -c "[ $CODE = 2 ] && grep -q 'seule la commande' '$T/sortie'"
recevoir "" "$P110"
verifier "aucune commande (connexion interactive) : refusée" code_est 2
recevoir "deployer" "$P110"
verifier "« deployer » sans SHA : refusée" code_est 2
recevoir "deployer abc123" "$P110"
verifier "SHA trop court : refusé" code_est 2
recevoir "deployer $S110; touch $T/pirate" "$P110"
verifier "injection après le SHA (« ; touch … ») : refusée, rien exécuté" bash -c "[ $CODE = 2 ] && [ ! -e '$T/pirate' ]"
recevoir "deployer $S110 && id" "$P110"
verifier "« && id » après le SHA : refusé" code_est 2
recevoir "deployer 0000000000000000000000000000000000000000000000000000000000000000" "$P110"
verifier "SHA faux pour ce paquet : refusé (code 2), message" bash -c "[ $CODE = 2 ] && grep -q 'ne correspond pas à celui annoncé' '$T/sortie'"
: > "$T/vide"; recevoir "deployer $S110" "$T/vide"
verifier "paquet vide : refusé" bash -c "[ $CODE = 2 ] && grep -q 'paquet vide' '$T/sortie'"
recevoir "deployer $S110" "$P110" CANAPE_ESSAI_TAILLE_MAX=1000
verifier "paquet trop gros (limite d'essai 1000 octets) : refusé" bash -c "[ $CODE = 2 ] && grep -q 'trop gros' '$T/sortie'"
verifier "aucun refus n'a lancé sudo, ni touché au lien ni au service" bash -c "[ ! -e '$T/sudo.log' ] && [ '$(lien)' = '$L0' ] && [ \$(wc -l < '$T/systemctl.log') = $SC0 ]"
verifier "aucun dossier temporaire de recevoir ne reste" bash -c "[ -z \"\$(ls '$T/tmp')\" ]"
recevoir "deployer $S110" "$P110"
verifier "bon paquet, bon SHA : code 0, la sortie de mettre-a-jour est renvoyée" bash -c "[ $CODE = 0 ] && grep -q 'Paquet reçu' '$T/sortie' && grep -q 'mise à jour réussie (1.1.0-6666666)' '$T/sortie'"
verifier "version 1.1.0 en service" bash -c "[ '$(lien)' = 1.1.0-6666666 ] && [ '$(etat)' = 1.1.0 ]"
verifier "sudo a été appelé avec mettre-a-jour, un fichier et le SHA" bash -c "grep -q 'deploiement/mettre-a-jour .*paquet.tar.gz $S110\$' '$T/sudo.log'"
verifier "dossier temporaire retiré" bash -c "[ -z \"\$(ls '$T/tmp')\" ]"
faire_paquet p111 1.1.1 7777777 casse
recevoir "deployer $PAQUET_SHA" "$PAQUETS/p111.tar.gz"
verifier "paquet qui échoue à la mise en service : recevoir renvoie un code non nul (le job GitHub échouera)" bash -c "[ $CODE != 0 ] && grep -q 'a échoué' '$T/sortie'"
verifier "  retour arrière : toujours en 1.1.0" bash -c "[ '$(lien)' = 1.1.0-6666666 ] && [ '$(etat)' = 1.1.0 ]"

# ============================================================================================================
titre h "preparer-deploiement-auto.sh --essai"
PREP="$RACINE/deploiement/preparer-deploiement-auto.sh"
mkdir -p "$T/prep/opt/deploiement"; cp "$RACINE/deploiement/mettre-a-jour" "$RACINE/deploiement/recevoir" "$T/prep/opt/deploiement/"
chmod 755 "$T/prep/opt" "$T/prep/opt/deploiement" "$T/prep/opt/deploiement"/*
ssh-keygen -q -t ed25519 -N "" -C canape-deploiement -f "$T/prep/cle"
prep() { env CANAPE_ESSAI_APP="$T/prep/opt" CANAPE_ESSAI_SANS_ROOT=1 CANAPE_ESSAI_MAISON="$T/prep/maison" CANAPE_ESSAI_SUDOERS="$T/prep/sudoers" "$PREP" "$@" > "$T/sortie" 2>&1; CODE=$?; }
prep --essai "$T/prep/cle.pub"
verifier "clé valide : code 0, sudoers validé par visudo, rien créé" bash -c "[ $CODE = 0 ] && grep -q 'validé par visudo' '$T/sortie' && [ ! -e '$T/prep/maison' ] && [ ! -e '$T/prep/sudoers' ]"
verifier "la ligne authorized_keys porte la commande forcée et restrict" grep -q 'command="'"$T"'/prep/opt/deploiement/recevoir",restrict ssh-ed25519 ' "$T/sortie"
verifier "le sudo est limité à mettre-a-jour" grep -q 'NOPASSWD: .*/deploiement/mettre-a-jour /var/tmp/canape-recevoir' "$T/sortie"
verifier "les valeurs des secrets GitHub sont affichées (VPS_EMPREINTE_HOTE…)" grep -q 'VPS_EMPREINTE_HOTE' "$T/sortie"
prep --essai 'command="rm -rf /" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexemple'
verifier "clé précédée d'une option : refusée" bash -c "[ $CODE != 0 ] && grep -q 'pas une clé PUBLIQUE' '$T/sortie'"
printf '%s\n' "ssh-ed25519 AAAA-pas-une-vraie-cle x" > "$T/prep/mauvaise.pub"
prep --essai "$T/prep/mauvaise.pub"
verifier "clé illisible pour ssh-keygen : refusée" code_est 1
prep --essai "$T/prep/cle"
verifier "clé PRIVÉE passée par erreur : refusée" code_est 1
chmod 775 "$T/prep/opt/deploiement/mettre-a-jour"
prep --essai "$T/prep/cle.pub"
verifier "mettre-a-jour modifiable par le groupe : refusé (élévation de droits possible)" bash -c "[ $CODE != 0 ] && grep -q 'droits dangereux' '$T/sortie'"
chmod 755 "$T/prep/opt/deploiement/mettre-a-jour"
prep --essai --retirer
verifier "--retirer --essai : rien n'est supprimé, code 0" code_nul

echo
echo "Résultat : $NB_OK vérification(s) réussie(s), $NB_KO échec(s)."
[ "$NB_KO" = 0 ]
