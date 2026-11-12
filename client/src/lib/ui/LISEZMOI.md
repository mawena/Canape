# Kit d'interface de Canapé (`$lib/ui`)

Direction artistique : `docs/DESIGN.md` (« un salon la nuit, une lampe allumée »). Un seul thème, sombre. L'interface **tutoie**.
Catalogue visuel de tout le kit : `/apercu-ui` (administrateurs, ou mode développement).

```ts
import { Bouton, Champ, AfficheFilm, toast, formaterDuree } from '$lib/ui/index.ts';
```
Les jetons (couleurs, rayons, ombres, mouvement, polices hébergées dans `static/polices/`) sont dans `jetons.css`, importé une fois par `routes/+layout.svelte`.
Utilise **toujours les variables** (`var(--lampe)`, `var(--s2)`, `var(--r-m)`, `var(--e-4)`…), jamais de couleur en dur. Les anciens noms (`--or`, `--creme`, `--fond-2`…) existent encore comme alias, à abandonner.

Règles : la lampe (`--lampe`) est la **seule** couleur d'action, un seul bouton primaire par écran ; le rose est réservé à l'autre personne ; cibles ≥ 44 px ; focus visible (déjà global) ; jamais d'état par la couleur seule ; textes en français, tutoiement, espace insécable avant `? ! : ;`. Classes utilitaires globales : `t-affiche`, `t-titre1`, `t-titre2`, `t-titre3`, `t-petit`, `t-legende`, `tn` (chiffres tabulaires), `vh` (masqué visuellement).

## Composants (l'API détaillée est en tête de chaque fichier)

| Composant | Rôle / props principales |
|---|---|
| `Bouton` | `variante` primaire·secondaire·discret·danger, `taille` s·m·l, `icone`, `chargement`, `rond` (+`aria-label`), `confirme`, `href` (lien) |
| `Icone` | `nom` (voir `NomIcone` : `lecture`, `pause`, `film`, `maison`, `calendrier`, `utilisateur(s)`, `reglages`, `micro`, `micro-coupe`, `camera`, `camera-coupee`, `chat`, `volume`, `volume-coupe`, `plein-ecran`, `sous-titres`, `langues`, `casque`, `wifi-faible`, `televerser`, `telecharger`, `recherche`, `deconnexion`, `lien`, `copier`, `supprimer`, `plus`, `fermer`, `verifier`, `alerte`, `info`, `historique`, `partager`, `reculer`, `avancer`, `clap`, `canape`, `popcorn`, `disque`, `horloge`, `crayon`…), `taille` (20), `titre` (annoncée si renseigné), `rempli` |
| `Avatar`, `PileAvatars` | `prenom`, `couleur` `#rrggbb`, `taille`, `present` (pastille verte) ; pile : `personnes`, `max` |
| `AfficheFilm` | carte 2:3 avec « lueur » : `film` (type `Film`) ou `titre`/`annee`/`dureeSecondes`/`imageSrc`, `couleur` `#rrggbb`, `href`, `progression` 0–1, `etat`, `preparation`, `partage`, `nouveau`, `sousTitre`, `taille` normal·petit, `selectionnable`, `sansLegende` |
| `MiniAffiche` | vignette pour les lignes de liste |
| `Champ`, `ChampRecherche`, `Selecteur`, `Interrupteur`, `Curseur` | formulaires : `bind:value` / `bind:coche` / `bind:valeur`, `libelle`, `aide`, `erreur` ; `Champ type="password"` a « Afficher » |
| `Onglets` | pilules ; `elements` `{ id, libelle, nombre?, href?, icone? }`, `bind:valeur` ; avec `href` : navigation |
| `Menu` | bouton + menu (`elements: ElementMenu[]`, `declencheur` snippet, `alignement`, `variante`) |
| `Modale` | `bind:ouverte`, `titre`, `dangereuse`, `large`, snippets `children` et `pied` ; feuille du bas sur téléphone |
| `Toasts` + `toast.ok/info/erreur(texte, dureeMs?, action?)` | `<Toasts />` est déjà dans le layout ; ne pas le remettre |
| `Carte`, `Liste` + `LigneListe`, `EnTetePage`, `EtatVide` | structure : `titre`, `doree`, `pied` ; `titre`/`detail`/`debut`/`fin`/`href` ; `titre`/`surtitre`/`description`/`actions` ; `titre`/`texte`/`icone`/`actions` |
| `Badge` | `ton` neutre·ok·alerte·mal·lampe·rose, `icone`, `surImage` |
| `BarreProgression` | `valeur` 0–1 ou `null`, `ton`, `fine`, `libelle` |
| `Chargement`, `Squelette` | anneau d'attente (150 ms de délai) ; squelettes `ligne`·`rond`·`affiche`·`bloc`·`carte-affiche` |
| `Logo`, `Lueur` | « deux coussins » (`mot`) ; halo décoratif de la couleur d'un film |

`format.ts` (réexporté par l'index) : `formaterDuree` (« 1 h 52 »), `formaterChrono` (« 1:12:48 »), `formaterTaille` (« 4,2 Go »), `formaterDateSeance`, `formaterDans`, `formaterJourLong`, `formaterMois`, `salutation`, `listerNoms`, `teinteTitre`, `couleurDuTitre`, `couleurValide`.

## Mise en page
`routes/+layout.svelte` fournit la navigation (barre du haut ; barre d'onglets en bas sur téléphone), la garde de connexion, `<main>` (1440 px, gouttière `--gouttiere`) et les toasts. Les routes `/connexion`, `/invitation/*`, `/rejoindre/*` gèrent elles-mêmes leur page (pas de navigation) ; `/seances/<id>` (la salle) est plein cadre. Les adresses des pages des autres modules sont dans `lib/interface/liens.ts`.
