<script lang="ts">
  /** Catalogue des composants du kit (`/apercu-ui`) : réservé aux administrateurs (ou au mode développement). */
  import {
    AfficheFilm, Avatar, Badge, BarreProgression, Bouton, Carte, Champ, ChampRecherche, Chargement, Curseur, EnTetePage, EtatVide,
    Icone, Interrupteur, LigneListe, Liste, Logo, Lueur, Menu, MiniAffiche, Modale, Onglets, PileAvatars, Selecteur, Squelette, toast,
  } from '$lib/ui/index.ts';
  import { session } from '$lib/interface/session.svelte.ts';

  const autorise = $derived(import.meta.env.DEV || session.estAdmin);
  let texte = $state('');
  let mdp = $state('');
  let recherche = $state('');
  let onglet = $state('tous');
  let tri = $state('recents');
  let coche = $state(true);
  let volume = $state(0.8);
  let modale = $state(false);
  let dangereuse = $state(false);
  const COULEURS = ['#f4a85b', '#e892b0', '#8fc7f0', '#b4a2f0', '#9ad9a0', '#f0d27a', '#14111a', '#857a95', '#f4eee7', '#6fd9b1', '#ffd166', '#ff7f70'];
  const NOMS = ['fond', 'lampe', 'rose', 'bleu', 'violet', 'vert', 'jaune'];
  const FILMS = [
    { id: 'a', titre: 'Les Heures bleues', annee: 2023, duree: 6720, etat: 'pret' as const },
    { id: 'b', titre: 'Un été à Sète', annee: 2019, duree: 5880, etat: 'pret' as const },
    { id: 'c', titre: 'La Nuit des lanternes', annee: 2021, duree: 7500, etat: 'analyse' as const },
    { id: 'd', titre: 'Le Dernier Tramway', annee: 1974, duree: 6000, etat: 'erreur' as const },
  ];
</script>

<svelte:head><title>Aperçu du kit · Canapé</title></svelte:head>

{#if !autorise}
  <EtatVide icone="alerte" titre="Cette page est réservée aux administrateurs." />
{:else}
  <div class="apercu">
    <EnTetePage titre="Le kit d’interface" description="Tous les composants de lib/ui, dans leurs états." taille="titre1" />

    <section>
      <h2 class="t-titre2">Couleurs</h2>
      <div class="palette">
        {#each [['--fond', 'fond'], ['--s1', 's1'], ['--s2', 's2'], ['--s3', 's3'], ['--bord-champ', 'bord-champ'], ['--texte', 'texte'], ['--doux', 'doux'], ['--discret', 'discret'], ['--lampe', 'lampe'], ['--lampe-vive', 'lampe-vive'], ['--ok', 'ok'], ['--alerte', 'alerte'], ['--mal', 'mal'], ['--rose', 'rose']] as [v, n] (v)}
          <div class="teinte" style:background="var({v})"><span class="n">{n}</span></div>
        {/each}
      </div>
    </section>

    <section>
      <h2 class="t-titre2">Typographie</h2>
      <p class="t-affiche">Bonsoir Awa</p>
      <p class="t-titre1">Titre de page, titre de film</p>
      <p class="t-titre2">Titre de section</p>
      <p class="t-titre3">Titre de carte ou de dialogue</p>
      <p>Corps de texte : le même film, au même instant, chacun chez soi. Œufs, cœur, déjà, à côté.</p>
      <p class="t-petit" style="color: var(--discret)">Petit : métadonnées et aides, 1 h 52 · 4,2 Go</p>
    </section>

    <section>
      <h2 class="t-titre2">Boutons et icônes</h2>
      <div class="rang">
        <Bouton icone="lecture">Entrer dans la salle</Bouton>
        <Bouton variante="secondaire" icone="lien">Copier le lien</Bouton>
        <Bouton variante="discret">Plus tard</Bouton>
        <Bouton variante="danger" icone="supprimer">Supprimer</Bouton>
        <Bouton variante="danger" confirme>Confirmer</Bouton>
        <Bouton chargement>Envoi…</Bouton>
        <Bouton disabled>Désactivé</Bouton>
        <Bouton taille="s" variante="secondaire">Petit</Bouton>
        <Bouton variante="secondaire" rond icone="fermer" aria-label="Fermer" />
      </div>
      <div class="rang"><Bouton taille="l" icone="plus">Lancer une séance</Bouton></div>
      <div class="rang icones">
        {#each ['lecture', 'pause', 'film', 'maison', 'calendrier', 'utilisateurs', 'reglages', 'micro', 'camera', 'chat', 'volume', 'sous-titres', 'televerser', 'recherche', 'lien', 'supprimer', 'historique', 'popcorn', 'canape', 'casque', 'wifi-faible', 'copier', 'partager'] as n (n)}
          <span class="ic" title={n}><Icone nom={n as never} taille={24} /></span>
        {/each}
      </div>
    </section>

    <section class="grille2">
      <div class="colonne">
        <h2 class="t-titre2">Champs</h2>
        <Champ libelle="Identifiant" bind:value={texte} aide="Sans espace, en minuscules." />
        <Champ libelle="Mot de passe" type="password" bind:value={mdp} erreur="12 caractères au minimum. Il en manque 7." />
        <ChampRecherche bind:value={recherche} libelle="Rechercher un film" placeholder="Titre, année, personne…" />
        <Selecteur libelle="Trier par" bind:value={tri} options={[{ valeur: 'recents', libelle: 'Récents' }, { valeur: 'titre', libelle: 'Titre' }, { valeur: 'duree', libelle: 'Durée' }]} />
        <Interrupteur bind:coche libelle="Baisser le film quand quelqu’un parle" aide="Le film descend à 35 % pendant que l’autre parle." />
        <Curseur bind:valeur={volume} libelle="Film" icone="volume" libelleVisible afficherValeur />
      </div>
      <div class="colonne">
        <h2 class="t-titre2">Navigation et menus</h2>
        <Onglets libelle="Filtrer" bind:valeur={onglet} elements={[{ id: 'tous', libelle: 'Tous', nombre: 12 }, { id: 'miens', libelle: 'Les miens', nombre: 7 }, { id: 'partages', libelle: 'Partagés avec moi', nombre: 5 }]} />
        <div class="rang">
          <Menu libelle="Actions du film" elements={[{ libelle: 'Lancer une séance', icone: 'lecture' }, { libelle: 'Partager', icone: 'partager' }, { libelle: 'Supprimer', icone: 'supprimer', danger: true, separateurAvant: true }]} />
          <Menu libelle="Compte" variante="libre" elements={[{ libelle: 'Mon compte', icone: 'utilisateur' }, { libelle: 'Se déconnecter', icone: 'deconnexion', separateurAvant: true }]}>
            {#snippet declencheur()}<Avatar prenom="Awa" taille={40} />{/snippet}
          </Menu>
        </div>
        <h2 class="t-titre2">Badges et présence</h2>
        <div class="rang">
          <Badge>Neutre</Badge><Badge ton="ok" icone="verifier">Prêt</Badge><Badge ton="alerte" icone="horloge">Préparation 62 %</Badge>
          <Badge ton="mal" icone="alerte">Son non lisible</Badge><Badge ton="lampe">Nouveau</Badge><Badge ton="rose" icone="utilisateurs">Partagé</Badge>
        </div>
        <div class="rang">
          <Avatar prenom="Awa" couleur="#f4a85b" present /><Avatar prenom="Léa" couleur="#e892b0" /><Avatar prenom="Sam" couleur="#8fc7f0" taille={56} />
          <PileAvatars personnes={[{ prenom: 'Awa' }, { prenom: 'Léa' }, { prenom: 'Sam' }, { prenom: 'Mehdi' }, { prenom: 'Zoé' }, { prenom: 'Noa' }]} />
          <Logo mot />
        </div>
        <BarreProgression valeur={0.64} libelle="Envoi" /><BarreProgression valeur={0.31} ton="doux" libelle="En pause" /><BarreProgression valeur={null} libelle="Attente" />
        <div class="rang">
          <Bouton variante="secondaire" onclick={() => toast.ok('Lien copié. À coller où tu veux.')}>Toast</Bouton>
          <Bouton variante="secondaire" onclick={() => toast.info('Film retiré.', 0, { libelle: 'Annuler', surClic: () => {} })}>Toast + action</Bouton>
          <Bouton variante="secondaire" onclick={() => toast.erreur('Connexion perdue à 78 %. Rien n’est perdu.')}>Erreur</Bouton>
          <Bouton variante="secondaire" onclick={() => { dangereuse = false; modale = true; }}>Modale</Bouton>
          <Bouton variante="danger" onclick={() => { dangereuse = true; modale = true; }}>Modale danger</Bouton>
        </div>
      </div>
    </section>

    <section>
      <h2 class="t-titre2">Affiches</h2>
      <div class="affiches">
        {#each FILMS as f, i (f.id)}
          <AfficheFilm film={f} href="#" progression={i === 1 ? 0.45 : null} nouveau={i === 0} partage={i === 1} preparation={i === 2 ? 0.62 : null} sousTitre={i === 1 ? 'Arrêté à 0 h 52' : undefined} couleur={i === 0 ? '#b85c7a' : null} />
        {/each}
        <Squelette forme="carte-affiche" />
      </div>
    </section>

    <section class="grille2">
      <div class="colonne">
        <h2 class="t-titre2">Carte, liste</h2>
        <Carte titre="Une carte" doree>Contenu de la carte, avec son contour lampe.</Carte>
        <Liste libelle="Exemple">
          <LigneListe titre="Les Heures bleues" detail="Vu avec Léa · 13 nov.">
            {#snippet debut()}<MiniAffiche titre="Les Heures bleues" largeur={44} />{/snippet}
            {#snippet fin()}<Bouton taille="s" variante="secondaire" icone="reculer">Revoir</Bouton>{/snippet}
          </LigneListe>
          <LigneListe titre="Un été à Sète" detail="Vu seul · 2 nov." miseEnAvant>
            {#snippet debut()}<MiniAffiche titre="Un été à Sète" largeur={44} />{/snippet}
          </LigneListe>
        </Liste>
        <div class="lueur-demo"><Lueur couleur="#e892b0" intensite={0.45} /><p>La lueur dépose la couleur du film derrière un élément.</p></div>
      </div>
      <div class="colonne">
        <h2 class="t-titre2">États</h2>
        <EtatVide titre="Rien à l’affiche pour l’instant." texte="Dépose un film : il sera prêt à regarder dès qu’il est arrivé.">
          {#snippet actions()}<Bouton icone="televerser">Ajouter un film</Bouton>{/snippet}
        </EtatVide>
        <Chargement texte="On prépare la salle…" />
        <Squelette largeur="70%" /><Squelette largeur="40%" hauteur="12px" />
      </div>
    </section>

    <Modale bind:ouverte={modale} titre={dangereuse ? 'Supprimer Les Heures bleues ?' : 'Une modale'} {dangereuse}>
      <p>{dangereuse ? 'Les séances prévues avec ce film seront annulées.' : 'Fond --s2, rayon 22, Échap pour fermer.'}</p>
      {#snippet pied()}
        <Bouton variante="discret" onclick={() => (modale = false)}>{dangereuse ? 'Garder' : 'Fermer'}</Bouton>
        {#if dangereuse}<Bouton variante="danger" confirme onclick={() => (modale = false)}>Supprimer</Bouton>{/if}
      {/snippet}
    </Modale>
  </div>
{/if}

<style>
  .apercu { display: grid; gap: var(--e-9); }
  section { display: grid; gap: var(--e-4); align-content: start; }
  .palette { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .teinte { min-height: 80px; border-radius: var(--r-m); border: 1px solid var(--bord); display: flex; align-items: flex-end; padding: 10px; }
  .n { font-size: 12px; font-weight: 600; background: rgba(20, 17, 26, 0.75); color: var(--texte); padding: 2px 8px; border-radius: 999px; }
  .rang { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .icones { gap: 8px; }
  .ic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--r-m); background: var(--s1); border: 1px solid var(--bord); color: var(--doux); }
  .grille2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--e-8); }
  .colonne { display: grid; gap: var(--e-4); align-content: start; min-width: 0; }
  .affiches { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 28px 20px; }
  .lueur-demo { position: relative; isolation: isolate; overflow: hidden; background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-l); padding: var(--e-7); }
</style>
