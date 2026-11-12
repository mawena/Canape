<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { CorpsCreerSeance, Film, ReponseLienSeance, Seance, UtilisateurPublic } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { Avatar, Bouton, Carte, Champ, Chargement, toast } from '$lib/ui/index.ts';
  import { ceSoir21h, messageInvitation, versIso } from '$lib/seance/dates.ts';
  import { lireMoi, urlConnexion } from '$lib/seance/moi.ts';

  let films: Film[] = $state([]);
  let comptes: UtilisateurPublic[] = $state([]);
  let chargement = $state(true);
  let erreur: string | null = $state(null);
  let filmId: string | null = $state(page.url.searchParams.get('film'));
  let recherche = $state('');
  let titre = $state('');
  let maintenant = $state(true);
  let quand = $state(ceSoir21h());
  let invites: number[] = $state([]);
  let envoi = $state(false);
  let creee: Seance | null = $state(null);
  let lien: string | null = $state(null);

  onMount(async () => {
    try {
      const moi = await lireMoi();
      if (!moi) { await goto(urlConnexion(`/seances/nouvelle${page.url.search}`)); return; }
      const [f, u] = await Promise.all([
        api.get<Film[]>('/api/films?vue=tous'),
        api.get<UtilisateurPublic[]>('/api/utilisateurs'),
      ]);
      films = f.filter((x) => x.etat === 'pret');
      comptes = u.filter((x) => x.id !== moi.id);
    } catch (e) {
      erreur = e instanceof Error ? e.message : 'Erreur inconnue.';
    } finally {
      chargement = false;
    }
  });

  const filtres = $derived(films.filter((f) => f.titre.toLowerCase().includes(recherche.trim().toLowerCase())));
  const film = $derived(films.find((f) => f.id === filmId) ?? null);

  function basculerInvite(id: number): void {
    invites = invites.includes(id) ? invites.filter((x) => x !== id) : [...invites, id];
  }

  async function creer(e: Event): Promise<void> {
    e.preventDefault();
    if (!filmId) { erreur = 'Choisis un film.'; return; }
    envoi = true;
    erreur = null;
    try {
      const corps: CorpsCreerSeance = { filmId, invites };
      if (titre.trim()) corps.titre = titre.trim();
      if (!maintenant) corps.prevueLe = versIso(quand);
      creee = await api.post<Seance>('/api/seances', corps);
      const l = await api.post<ReponseLienSeance>(`/api/seances/${creee.id}/lien`);
      lien = l.lien;
    } catch (err) {
      erreur = err instanceof ErreurApi ? err.message : 'Impossible de créer la séance.';
    } finally {
      envoi = false;
    }
  }

  async function copier(texte: string, ok: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texte);
      toast.ok(ok);
    } catch {
      toast.erreur('Copie impossible : sélectionne le texte à la main.');
    }
  }
  async function partager(): Promise<void> {
    if (!lien || !film) return;
    const texte = messageInvitation(film.titre, creee?.prevueLe ?? null, lien);
    if (navigator.share) {
      try { await navigator.share({ text: texte }); } catch { /* annulé */ }
    } else {
      await copier(texte, 'Message copié.');
    }
  }
</script>

<svelte:head><title>Nouvelle séance — Canapé</title></svelte:head>

<main data-test="page-nouvelle-seance">
  {#if creee && lien}
    <Carte doree>
      <div class="succes" data-test="seance-creee">
        <h1>C’est prêt.</h1>
        <p>Envoie ce lien à qui tu veux inviter.</p>
        <div class="lien">
          <input readonly value={lien} aria-label="Lien d’invitation" data-test="lien-invitation" onfocus={(e) => e.currentTarget.select()} />
          <Bouton variante="secondaire" icone="lien" onclick={() => copier(lien!, 'Lien copié.')} data-test="copier-lien">Copier le lien</Bouton>
        </div>
        <div class="actions">
          <Bouton variante="secondaire" onclick={partager}>Partager le message</Bouton>
          <Bouton href="/seances/{creee.id}" data-test="entrer-salle-creee">Entrer dans la salle</Bouton>
        </div>
      </div>
    </Carte>
  {:else if chargement}
    <Chargement />
  {:else}
    <h1>Nouvelle séance</h1>
    <form onsubmit={creer}>
      <section>
        <h2>1. Le film</h2>
        <Champ libelle="Chercher un film" bind:value={recherche} type="search" />
        {#if !films.length}
          <p class="vide">Aucun film prêt pour l’instant.</p>
        {:else}
          <ul class="films" role="radiogroup" aria-label="Film">
            {#each filtres as f (f.id)}
              <li>
                <label class="film" class:choisi={filmId === f.id}>
                  <input type="radio" name="film" value={f.id} bind:group={filmId} data-test="film-{f.id}" />
                  <span>{f.titre}{f.annee ? ` (${f.annee})` : ''}</span>
                </label>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section>
        <h2>2. Quand</h2>
        <label class="case"><input type="radio" checked={maintenant} onchange={() => (maintenant = true)} /> Maintenant</label>
        <label class="case"><input type="radio" checked={!maintenant} onchange={() => (maintenant = false)} /> Plus tard</label>
        {#if !maintenant}<Champ libelle="Date et heure" type="datetime-local" bind:value={quand} />{/if}
        <Champ libelle="Titre ou note (facultatif)" bind:value={titre} placeholder="Apporte du pop-corn" maxlength={120} />
      </section>

      <section>
        <h2>3. Qui</h2>
        {#if comptes.length}
          <ul class="comptes">
            {#each comptes as c (c.id)}
              <li>
                <label class="case">
                  <input type="checkbox" checked={invites.includes(c.id)} onchange={() => basculerInvite(c.id)} />
                  <Avatar prenom={c.prenom} couleur={c.couleur} taille={28} /> {c.prenom}
                </label>
              </li>
            {/each}
          </ul>
        {/if}
        <p class="vide">Tu peux aussi inviter quelqu’un par lien : il apparaît après la création.</p>
      </section>

      {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
      <div class="actions">
        <Bouton variante="discret" href="/seances">Annuler</Bouton>
        <Bouton type="submit" chargement={envoi} disabled={!filmId} data-test="creer-seance">Créer la séance</Bouton>
      </div>
    </form>
  {/if}
</main>

<style>
  main { max-width: 640px; margin: 0 auto; padding: 24px 16px; display: grid; gap: 16px; }
  h1 { font: 400 2.2rem 'Instrument Serif', var(--titre, Georgia, serif); margin: 0; }
  h2 { font: 400 1.3rem 'Instrument Serif', var(--titre, Georgia, serif); margin: 0; }
  form, section { display: grid; gap: 12px; }
  .films, .comptes { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 280px; overflow-y: auto; }
  .film { display: block; padding: 10px 14px; border-radius: 12px; background: var(--s2, #262031); cursor: pointer; border: 1px solid transparent; }
  .film.choisi { border-color: var(--lampe, #f4a85b); background: var(--lampe-fond, rgba(244, 168, 91, 0.14)); }
  .film input { position: absolute; opacity: 0; }
  .film:focus-within { outline: 2px solid var(--lampe-vive, #ffbf7d); }
  .case { display: flex; gap: 10px; align-items: center; }
  .vide { color: var(--doux, #b9afc4); margin: 0; }
  .erreur { color: var(--mal, #ff7f70); margin: 0; }
  .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .succes { display: grid; gap: 12px; }
  .lien { display: flex; gap: 8px; flex-wrap: wrap; }
  .lien input { flex: 1; min-width: 200px; background: var(--s2, #262031); border: 1px solid var(--bord-champ, #857a95); border-radius: 10px; padding: 9px 12px; color: inherit; }
</style>
