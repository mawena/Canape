<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { Film, VueFilms } from '@canape/partage';
  import { ErreurApi } from '$lib/api/client.ts';
  import { listerFilms, type TriFilms } from '$lib/mediatheque/api.ts';
  import GrilleFilms from '$lib/mediatheque/GrilleFilms.svelte';
  import PanneauTeleversement from '$lib/mediatheque/PanneauTeleversement.svelte';
  import { televersements } from '$lib/mediatheque/televersements.svelte.ts';
  import { Bouton, Chargement, EtatVide, toast } from '$lib/ui/index.ts';

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
  let ajoutDemande = false;
  $effect(() => {
    if (ajoutDemande || !selecteur || page.url.searchParams.get('ajouter') !== '1') return;
    ajoutDemande = true;
    selecteur.click();
    naviguer({ ajouter: null });
  });
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
    if (e.dataTransfer?.files.length) ajouter(Array.from(e.dataTransfer.files));
  }
</script>

<svelte:head><title>Films · Canapé</title></svelte:head>
<svelte:window ondragenter={entree} ondragleave={sortie} ondragover={(e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); }} ondrop={depose} />

<main>
  <header class="entete">
    <h1>Films</h1>
    <Bouton icone="plus" onclick={() => selecteur?.click()}>Ajouter un film</Bouton>
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
        {#snippet actions()}<Bouton icone="plus" onclick={() => selecteur?.click()}>Ajouter un film</Bouton>{/snippet}
      </EtatVide>
    {/if}
  {:else}
    <GrilleFilms {films} />
  {/if}
</main>

{#if survol}
  <div class="voile" aria-hidden="true"><p>Dépose pour envoyer</p></div>
{/if}

<style>
  main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 64px; display: grid; gap: 20px; }
  .entete { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h1 { font-family: var(--titre, 'Instrument Serif', Georgia, serif); font-size: 2.4rem; margin: 0; font-weight: 400; }
  .outils { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .onglets { display: flex; gap: 4px; background: var(--s1, #1c1824); border: 1px solid var(--bord, #3d3549); border-radius: 999px; padding: 3px; overflow-x: auto; max-width: 100%; }
  .onglets button { background: none; border: 0; border-radius: 999px; padding: 7px 16px; height: 36px; color: var(--doux, #b9afc4); white-space: nowrap; }
  .onglets button.actif { background: var(--s3, #312a3d); color: var(--texte, #f4eee7); }
  .recherche, select { background: var(--s2, #262031); border: 1px solid var(--bord-champ, #857a95); border-radius: 12px; padding: 9px 12px; color: var(--texte, #f4eee7); height: 42px; }
  .recherche { flex: 1; min-width: 180px; }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .erreur { color: var(--mal, #ff7f70); }
  .voile { position: fixed; inset: 0; z-index: 50; background: rgba(8, 6, 12, 0.7); display: grid; place-items: center; pointer-events: none; }
  .voile p { margin: 0; padding: 48px 72px; border: 2px dashed var(--lampe, #f4a85b); background: var(--lampe-fond, rgba(244, 168, 91, 0.14)); border-radius: 22px; font-family: var(--titre, 'Instrument Serif', Georgia, serif); font-size: 1.9rem; }
</style>
