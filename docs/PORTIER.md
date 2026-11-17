# Connexion par Portier (facultative)

[Portier](https://portier.mawena.cloud) est le fournisseur OpenID Connect de mawena.cloud (mot de passe + second
facteur). Canapé peut proposer **« Se connecter via Portier »** **en plus** de sa connexion habituelle : l'identifiant et
le mot de passe Canapé marchent exactement comme avant. Désactivé par défaut ; désactivé, rien ne change (ni bouton, ni
route, ni champ de `/api/etat`).

## Ce que fait Canapé

1. Le bouton mène à `GET /api/portier/depart` : Canapé lit la découverte de Portier
   (`/.well-known/openid-configuration`), crée `state`, `nonce` et un vérificateur PKCE, pose le cookie
   `canape_portier` (= `state`, 10 min, HttpOnly, SameSite=Lax) et renvoie vers l'autorisation de Portier
   (`response_type=code`, `scope=openid profile email`, `code_challenge_method=S256`).
2. Portier renvoie vers **`/api/portier/retour`** : Canapé vérifie que `state` est celui du cookie (usage unique),
   échange le code (`client_secret_basic` + `code_verifier`), puis vérifie le jeton d'identité RS256 avec la crypto de
   Node et les clés de `/oidc/cles` (signature, `iss`, `aud`, `azp`, `exp`, `iat`, `nonce`).
3. La personne Portier est rattachée à un **compte Canapé existant et actif** par `CANAPE_PORTIER_COMPTES` (son nom
   Portier, ou son e-mail s'il est vérifié). Canapé ouvre alors sa session habituelle (cookie `canape_session`, 30 jours)
   et revient sur la page demandée. **Aucun compte n'est jamais créé** : sans correspondance, retour à la page de
   connexion avec « Ce compte Portier n'est lié à aucun compte Canapé ».

La déconnexion de Canapé ne ferme que la session Canapé (la session Portier reste ouverte pour les autres services).
Canapé n'utilise pas la déconnexion de Portier (`/oidc/deconnexion`).

## Réglages (`/etc/canape/canape.conf`)

| Variable | Défaut | Rôle |
|---|---|---|
| `CANAPE_PORTIER` | `0` | `1` : propose « Se connecter via Portier » |
| `CANAPE_PORTIER_EMETTEUR` | `https://portier.mawena.cloud` | émetteur (`issuer`) de Portier |
| `CANAPE_PORTIER_CLIENT_ID` | `canape` | identifiant du client déclaré dans Portier |
| `CANAPE_PORTIER_SECRET` | vide | secret du client (donné par `portier client-secret`) |
| `CANAPE_PORTIER_SECRET_FICHIER` | vide | ou : fichier contenant le secret (lisible par l'utilisateur `canape`, hors de `/home`) |
| `CANAPE_PORTIER_RETOUR` | `<CANAPE_URL_PUBLIQUE>/api/portier/retour` | adresse de retour (`redirect_uri`) |
| `CANAPE_PORTIER_COMPTES` | vide | correspondances `nom-portier:identifiant-canape`, séparées par des virgules (le nom peut être un e-mail) |

Activé sans secret, ou avec une correspondance mal écrite, le serveur refuse de démarrer et dit pourquoi.

## Déclarer Canapé dans Portier

Chez Portier (pas dans Canapé) :

```
portier client-secret          # donne le secret (pour Canapé) et son empreinte (pour portier.toml)
```

```toml
[[clients]]
id = "canape"
nom = "Canapé"
secret_sha256 = "<empreinte donnée par portier client-secret>"
redirections = ["https://canape.mawena.cloud/api/portier/retour"]
acces = ["charles-gamligo"]
```

Puis `portier verifier-config` et `systemctl --user restart portier`.

## Activer dans Canapé

```bash
sudo tee -a /etc/canape/canape.conf >/dev/null <<'EOF'

# Connexion par Portier, en plus du mot de passe (docs/PORTIER.md)
CANAPE_PORTIER=1
CANAPE_PORTIER_CLIENT_ID=canape
CANAPE_PORTIER_SECRET=<secret donné par portier client-secret>
CANAPE_PORTIER_COMPTES=charles-gamligo:<ton identifiant Canapé>
EOF
sudo systemctl restart canape
```

Pour revenir en arrière : `CANAPE_PORTIER=0` (ou retirer les lignes), puis `sudo systemctl restart canape`.
