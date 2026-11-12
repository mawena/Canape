<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { Film, VueFilms } from '@canape/partage';
  import { ErreurApi } from '$lib/api/client.ts';
  import { listerFilms, type TriFilms } from '$lib/mediatheque/api.ts';
  import GrilleFilms from '$lib/mediatheque/GrilleFilms.svelte';
  import PanneauTeleversement from '$lib/mediatheque/PanneauTeleversement.svelte';
  import { televersements } from '$lib/mediatheque/televersements.svelte.ts';
  import ModaleAjoutTorrent from '$lib/mediatheque/torrents/ModaleAjoutTorrent.svelte';
  import PanneauTelechargements from '$lib/mediatheque/torrents/PanneauTelechargements.svelte';
  import { telechargements } from '$lib/mediatheque/torrents/telechargements.svelte.ts';
  import { Bouton, Chargement, EtatVide, Icone, Modale, toast } from '$lib/ui/index.ts';

  const FILTRES: Array<{ valeur: VueFilms; libelle: string }> = [
    { valeur: 'tous', libelle: 'Tous' },
    { valeur: 'miens', libelle: 'Les miens' },
    { valeur: 'partages', libelle: 'Partagés avec moi' },
  ];

  const filtre = $derived((['miens', 'partages', 'tous'].includes(page.url.searchParams.get('filtre') ?? '') ? page.url.searchParams.get('filtre') : 'tous') as VueFilms);
  const q = $derived(page.url.searchParams.get('q') ?? '');
  let tri: TriFilms = $state('recents');
  let recherche = $state(page.url.searchParams.get('q') ?? '');
  let films: Film[] | null = $state(null);
  let erreur: string | null = $state(null);
  let survol = $state(false);
  let selecteur: HTMLInputElement | undefined = $state();
  // `/galerie?ajouter=1` (bouton « Ajouter un film » de la barre du haut) : ouvre le choix de fichiers. La navigation
  // monopage garde l'activation du clic d'origine ; si le navigateur refuse, le bouton de la page reste là.
  // Si les torrents sont permis, on propose d'abord le choix « Depuis mon ordinateur » / « Par torrent ».
  let ajoutDemande = false;
  let choixOuvert = $state(false);
  let torrentOuvert = $state(false);
  let fichierTorrent: File | null = $state(null);
  $effect(() => {
    if (ajoutDemande || !selecteur || page.url.searchParams.get('ajouter') !== '1' || telechargements.peutAjouter === null) return;
    ajoutDemande = true;
    ouvrirAjout();
    naviguer({ ajouter: null });
  });

  function ouvrirAjout(): void {
    if (telechargements.peutAjouter) choixOuvert = true; else selecteur?.click();
  }
  function ouvrirTorrent(fichier: File | null = null): void {
    fichierTorrent = fichier;
    choixOuvert = false;
    torrentOuvert = true;
  }

  // Suivi des torrents : liste au chargement de la page, arrêt en la quittant.
  $effect(() => {
    void telechargements.charger();
    return () => telechargements.arreter();
  });
  // Un torrent terminé : toast, et la carte du film apparaît dans la grille (en analyse puis prête).
  $effect(() => telechargements.surTermine((t) => {
    toast.ok(`${t.nom ?? 'Le film'} est dans ta galerie.`);
    void charger();
  }));
  let compteurSurvol = 0;

  function naviguer(maj: Record<string, string | null>): void {
    const u = new URL(page.url);
    for (const [k, v] of Object.entries(maj)) {
      if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);
    }
    void goto(u, { replaceState: true, keepFocus: true, noScroll: true });
  }

  // Recherche différée pour ne pas appeler l'API à chaque touche.
  $effect(() => {
    const r = recherche;
    const t = setTimeout(() => { if (r !== q) naviguer({ q: r.trim() || null }); }, 250);
    return () => clearTimeout(t);
  });

  async function charger(): Promise<void> {
    try {
      films = await listerFilms(filtre, q, tri);
      erreur = null;
    } catch (e) {
      erreur = e instanceof ErreurApi ? e.message : 'Impossible de charger les films.';
    }
  }

  $effect(() => {
    void filtre; void q; void tri;
    void charger();
  });

  // Tant qu'un film est en cours d'analyse, la grille se rafraîchit toute seule.
  $effect(() => {
    if (!films?.some((f) => f.etat === 'analyse')) return;
    const i = setInterval(() => void charger(), 3000);
    return () => clearInterval(i);
  });

  // Un envoi terminé apparaît tout de suite dans la grille.
  $effect(() => televersements.surTermine(() => { void charger(); }));

  function ajouter(fichiers: Iterable<File>): void {
    const { refuses } = televersements.ajouter(fichiers);
    if (refuses.length) toast.erreur(`${refuses.length === 1 ? `« ${refuses[0]} » n’est pas une vidéo` : `${refuses.length} fichiers ne sont pas des vidéos`} : ${refuses.length === 1 ? 'il est' : 'ils sont'} ignoré${refuses.length === 1 ? '' : 's'}.`);
  }

  function entree(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    compteurSurvol++;
    survol = true;
  }
  function sortie(): void { compteurSurvol = Math.max(0, compteurSurvol - 1); if (!compteurSurvol) survol = false; }
  function depose(e: DragEvent): void {
    e.preventDefault();
    compteurSurvol = 0; survol = false;
    const tous = Array.from(e.dataTransfer?.files ?? []);
    // Un `.torrent` déposé part vers l'ajout par torrent au lieu d'être refusé comme vidéo.
    const torrents = tous.filter((f) => /\.torrent$/i.test(f.name));
    const autres = tous.filter((f) => !/\.torrent$/i.test(f.name));
    if (torrents.length) {
      if (telechargements.peutAjouter) ouvrirTorrent(torrents[0]!);
      else toast.erreur('Tu ne peux pas ajouter de film par torrent ici.');
    }
    if (autres.length) ajouter(autres);
  }
</script>

<svelte:head><title>Films · Canapé</title></svelte:head>
<svelte:window ondragenter={entree} ondragleave={sortie} ondragover={(e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); }} ondrop={depose} />

<main>
  <header class="entete">
    <h1>Films</h1>
    <Bouton icone="plus" onclick={ouvrirAjout} data-test="ajouter-film">Ajouter un film</Bouton>
    <input bind:this={selecteur} type="file" multiple accept="video/*,.mkv,.mp4,.m4v,.mov,.avi,.webm,.ts,.m2ts" hidden
      onchange={() => { if (selecteur?.files) ajouter(Array.from(selecteur.files)); if (selecteur) selecteur.value = ''; }} />
  </header>

  <div class="outils">
    <div class="onglets" role="tablist" aria-label="Quels films">
      {#each FILTRES as f (f.valeur)}
        <button role="tab" type="button" aria-selected={filtre === f.valeur} class:actif={filtre === f.valeur} onclick={() => naviguer({ filtre: f.valeur === 'tous' ? null : f.valeur })}>{f.libelle}</button>
      {/each}
    </div>
    <input class="recherche" type="search" placeholder="Chercher un film" aria-label="Chercher un film" bind:value={recherche} />
    <label class="tri">
      <span class="vh">Trier par</span>
      <select bind:value={tri} aria-label="Trier par">
        <option value="recents">Récents</option>
        <option value="titre">Titre</option>
        <option value="annee">Année</option>
      </select>
    </label>
  </div>

  <PanneauTeleversement />
  <PanneauTelechargements />

  {#if erreur}
    <p class="erreur" role="alert">{erreur}</p>
  {:else if films === null}
    <Chargement />
  {:else if films.length === 0}
    {#if q}
      <EtatVide titre="Rien ne correspond" texte={`Aucun film ne s’appelle « ${q} ».`} />
    {:else if filtre === 'partages'}
      <EtatVide titre="Rien n’est partagé avec toi" texte="Quand quelqu’un partagera un film avec toi, il apparaîtra ici." />
    {:else}
      <EtatVide titre="Rien à l’affiche pour l’instant" texte="Dépose un film ici, il sera prêt à regarder dès qu’il est arrivé.">
        {#snippet actions()}<Bouton icone="plus" onclick={ouvrirAjout}>Ajouter un film</Bouton>{/snippet}
      </EtatVide>
    {/if}
  {:else}
    <GrilleFilms {films} />
  {/if}
</main>

{#if telechargements.peutAjouter}
<Modale bind:ouverte={choixOuvert} titre="Ajouter un film">
  <div class="choix">
    <button type="button" class="option" data-test="ajouter-ordinateur" onclick={() => { choixOuvert = false; selecteur?.click(); }}>
      <Icone nom="televerser" /><span><strong>Depuis mon ordinateur</strong><span class="t-petit">Choisis ou dépose un fichier vidéo.</span></span>
    </button>
    <button type="button" class="option" data-test="ajouter-torrent" onclick={() => ouvrirTorrent()}>
      <Icone nom="lien" /><span><strong>Par torrent</strong><span class="t-petit">Un lien magnet ou un fichier .torrent.</span></span>
    </button>
  </div>
</Modale>
<ModaleAjoutTorrent bind:ouverte={torrentOuvert} fichierInitial={fichierTorrent} />
{/if}

{#if survol}
  <div class="voile" aria-hidden="true"><p>Dépose pour envoyer</p></div>
{/if}

<style>
  main { padding: 0 0 64px; display: grid; gap: var(--e-5); }
  .entete { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h1 { font-family: var(--titre); font-size: clamp(2.25rem, 5vw, 3rem); line-height: 1.02; margin: 0; font-weight: 400; letter-spacing: -0.01em; }
  .outils { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .onglets { display: flex; gap: 2px; background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-m); padding: 4px; overflow-x: auto; max-width: 100%; scrollbar-width: none; }
  .onglets button { background: none; border: 0; border-radius: 9px; padding: 0 16px; height: 40px; color: var(--doux); white-space: nowrap; font-weight: 600; font-size: 14.5px; }
  .onglets button:hover:not(.actif) { color: var(--texte); }
  .onglets button.actif { background: var(--s3); color: var(--texte); box-shadow: inset 0 1px 0 var(--reflet), 0 1px 3px rgba(0, 0, 0, 0.4); }
  .recherche, select { background: var(--s2); border: 1px solid var(--bord-champ); border-radius: var(--r-m); padding: 0 14px; color: var(--texte); height: 48px; font-size: 16px; }
  .recherche { flex: 1; min-width: 180px; }
  .recherche::placeholder { color: var(--discret); }
  .recherche:focus, select:focus { outline: 3px solid var(--lampe-vive); outline-offset: 2px; border-color: var(--lampe); }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .erreur { color: var(--mal, #ff7b6e); }
  .choix { display: grid; gap: var(--e-3); }
  .option { display: flex; align-items: center; gap: var(--e-4); width: 100%; min-height: 64px; padding: var(--e-3) var(--e-4); text-align: left; color: var(--texte); background: var(--s1); border: 1px solid var(--bord-champ); border-radius: var(--r-m); cursor: pointer; }
  .option:hover { border-color: var(--lampe); background: var(--lampe-fond); }
  .option > :global(svg) { color: var(--lampe); flex: none; }
  .option span { display: grid; gap: 2px; }
  .option .t-petit { color: var(--doux); }
  .voile { position: fixed; inset: 0; z-index: 50; background: rgba(6, 5, 10, 0.7); display: grid; place-items: center; pointer-events: none; }
  .voile p { margin: 0; padding: 48px 72px; border: 2px dashed var(--lampe, #ffb347); background: var(--lampe-fond, rgba(255, 179, 71, 0.14)); border-radius: var(--r-xl); font-family: var(--titre); font-size: 1.9rem; }
</style>
