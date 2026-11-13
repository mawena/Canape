<script lang="ts">
  /**
   * « Programme de la soirée » (séance de plusieurs films) : bouton de la barre de commandes + panneau non modal, comme
   * « Inviter » (rien n'est mis en pause, il reste visible en plein écran, feuille du bas sur téléphone).
   * Tout le monde voit le programme ; l'hôte seul peut réordonner, retirer ou ajouter les films à venir, et passer au suivant.
   * `data-test` : `bouton-programme`, `programme`, `programme-film` (attributs `data-etat` : vu|en-cours|a-venir, `data-film`),
   * `programme-monter`, `programme-descendre`, `programme-retirer`, `ajouter-film-programme`, `programme-recherche`,
   * `programme-choix`, `film-suivant`, `confirmer-film-suivant`.
   */
  import ListVideo from '@lucide/svelte/icons/list-video';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Plus from '@lucide/svelte/icons/plus';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import X from '@lucide/svelte/icons/x';
  import { tick } from 'svelte';
  import { MAX_FILMS_PROGRAMME, programmeTrie, type Film } from '@canape/partage';
  import { api } from '$lib/api/client.ts';
  import { MiniAffiche } from '$lib/ui/index.ts';
  import { ajouterFilm, deplacerFilm, etatFilm, filmsAjoutables, idsAVenir, libelleRang, retirerFilm } from './programme.ts';
  import type { Salle } from './salle.svelte.ts';

  let { salle, ouvert = $bindable(false) }: { salle: Salle; ouvert?: boolean } = $props();

  let declencheur: HTMLButtonElement | undefined = $state();
  let panneau: HTMLDivElement | undefined = $state();
  let etaitOuvert = false;
  let choix = $state(false);
  let films: Film[] | null = $state(null);
  let erreurFilms: string | null = $state(null);
  let recherche = $state('');
  let confirmer = $state(false);
  let statut = $state('');
  /** Le bouton est à gauche de l'écran (barre repliée sur deux lignes) : le panneau s'ouvre vers la droite. */
  let versDroite = $state(false);

  const programme = $derived(programmeTrie(salle.programme));
  const rang = $derived(salle.rangCourant);
  const aVenir = $derived(idsAVenir(salle.programme, rang));
  const hote = $derived(salle.estHote);
  const rangTexte = $derived(libelleRang(salle.programme, rang));
  const plein = $derived(aVenir.length + 1 >= MAX_FILMS_PROGRAMME);
  const proposes = $derived.by(() => {
    const q = recherche.trim().toLowerCase();
    return filmsAjoutables(films ?? [], salle.programme, rang).filter((f) => !q || f.titre.toLowerCase().includes(q));
  });

  $effect(() => {
    if (ouvert && !etaitOuvert) {
      etaitOuvert = true;
      versDroite = (declencheur?.getBoundingClientRect().right ?? Infinity) < 420;
      void tick().then(() => panneau?.focus());
    } else if (!ouvert && etaitOuvert) {
      etaitOuvert = false;
      choix = false;
      confirmer = false;
      recherche = '';
      declencheur?.focus();
    }
  });

  function fermer(): void { ouvert = false; }
  function clavier(e: KeyboardEvent): void {
    // Dans le panneau, les raccourcis de la salle (espace, flèches…) ne s'appliquent pas.
    e.stopPropagation();
    if (e.key === 'Escape') {
      if (choix) { choix = false; return; }
      fermer();
    }
  }

  async function deplacer(filmId: string, titre: string, sens: -1 | 1): Promise<void> {
    const ids = deplacerFilm(aVenir, filmId, sens);
    if (ids.join() === aVenir.join()) return;
    if (await salle.modifierProgramme(ids)) {
      statut = `${titre} ${sens < 0 ? 'monte' : 'descend'} d’une place.`;
      await tick();
      // Le focus suit le film déplacé (l'autre sens s'il est arrivé au bout).
      const ligne = panneau?.querySelector(`[data-film="${CSS.escape(filmId)}"]`);
      const meme = ligne?.querySelector<HTMLButtonElement>(`[data-test="programme-${sens < 0 ? 'monter' : 'descendre'}"]`);
      const autre = ligne?.querySelector<HTMLButtonElement>(`[data-test="programme-${sens < 0 ? 'descendre' : 'monter'}"]`);
      (meme && !meme.disabled ? meme : autre)?.focus();
    }
  }

  async function retirer(filmId: string, titre: string): Promise<void> {
    if (await salle.modifierProgramme(retirerFilm(aVenir, filmId))) {
      statut = `${titre} est retiré du programme.`;
      await tick();
      panneau?.focus();
    }
  }

  async function ouvrirChoix(): Promise<void> {
    choix = true;
    confirmer = false;
    if (films === null) {
      erreurFilms = null;
      try {
        films = (await api.get<Film[]>('/api/films?vue=tous')).filter((f) => f.etat === 'pret');
      } catch {
        erreurFilms = 'Impossible de charger les films. Vérifie ta connexion et réessaie.';
      }
    }
    await tick();
    panneau?.querySelector<HTMLInputElement>('[data-test="programme-recherche"]')?.focus();
  }

  async function ajouter(f: Film): Promise<void> {
    if (await salle.modifierProgramme(ajouterFilm(aVenir, f.id))) {
      statut = `${f.titre} est ajouté à la fin du programme.`;
      choix = false;
      recherche = '';
      await tick();
      panneau?.querySelector<HTMLButtonElement>('[data-test="ajouter-film-programme"]')?.focus();
    }
  }

  function passer(): void {
    salle.lancerFilmSuivant();
    confirmer = false;
    fermer();
  }
</script>

<div class="programme-ancre">
  <button bind:this={declencheur} type="button" class="rond" class:actif={ouvert} onclick={() => (ouvert = !ouvert)} aria-expanded={ouvert}
    aria-haspopup="dialog" aria-label="Programme de la soirée" title="Programme de la soirée" data-test="bouton-programme">
    <ListVideo size={22} aria-hidden="true" />
  </button>

  {#if ouvert}
    <button type="button" class="voile" tabindex="-1" aria-hidden="true" onclick={fermer}></button>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div bind:this={panneau} class="panneau" class:vers-droite={versDroite} role="dialog" aria-labelledby="titre-programme" tabindex="-1" onkeydown={clavier} data-test="programme">
      <span class="poignee" aria-hidden="true"></span>
      <header>
        <div>
          <h2 id="titre-programme">Programme de la soirée</h2>
          {#if rangTexte}<p class="rang">{rangTexte}</p>{/if}
        </div>
        <button type="button" class="x" onclick={fermer} aria-label="Fermer"><X size={18} aria-hidden="true" /></button>
      </header>

      <ol class="films" aria-label="Films de la soirée, dans l’ordre">
        {#each programme as f, i (f.rang)}
          {@const etat = etatFilm(f, rang)}
          {@const j = aVenir.indexOf(f.filmId)}
          <li class="film {etat}" data-test="programme-film" data-etat={etat} data-film={f.filmId}>
            <span class="num tn" aria-hidden="true">{i + 1}</span>
            <MiniAffiche titre={f.titre} imageSrc={f.aAffiche ? `/api/films/${encodeURIComponent(f.filmId)}/affiche?v=${f.versionImages}` : null} largeur={36} />
            <span class="quoi">
              <span class="titre">{f.titre}</span>
              <span class="detail">{etat === 'en-cours' ? (salle.enEntracte ? 'Vient de finir' : 'En cours') : etat === 'vu' ? 'Vu ce soir' : (f.annee ?? 'À venir')}</span>
            </span>
            {#if hote && etat === 'a-venir' && j >= 0}
              <span class="gestes">
                <button type="button" class="petit" onclick={() => deplacer(f.filmId, f.titre, -1)} disabled={j === 0 || salle.programmeOccupe}
                  aria-label="Monter {f.titre}" title="Monter" data-test="programme-monter"><ChevronUp size={18} aria-hidden="true" /></button>
                <button type="button" class="petit" onclick={() => deplacer(f.filmId, f.titre, 1)} disabled={j === aVenir.length - 1 || salle.programmeOccupe}
                  aria-label="Descendre {f.titre}" title="Descendre" data-test="programme-descendre"><ChevronDown size={18} aria-hidden="true" /></button>
                <button type="button" class="petit" onclick={() => retirer(f.filmId, f.titre)} disabled={salle.programmeOccupe}
                  aria-label="Retirer {f.titre} du programme" title="Retirer" data-test="programme-retirer"><X size={18} aria-hidden="true" /></button>
              </span>
            {/if}
          </li>
        {/each}
      </ol>

      <p class="lu" role="status">{statut}</p>

      {#if hote}
        {#if choix}
          <div class="choix">
            <input class="recherche" type="search" bind:value={recherche} placeholder="Chercher un film" aria-label="Chercher un film à ajouter" data-test="programme-recherche" />
            {#if erreurFilms}
              <p class="erreur" role="alert">{erreurFilms}</p>
            {:else if films === null}
              <p class="aide">Un instant…</p>
            {:else if !proposes.length}
              <p class="aide">{recherche.trim() ? 'Aucun film ne correspond.' : 'Tous tes films prêts sont déjà au programme.'}</p>
            {:else}
              <ul class="proposes" aria-label="Films à ajouter">
                {#each proposes as f (f.id)}
                  <li>
                    <button type="button" class="propose" onclick={() => ajouter(f)} disabled={salle.programmeOccupe} data-test="programme-choix">
                      <MiniAffiche film={f} largeur={28} /><span class="titre">{f.titre}</span>{#if f.annee}<span class="detail">{f.annee}</span>{/if}
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            <button type="button" class="action" onclick={() => (choix = false)}>Fermer la liste</button>
          </div>
        {:else}
          <div class="actions">
            <button type="button" class="action" onclick={ouvrirChoix} disabled={plein} data-test="ajouter-film-programme"><Plus size={18} aria-hidden="true" /> Ajouter un film</button>
            {#if salle.suivant}
              {#if confirmer && !salle.enEntracte}
                <button type="button" class="action primaire" onclick={passer} data-test="confirmer-film-suivant"><SkipForward size={18} aria-hidden="true" /> Lancer {salle.suivant.titre}</button>
                <button type="button" class="action" onclick={() => (confirmer = false)}>Annuler</button>
              {:else}
                <button type="button" class="action" onclick={() => (salle.enEntracte ? passer() : (confirmer = true))} disabled={salle.liaison !== 'ouvert'} data-test="film-suivant">
                  <SkipForward size={18} aria-hidden="true" /> Passer au film suivant
                </button>
              {/if}
            {/if}
          </div>
          {#if confirmer && !salle.enEntracte}<p class="aide">Le film en cours s’arrête pour tout le monde.</p>{/if}
          {#if plein}<p class="aide">Une soirée compte {MAX_FILMS_PROGRAMME} films au plus.</p>{/if}
        {/if}
      {:else}
        <p class="aide">C’est {salle.seance?.hotePrenom ?? 'l’hôte'} qui choisit les films de la soirée.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .programme-ancre { position: relative; display: inline-block; }
  button { color: inherit; font: inherit; }
  .rond { position: relative; z-index: 32; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 50%; background: transparent; transition: background 120ms; }
  .rond:hover { background: rgba(255, 255, 255, 0.12); }
  .rond.actif { background: var(--lampe-fond); color: var(--lampe, #1f5ce0); }

  .voile { position: fixed; inset: 0; z-index: 30; border: 0; padding: 0; background: transparent; cursor: default; }
  .panneau {
    position: absolute; z-index: 31; bottom: calc(100% + 8px); right: 0; width: min(400px, calc(100vw - 24px)); max-height: min(70vh, 620px);
    overflow-y: auto; display: grid; gap: 12px; padding: 16px 18px 18px; border-radius: 20px; background: var(--s2); color: var(--texte);
    border: 1px solid var(--bord-vif); box-shadow: var(--ombre-3); text-align: left; animation: entree 160ms var(--ease, ease-out);
  }
  .panneau.vers-droite { right: auto; left: 0; }
  .panneau:focus-visible { outline: 2px solid var(--lampe, #60a5fa); outline-offset: 2px; }
  .poignee { display: none; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  h2 { margin: 0; font: 700 1.125rem / 1.25 var(--texte-police); letter-spacing: -0.01em; }
  .rang { margin: 2px 0 0; font-size: 0.875rem; color: var(--doux); }
  .x { display: grid; place-items: center; width: 44px; height: 44px; margin: -8px -10px -8px 0; border: 0; border-radius: 50%; background: none; color: var(--doux); flex: none; }
  .x:hover { background: var(--s3); color: var(--texte); }

  .films { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .film { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 6px 8px; border-radius: 14px; border: 1px solid transparent; }
  .film.en-cours { background: var(--lampe-fond); border-color: color-mix(in srgb, var(--lampe) 45%, transparent); }
  .film.vu { opacity: 0.62; }
  .num { flex: none; width: 22px; text-align: center; font-weight: 700; font-size: 0.875rem; color: var(--discret); }
  .en-cours .num { color: var(--lampe); }
  .quoi { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .titre { font: 400 1.125rem / 1.15 var(--titre); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { font-size: 0.8125rem; color: var(--doux); }
  .en-cours .detail { color: var(--lampe); font-weight: 600; }
  .gestes { display: flex; gap: 2px; flex: none; }
  .petit { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 10px; background: transparent; color: var(--doux); }
  .petit:hover:not(:disabled) { background: var(--s3); color: var(--texte); }
  .petit:disabled { opacity: 0.3; cursor: not-allowed; }

  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: var(--r-m, 12px); border: 1px solid var(--bord-vif); background: var(--s3); font-weight: 600; flex: 1 1 auto; }
  .action.primaire { background: var(--lampe); border-color: transparent; color: var(--lampe-sur, #fff); }
  .action:disabled { opacity: 0.5; cursor: not-allowed; }
  .aide { margin: 0; font-size: 0.875rem; line-height: 1.45; color: var(--doux); }
  .erreur { margin: 0; color: var(--mal); font-size: 0.9rem; }
  .choix { display: grid; gap: 8px; }
  .recherche { width: 100%; box-sizing: border-box; min-height: 44px; padding: 0 12px; border-radius: var(--r-m, 12px); border: 1px solid var(--bord-champ); background: var(--s1); color: var(--texte); font: inherit; }
  .proposes { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 220px; overflow-y: auto; }
  .propose { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 4px 8px; border: 0; border-radius: 12px; background: transparent; text-align: left; }
  .propose:hover:not(:disabled) { background: var(--s3); }
  .propose .titre { flex: 1; font-size: 1.0625rem; }
  .lu { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
  :is(.rond, .x, .action, .petit, .propose, .recherche):focus-visible { outline: 2px solid var(--lampe, #60a5fa); outline-offset: 2px; }
  @keyframes entree { from { opacity: 0; transform: translateY(6px); } }

  @media (max-width: 640px) {
    /* La feuille du bas passe devant toute la barre (le voile sombre la ferme d'une touche). */
    .rond { z-index: auto; width: 48px; height: 48px; }
    .voile { background: rgba(6, 5, 10, 0.55); }
    .panneau, .panneau.vers-droite { position: fixed; left: 0; right: 0; bottom: 0; width: auto; max-height: 82dvh; border-radius: 22px 22px 0 0; border-bottom: 0; padding-bottom: calc(20px + env(safe-area-inset-bottom)); animation: monte 200ms var(--ease, ease-out); }
    .poignee { display: block; width: 36px; height: 4px; border-radius: 2px; background: var(--bord-champ); margin: -6px auto 0; }
    .action { flex-basis: 100%; }
  }
  @keyframes monte { from { transform: translateY(100%); } }
  @media (prefers-reduced-motion: reduce) { .panneau { animation: none; } }
</style>
