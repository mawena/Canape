<script lang="ts">
  /**
   * Lancement rapide d'une séance (phase 18) : on touche un film, puis « Lancer » : la séance est créée tout de suite (sans date,
   * donc maintenant) par `POST /api/seances`, et le lien d'invitation est là, prêt à copier. Les réglages fins (date, invités)
   * restent sur la page « Nouvelle séance », proposée en « Plus d'options ».
   * - `films` : films prêts, dans l'ordre à montrer. `titre` : intitulé de la section.
   */
  import type { Film, ReponseLienSeance, Seance } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { Bouton, MiniAffiche, toast } from '$lib/ui/index.ts';
  import { liens } from '$lib/interface/liens.ts';
  import { messageInvitation } from '$lib/seance/dates.ts';

  interface Props { films: Film[]; titre?: string }
  let { films, titre = 'Lancer une séance' }: Props = $props();

  let choisi = $state<string | null>(null);
  let envoi = $state(false);
  let erreur = $state<string | null>(null);
  let creee = $state<{ seance: Seance; lien: string; filmTitre: string } | null>(null);

  const film = $derived(films.find((f) => f.id === choisi) ?? null);
  const proposes = $derived(films.slice(0, 12));

  async function lancer(): Promise<void> {
    if (!film) return;
    envoi = true;
    erreur = null;
    try {
      const seance = await api.post<Seance>('/api/seances', { filmId: film.id, invites: [] });
      const l = await api.post<ReponseLienSeance>(`/api/seances/${seance.id}/lien`);
      const lien = l.lien.startsWith('http') ? l.lien : `${location.origin}${l.lien}`;
      creee = { seance, lien, filmTitre: film.titre };
    } catch (e) {
      erreur = e instanceof ErreurApi ? e.message : 'Impossible de créer la séance. Réessaie.';
    } finally {
      envoi = false;
    }
  }

  async function copier(texte: string, ok: string): Promise<void> {
    try { await navigator.clipboard.writeText(texte); toast.ok(ok); }
    catch { toast.erreur('Copie impossible : sélectionne le texte à la main.'); }
  }
  async function partager(): Promise<void> {
    if (!creee) return;
    const texte = messageInvitation(creee.filmTitre, null, creee.lien);
    if (navigator.share) { try { await navigator.share({ text: texte }); } catch { /* annulé */ } }
    else await copier(texte, 'Message copié.');
  }
  function recommencer(): void { creee = null; choisi = null; }
</script>

<section class="lancer" aria-labelledby="titre-lancer" data-test="lancement-rapide">
  {#if creee}
    <div class="pret" data-test="lancement-cree" role="status">
      <h2 id="titre-lancer" class="t-titre2">C’est prêt.</h2>
      <p>La séance de {creee.filmTitre} est créée. Envoie ce lien à qui tu veux inviter.</p>
      <div class="lien">
        <input readonly value={creee.lien} aria-label="Lien d’invitation" data-test="lancement-lien" onfocus={(e) => e.currentTarget.select()} />
        <Bouton variante="secondaire" icone="lien" onclick={() => copier(creee!.lien, 'Lien copié.')} data-test="lancement-copier">Copier le lien</Bouton>
      </div>
      <div class="actions">
        <Bouton taille="l" icone="lecture" href={liens.seance(creee.seance.id)} data-test="lancement-entrer">Entrer dans la salle</Bouton>
        <Bouton variante="secondaire" onclick={partager}>Partager le message</Bouton>
        <button type="button" class="lien-bouton" onclick={recommencer}>Lancer une autre séance</button>
      </div>
    </div>
  {:else}
    <div class="tete">
      <h2 id="titre-lancer" class="t-titre2">{titre}</h2>
      <p class="aide">Touche un film : la séance est créée tout de suite et tu reçois le lien.</p>
    </div>
    {#if proposes.length === 0}
      <p class="aide">Aucun film prêt pour l’instant. <a href={liens.ajouterFilm}>Ajouter un film</a></p>
    {:else}
      <div class="films" role="group" aria-label="Choisis un film">
        {#each proposes as f (f.id)}
          <button type="button" class="film" class:choisi={choisi === f.id} aria-pressed={choisi === f.id} onclick={() => (choisi = choisi === f.id ? null : f.id)} data-test="lancement-film">
            <MiniAffiche film={f} largeur={96} />
            <span class="nom">{f.titre}</span>
          </button>
        {/each}
      </div>
      <div class="barre" class:vide={!film}>
        <Bouton taille="l" icone="lecture" disabled={!film || envoi} onclick={lancer} data-test="lancement-lancer">
          {film ? `Lancer ${film.titre}` : 'Choisis un film'}
        </Bouton>
        <a class="options" href={liens.nouvelleSeance(film?.id)} data-test="lancement-options">Plus d’options : date, invités</a>
      </div>
      {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
    {/if}
  {/if}
</section>

<style>
  .lancer { display: grid; gap: var(--e-4); padding: var(--e-6); border-radius: var(--r-xl); background: var(--s1); border: 1px solid var(--bord); box-shadow: var(--ombre-2); }
  .tete { display: grid; gap: 4px; }
  .aide { color: var(--doux); font-size: 15px; }
  .aide a { color: var(--lampe); font-weight: 600; }
  .films { display: flex; gap: 14px; overflow-x: auto; padding: 6px 4px 10px; margin: 0 -4px; scroll-snap-type: x proximity; scrollbar-width: thin; }
  .film {
    flex: none; width: 112px; display: grid; justify-items: center; align-content: start; gap: 8px; padding: 6px 6px 8px; min-height: 44px;
    background: none; border: 2px solid transparent; border-radius: var(--r-m); color: var(--texte); font: inherit; cursor: pointer; scroll-snap-align: start;
  }
  .film :global(.mini) { box-shadow: var(--ombre-2); }
  .film.choisi { border-color: var(--lampe); background: color-mix(in srgb, var(--lampe) 10%, transparent); }
  .film:focus-visible { outline: 3px solid var(--lampe); outline-offset: 2px; }
  @media (hover: hover) { .film:hover:not(.choisi) { background: var(--s2); } }
  .nom { font-size: 13px; line-height: 1.25; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .barre { display: flex; align-items: center; gap: var(--e-4); flex-wrap: wrap; }
  .barre :global(.bouton) { max-width: 100%; }
  .options { color: var(--lampe); font-weight: 600; font-size: 15px; text-underline-offset: 4px; min-height: 44px; display: inline-flex; align-items: center; }
  .erreur { color: var(--alerte); font-size: 14px; }
  .pret { display: grid; gap: var(--e-3); }
  .lien { display: flex; gap: var(--e-3); flex-wrap: wrap; }
  .lien input { flex: 1 1 260px; min-width: 0; min-height: 48px; padding: 0 14px; border-radius: var(--r-m); border: 1px solid var(--bord); background: var(--s2); color: var(--texte); font: inherit; font-size: 15px; }
  .actions { display: flex; gap: var(--e-3); flex-wrap: wrap; align-items: center; }
  .lien-bouton { background: none; border: 0; padding: 0 6px; min-height: 44px; color: var(--lampe); font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  @media (max-width: 640px) {
    .lancer { padding: var(--e-4); }
    .barre { flex-direction: column; align-items: stretch; gap: var(--e-2); }
    .options { justify-content: center; }
    .actions :global(.bouton) { flex: 1 1 100%; }
  }
</style>
