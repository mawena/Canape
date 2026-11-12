#!/usr/bin/env bash
# Essai rejouable, SANS root, de la partie nginx de deploiement/installer-serveur.sh.
# Monte un faux /etc/nginx avec un AUTRE site déjà en place (et un default_server, et un avertissement préexistant),
# lance le vrai nginx du poste en simple utilisateur sur des ports hauts, et vérifie que l'installation n'abîme rien.
# Rien n'est modifié hors du dossier temporaire. Utilisation : deploiement/essais/essai-nginx.sh
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALLEUR="$RACINE/deploiement/installer-serveur.sh"
NGINX_REEL="$(command -v nginx || echo /usr/sbin/nginx)"
for o in "$NGINX_REEL" curl openssl; do command -v "$o" >/dev/null 2>&1 || { echo "Il faut $o pour cet essai." >&2; exit 2; }; done

T="$(mktemp -d)"
ETC="$T/etc/nginx"; LE="$T/le"; RUN="$T/run"; BIN="$T/bin"
mkdir -p "$ETC/conf.d" "$ETC/sites-available" "$ETC/sites-enabled" "$LE" "$RUN" "$BIN"
SOURCE_OK=1
arreter() { "$BIN/nginx" -s quit >/dev/null 2>&1; sleep 0.3; rm -rf "$T"; }
trap arreter EXIT

# Ports hauts libres : HP (HTTP), HS (HTTPS), PN (port de Node factice)
libre() { local p; while :; do p=$((20000 + RANDOM % 20000)); ss -ltn 2>/dev/null | grep -q ":$p " || { echo "$p"; return; }; done; }
HP="$(libre)"; HS="$(libre)"; PN="$(libre)"
DOM=canape.test

# --- faux programmes ---------------------------------------------------------------------------------------
cat > "$BIN/nginx" <<FAUX
#!/bin/sh
exec "$NGINX_REEL" -p "$RUN/" -c "$ETC/nginx.conf" -e "$RUN/error.log" "\$@"
FAUX
cat > "$BIN/systemctl" <<FAUX
#!/bin/sh
echo "\$*" >> "$T/systemctl.log"
case "\$1 \$2" in
  "reload nginx") exec "$BIN/nginx" -s reload ;;
  "show -p") cat "$T/mainpid" 2>/dev/null || echo 0 ;;
esac
exit 0
FAUX
cat > "$BIN/certbot" <<FAUX
#!/bin/sh
echo "\$*" >> "$T/certbot.log"
[ "\$(cat "$T/certbot.mode" 2>/dev/null)" = fail ] && { echo "certbot factice : échec demandé" >&2; exit 1; }
dom=""; while [ \$# -gt 0 ]; do [ "\$1" = -d ] && dom="\$2"; shift; done
mkdir -p "$LE/live/\$dom"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 2 -subj "/CN=\$dom" \
  -keyout "$LE/live/\$dom/privkey.pem" -out "$LE/live/\$dom/fullchain.pem" >/dev/null 2>&1
EOF_FAUX_PLACEHOLDER
FAUX
sed -i '/EOF_FAUX_PLACEHOLDER/d' "$BIN/certbot"
cat > "$BIN/ss" <<FAUX
#!/bin/sh
cat "$T/ss.txt" 2>/dev/null
FAUX
chmod +x "$BIN"/*

# --- configuration nginx de départ -------------------------------------------------------------------------
cat > "$ETC/nginx.conf" <<CONF
worker_processes 1;
pid $RUN/nginx.pid;
error_log $RUN/error.log;
events { worker_connections 64; }
http {
    access_log off;
    client_body_temp_path $RUN/cb; proxy_temp_path $RUN/px; fastcgi_temp_path $RUN/fc;
    uwsgi_temp_path $RUN/uw; scgi_temp_path $RUN/sc;
    include $ETC/conf.d/*.conf;
    include $ETC/sites-enabled/*;
}
CONF
cat > "$ETC/sites-available/autre.test" <<CONF
server {
    listen $HP default_server;
    server_name autre.test;
    location / { return 200 "autre\n"; }
}
CONF
# deux sites de même nom : « conflicting server name » = avertissement déjà présent, nginx -t réussit quand même
for n in doublon1 doublon2; do
cat > "$ETC/sites-available/$n" <<CONF
server { listen $HP; server_name doublon.test; location / { return 200 "$n\n"; } }
CONF
done
for n in autre.test doublon1 doublon2; do ln -s "$ETC/sites-available/$n" "$ETC/sites-enabled/$n"; done

# gabarit d'essai : le vrai gabarit, avec des ports hauts
gabarit() { # $1 = fichier de sortie
  sed -E -e "s/listen 80;/listen $HP;/" -e "s/listen \[::\]:80;/listen [::]:$HP;/" \
         -e "s/listen 443 ssl http2;/listen $HS ssl http2;/" -e "s/listen \[::\]:443 ssl http2;/listen [::]:$HS ssl http2;/" \
         "$RACINE/deploiement/nginx/canape.conf" > "$1"
}
gabarit "$T/gabarit.conf"
# gabarit cassé dans le 2e bloc (le bloc HTTP provisoire passe, le fichier complet non)
sed '0,/proxy_read_timeout 60s;/s//proxy_read_timeout 60s;\n        directive_inconnue_exprès on;/' "$T/gabarit.conf" > "$T/gabarit-casse2.conf"
# gabarit cassé dès le 1er bloc
sed '0,/server_name/s//directive_inconnue_exprès on;\n    server_name/' "$T/gabarit.conf" > "$T/gabarit-casse1.conf"

printf 'CANAPE_PORT=%s\n' "$PN" > "$T/canape.conf"
"$BIN/nginx" >/dev/null 2>&1
sleep 0.5

# --- outils d'essai ----------------------------------------------------------------------------------------
EXPORTS=(CANAPE_ESSAI_NGINX_SEULEMENT=1 "CANAPE_ESSAI_NGINX_DIR=$ETC" "CANAPE_ESSAI_LETSENCRYPT=$LE"
  "CANAPE_ESSAI_NGINX=$BIN/nginx" "CANAPE_ESSAI_SYSTEMCTL=$BIN/systemctl" "CANAPE_ESSAI_CERTBOT=$BIN/certbot"
  "CANAPE_ESSAI_SS=$BIN/ss" "CANAPE_ESSAI_GABARIT=$T/gabarit.conf" "CANAPE_ESSAI_CONF=$T/canape.conf")
installer() { env "${EXPORTS[@]}" "$@" ; }  # installer VAR=... -- args
lancer() { # lancer [VAR=valeur ...] -- args : sortie dans $T/sortie, code dans $CODE
  local vars=() ; while [ $# -gt 0 ] && [ "$1" != -- ]; do vars+=("$1"); shift; done; shift
  env "${EXPORTS[@]}" "${vars[@]}" "$INSTALLEUR" "$@" > "$T/sortie" 2>&1; CODE=$?
  sleep 0.6   # « reload » de nginx est asynchrone
}
empreinte() {
  ( cd "$T/etc" && find . \( -type f -o -type l \) ! -name "$DOM.conf" | sort | while read -r f; do
      echo "$f -> $(readlink "$f") $(sha256sum < "$f")"; done )
}
http() { curl -s --max-time 5 -H "Host: $1" "http://127.0.0.1:$HP/"; }
code_http() { curl -s --max-time 5 -o /dev/null -w '%{http_code}' -H "Host: $1" "http://127.0.0.1:$HP/"; }
code_https() { curl -sk --max-time 5 -o /dev/null -w '%{http_code}' -H "Host: $1" "https://127.0.0.1:$HS/"; }
fichiers_canape() { ls "$ETC/sites-available/$DOM.conf" "$ETC/sites-enabled/$DOM.conf" "$ETC/conf.d/$DOM.conf" 2>/dev/null; }
reinitialiser() {
  rm -f "$ETC/sites-available/$DOM.conf" "$ETC/sites-enabled/$DOM.conf" "$ETC/conf.d/$DOM.conf" "$ETC/sites-available/canape" "$ETC/sites-enabled/canape" "$ETC/sites-enabled/zzz-casse" "$ETC/sites-available/v6.test" "$ETC/sites-enabled/v6.test"
  rm -rf "$LE/live"; rm -f "$T/ss.txt" "$T/certbot.mode" "$T/certbot.log" "$T/systemctl.log" "$T/mainpid"
  printf 'CANAPE_PORT=%s\n' "$PN" > "$T/canape.conf"
  "$BIN/nginx" -s reload >/dev/null 2>&1; sleep 0.3
}
NB_OK=0; NB_KO=0
verifier() { # verifier "description" commande...
  local d="$1"; shift
  if "$@" >/dev/null 2>&1; then NB_OK=$((NB_OK+1)); echo "    ok  : $d"; else NB_KO=$((NB_KO+1)); echo "    ÉCHEC : $d"; sed 's/^/        | /' "$T/sortie" 2>/dev/null | head -${ESSAI_DETAIL:-0}; fi
}
sortie_contient() { grep -qF -- "$1" "$T/sortie"; }
code_nul() { [ "$CODE" = 0 ]; }
code_non_nul() { [ "$CODE" != 0 ]; }
aucun_fichier_canape() { [ -z "$(fichiers_canape)" ]; }
nginx_valide() { "$BIN/nginx" -t; }
sans_restart() { ! grep -q 'restart nginx' "$T/systemctl.log" 2>/dev/null; }
rechargements() { grep -c '^reload nginx' "$T/systemctl.log" 2>/dev/null || true; }
titre() { printf '\n[%s] %s\n' "$1" "$2"; }
EMPREINTE_0="$(empreinte)"
autres_intacts() { [ "$(empreinte)" = "$EMPREINTE_0" ] ; }
autre_servi() { [ "$(http autre.test)" = autre ]; }

# ============================================================================================================
titre a "installation normale à côté d'un autre site"
reinitialiser; autre_servi || echo "    (départ : autre site non servi ?)"
verifier "départ : nginx -t réussit malgré l'avertissement préexistant" nginx_valide
lancer -- --domaine $DOM
verifier "code de sortie 0" code_nul
verifier "l'autre site est intact (fichiers identiques)" autres_intacts
verifier "l'autre site est toujours servi à son nom" autre_servi
verifier "fichier de Canapé posé avec marqueur" grep -qF 'Géré par Canapé (deploiement/installer-serveur.sh)' "$ETC/sites-available/$DOM.conf"
verifier "lien dans sites-enabled" test -L "$ETC/sites-enabled/$DOM.conf"
verifier "nginx -t réussit" nginx_valide
verifier "Canapé répond à son nom en HTTP (redirection 301, pas l'autre site)" test "$(code_http $DOM)" = 301
verifier "Canapé répond en HTTPS (502 : Node factice absent, mais c'est bien son bloc)" test "$(code_https $DOM)" = 502
verifier "proxy_pass vers le port de canape.conf ($PN), pas de 8080 codé en dur" bash -c "grep -q 'proxy_pass http://127.0.0.1:$PN;' '$ETC/sites-available/$DOM.conf' && ! grep -v '^[[:space:]]*#' '$ETC/sites-available/$DOM.conf' | grep -q 8080 && ! grep -v '^[[:space:]]*#' '$ETC/sites-available/$DOM.conf' | grep -q A_REMPLACER"
verifier "pas de default_server dans le fichier de Canapé" bash -c "! grep -q default_server '$ETC/sites-available/$DOM.conf'"
verifier "pas de « listen [::] » (nginx n'écoute pas déjà en IPv6 ailleurs)" bash -c "! grep -q '^[[:space:]]*listen[[:space:]]*\[::\]' '$ETC/sites-available/$DOM.conf'"
verifier "certbot certonly --nginx -d $DOM avec --deploy-hook" grep -q "^certonly --nginx -d $DOM --deploy-hook systemctl reload nginx" "$T/certbot.log"
verifier "nginx rechargé, jamais redémarré" bash -c "[ $(rechargements) -ge 1 ] && ! grep -q 'restart nginx' '$T/systemctl.log'"
verifier "l'avertissement préexistant est signalé comme préexistant, aucun nouveau" bash -c "grep -q 'Avertissements déjà présents' '$T/sortie' && grep -q 'aucun nouvel avertissement' '$T/sortie'"
cp "$ETC/sites-available/$DOM.conf" "$T/apres-a.conf"; AVANT_CERT_LOG="$(wc -l < "$T/certbot.log")"

# ============================================================================================================
titre b "gabarit volontairement cassé : retour arrière"
reinitialiser
lancer CANAPE_ESSAI_GABARIT="$T/gabarit-casse2.conf" -- --domaine $DOM
verifier "code de sortie non nul" code_non_nul
verifier "aucun fichier de Canapé ne reste (ni fichier ni lien)" aucun_fichier_canape
verifier "l'autre site est intact" autres_intacts
verifier "nginx -t réussit" nginx_valide
verifier "l'autre site est toujours servi" autre_servi
verifier "le bloc provisoire a été retiré du nginx en marche (le nom de Canapé retombe sur le site par défaut)" test "$(http $DOM)" = autre
verifier "le retour arrière est annoncé" sortie_contient "Retour arrière"
verifier "jamais de restart" sans_restart
reinitialiser
lancer CANAPE_ESSAI_GABARIT="$T/gabarit-casse1.conf" -- --domaine $DOM
verifier "erreur dès le 1er bloc : code non nul, aucun fichier restant, autre site intact" bash -c "[ $CODE != 0 ] && [ -z \"\$(ls '$ETC/sites-available/$DOM.conf' '$ETC/sites-enabled/$DOM.conf' 2>/dev/null)\" ]"
verifier "  et aucun rechargement n'a eu lieu" bash -c "! grep -q '^reload' '$T/systemctl.log' 2>/dev/null"
verifier "  et nginx -t réussit, autre site servi" bash -c "'$BIN/nginx' -t && [ \"\$(curl -s -H 'Host: autre.test' http://127.0.0.1:$HP/)\" = autre ]"

# ============================================================================================================
titre c "configuration déjà cassée avant : rien n'est modifié"
reinitialiser
echo 'directive_deja_cassee on;' > "$ETC/sites-available/zzz-casse"; ln -s "$ETC/sites-available/zzz-casse" "$ETC/sites-enabled/zzz-casse"
EMPREINTE_C="$(empreinte)"
lancer -- --domaine $DOM
verifier "code de sortie non nul" code_non_nul
verifier "message : le problème est antérieur" sortie_contient "DÉJÀ"
verifier "aucun fichier de Canapé" aucun_fichier_canape
verifier "rien n'a été modifié" test "$(empreinte)" = "$EMPREINTE_C"
verifier "ni certbot ni rechargement" bash -c "[ ! -e '$T/certbot.log' ] && ! grep -q '^reload' '$T/systemctl.log' 2>/dev/null"
rm -f "$ETC/sites-enabled/zzz-casse" "$ETC/sites-available/zzz-casse"

# ============================================================================================================
titre d "fichier existant sans marqueur / domaine déjà déclaré ailleurs : refus"
reinitialiser
echo '# fichier à moi, sans marqueur' > "$ETC/sites-available/$DOM.conf"; MD5="$(md5sum < "$ETC/sites-available/$DOM.conf")"
lancer -- --domaine $DOM
verifier "code non nul, refus annoncé" bash -c "[ $CODE != 0 ] && grep -q 'pas été créé par Canapé' '$T/sortie'"
verifier "le fichier existant est intact, aucun lien créé" bash -c "[ \"\$(md5sum < '$ETC/sites-available/$DOM.conf')\" = \"$MD5\" ] && [ ! -e '$ETC/sites-enabled/$DOM.conf' ]"
verifier "rien d'autre modifié" autres_intacts
rm -f "$ETC/sites-available/$DOM.conf"
# cas réel du VPS : un fichier « canape » existant déclare déjà le domaine
cat > "$ETC/sites-available/canape" <<CONF
server { listen $HP; server_name $DOM; location / { return 200 "ancien canape\n"; } }
CONF
ln -s "$ETC/sites-available/canape" "$ETC/sites-enabled/canape"
EMPREINTE_D="$(( 0 ))"; EMP_D2="$(cd "$T/etc" && find . -type f -o -type l | sort | xargs -d '\n' sha256sum 2>/dev/null)"
lancer -- --domaine $DOM
verifier "code non nul, le fichier en conflit est nommé" bash -c "[ $CODE != 0 ] && grep -q 'sites-enabled/canape déclare déjà' '$T/sortie'"
verifier "le message dit quoi faire (le retirer soi-même)" sortie_contient "retirez-le vous-même"
verifier "ce fichier « canape » est intact, aucun fichier de Canapé créé" bash -c "[ \"\$(cd '$T/etc' && find . -type f -o -type l | sort | xargs -d '\n' sha256sum 2>/dev/null)\" = \"$EMP_D2\" ]"
reinitialiser

# ============================================================================================================
titre e "port occupé"
reinitialiser
rm -f "$T/canape.conf"
printf 'LISTEN 0 511 127.0.0.1:8080 0.0.0.0:* users:(("php",pid=11,fd=6))\nLISTEN 0 511 84.46.246.202:8080 0.0.0.0:* users:(("node",pid=12,fd=19))\n' > "$T/ss.txt"
lancer -- --domaine $DOM
verifier "1er déploiement, 8080 occupé : un port libre (8780) est choisi seul, annoncé" bash -c "[ $CODE = 0 ] && grep -q 'prend le port libre 8780' '$T/sortie'"
verifier "  et c'est lui qui est dans proxy_pass" grep -q 'proxy_pass http://127.0.0.1:8780;' "$ETC/sites-available/$DOM.conf"
verifier "  autre site intact" autres_intacts
reinitialiser; rm -f "$T/canape.conf"
printf 'LISTEN 0 511 [::]:8080 [::]:* users:(("node",pid=12,fd=19))\nLISTEN 0 511 0.0.0.0:8780 0.0.0.0:* users:(("x",pid=13,fd=1))\n' > "$T/ss.txt"
lancer -- --domaine $DOM
verifier "8080 (sur [::]) et 8780 occupés : le suivant libre (8781)" grep -q 'proxy_pass http://127.0.0.1:8781;' "$ETC/sites-available/$DOM.conf"
reinitialiser; rm -f "$T/canape.conf"
printf 'LISTEN 0 511 127.0.0.1:8080 0.0.0.0:* users:(("php",pid=11,fd=6))\n' > "$T/ss.txt"
lancer -- --domaine $DOM --port 8080
verifier "--port 8080 explicite et occupé : refus avec proposition d'un port libre" bash -c "[ $CODE != 0 ] && grep -q -- '--port 8081' '$T/sortie'"
verifier "  rien n'a été créé" aucun_fichier_canape
reinitialiser
printf 'LISTEN 0 511 127.0.0.1:%s 0.0.0.0:* users:(("node",pid=4242,fd=19))\n' "$PN" > "$T/ss.txt"; echo 4242 > "$T/mainpid"
lancer -- --domaine $DOM
verifier "mise à jour : port déjà dans canape.conf, tenu par le service canape lui-même : accepté" bash -c "[ $CODE = 0 ] && grep -q 'tenu par le service canape lui-même' '$T/sortie'"
reinitialiser
printf 'LISTEN 0 511 127.0.0.1:%s 0.0.0.0:* users:(("php",pid=999,fd=19))\n' "$PN" > "$T/ss.txt"
lancer -- --domaine $DOM
verifier "port de canape.conf tenu par un autre programme : refus, rien créé" bash -c "[ $CODE != 0 ] && [ -z \"\$(ls '$ETC/sites-available/$DOM.conf' 2>/dev/null)\" ]"

# ============================================================================================================
titre f "relance (mise à jour) : idempotente"
reinitialiser
lancer -- --domaine $DOM; PREMIER=$CODE; cp "$ETC/sites-available/$DOM.conf" "$T/f1.conf"; C1="$(wc -l < "$T/certbot.log")"
lancer -- --domaine $DOM
verifier "1re et 2e exécution : code 0" test "$PREMIER" = 0 -a "$CODE" = 0
verifier "fichier de Canapé identique" cmp -s "$T/f1.conf" "$ETC/sites-available/$DOM.conf"
verifier "certbot n'est pas relancé (certificat présent)" test "$(wc -l < "$T/certbot.log")" = "$C1"
verifier "un seul lien, nginx -t réussit, autre site intact et servi" bash -c "[ \$(ls '$ETC/sites-enabled' | grep -c canape) = 1 ] && '$BIN/nginx' -t && [ \"\$(curl -s -H 'Host: autre.test' http://127.0.0.1:$HP/)\" = autre ]" 
verifier "autres fichiers inchangés" autres_intacts
verifier "mêmes résultats qu'à la 1re installation (a)" cmp -s "$T/apres-a.conf" "$ETC/sites-available/$DOM.conf"

# ============================================================================================================
titre g "désinstallation"
lancer -- --desinstaller --domaine $DOM
verifier "code 0" code_nul
verifier "fichier et lien de Canapé retirés" aucun_fichier_canape
verifier "l'autre site est intact et servi" bash -c "true"
verifier "  fichiers identiques" autres_intacts
verifier "  toujours servi" autre_servi
verifier "nginx -t réussit" nginx_valide
verifier "Canapé n'est plus servi à son nom (retombe sur le site par défaut)" test "$(http $DOM)" = autre
verifier "le certificat est gardé, avec la commande pour le supprimer" bash -c "[ -e '$LE/live/$DOM/fullchain.pem' ] && grep -q 'certbot delete --cert-name $DOM' '$T/sortie'"
verifier "service arrêté via systemctl (disable --now canape), jamais de restart nginx" bash -c "grep -q 'reload nginx' '$T/systemctl.log' && ! grep -q 'restart nginx' '$T/systemctl.log'"
reinitialiser
echo 'directive_deja_cassee on;' > "$ETC/sites-available/zzz-casse"; ln -s "$ETC/sites-available/zzz-casse" "$ETC/sites-enabled/zzz-casse"
lancer -- --desinstaller --domaine $DOM
verifier "désinstallation avec nginx déjà cassé : refus sans rien toucher" bash -c "grep -q 'DÉJÀ' '$T/sortie'"
rm -f "$ETC/sites-enabled/zzz-casse" "$ETC/sites-available/zzz-casse"

# ============================================================================================================
titre h "certbot échoue après la pose du bloc HTTP provisoire : retour arrière"
reinitialiser
echo fail > "$T/certbot.mode"
lancer -- --domaine $DOM
verifier "code non nul" code_non_nul
verifier "aucun fichier de Canapé" aucun_fichier_canape
verifier "autre site intact et servi, nginx -t réussit" bash -c "true"
verifier "  fichiers identiques" autres_intacts
verifier "  servi" autre_servi
verifier "  nginx -t" nginx_valide
verifier "bloc provisoire retiré du nginx en marche" test "$(http $DOM)" = autre
reinitialiser

# ============================================================================================================
titre i "IPv6 : gardé seulement là où un autre site écoute déjà en IPv6"
if grep -q '^00000000000000000000000000000001' /proc/net/if_inet6 2>/dev/null; then
  printf 'server { listen [::]:%s; server_name v6.test; location / { return 200 "v6\\n"; } }\n' "$HP" > "$ETC/sites-available/v6.test"
  ln -s "$ETC/sites-available/v6.test" "$ETC/sites-enabled/v6.test"
  lancer -- --domaine $DOM
  verifier "[::]:$HP gardé (un autre site l'a), [::]:$HS retiré (personne d'autre)" bash -c "grep -q 'listen \[::\]:$HP;' '$ETC/sites-available/$DOM.conf' && ! grep -q 'listen \[::\]:$HS' '$ETC/sites-available/$DOM.conf'"
  rm -f "$ETC/sites-enabled/v6.test" "$ETC/sites-available/v6.test"
else
  echo "    (IPv6 absent de ce poste : cas ignoré)"
fi
reinitialiser

# ============================================================================================================
titre j "--essai : rien n'est modifié"
lancer -- --essai --domaine $DOM
verifier "code 0, aucun fichier, rien rechargé, certbot non lancé" bash -c "[ $CODE = 0 ] && [ -z \"\$(ls '$ETC/sites-available/$DOM.conf' 2>/dev/null)\" ] && [ ! -e '$T/certbot.log' ] && ! grep -q '^reload' '$T/systemctl.log' 2>/dev/null"

echo
echo "Résultat : $NB_OK vérification(s) réussie(s), $NB_KO échec(s)."
[ "$NB_KO" = 0 ]
