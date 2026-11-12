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
        <h2><span class="num" aria-hidden="true">1</span>Le film</h2>
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
        <h2><span class="num" aria-hidden="true">2</span>Quand</h2>
        <label class="case"><input type="radio" checked={maintenant} onchange={() => (maintenant = true)} /> Maintenant</label>
        <label class="case"><input type="radio" checked={!maintenant} onchange={() => (maintenant = false)} /> Plus tard</label>
        {#if !maintenant}<Champ libelle="Date et heure" type="datetime-local" bind:value={quand} />{/if}
        <Champ libelle="Titre ou note (facultatif)" bind:value={titre} placeholder="Apporte du pop-corn" maxlength={120} />
      </section>

      <section>
        <h2><span class="num" aria-hidden="true">3</span>Qui vient</h2>
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
  main { max-width: 680px; margin: 0 auto; display: grid; gap: var(--e-5); }
  h1 { font: 400 clamp(2.25rem, 5vw, 3rem) / 1.02 var(--titre); letter-spacing: -0.01em; margin: 0; }
  h2 { font: 700 1.125rem / 1.3 var(--texte-police); letter-spacing: -0.01em; margin: 0; display: flex; align-items: center; gap: var(--e-3); }
  .num { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--lampe-fond); color: var(--lampe); font-size: 14px; font-weight: 700; }
  form { display: grid; gap: var(--e-4); }
  section { display: grid; gap: var(--e-3); padding: var(--e-5) var(--e-6); background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-l); box-shadow: inset 0 1px 0 var(--reflet); }
  .films, .comptes { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 300px; overflow-y: auto; }
  .film { display: flex; align-items: center; gap: var(--e-3); min-height: 48px; padding: 0 var(--e-4); border-radius: var(--r-m); background: var(--s2); cursor: pointer; border: 1px solid transparent; font-weight: 600; }
  .film::before { content: ''; flex: none; width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--bord-champ); }
  .film.choisi { border-color: var(--lampe); background: var(--lampe-fond); }
  .film.choisi::before { border-color: var(--lampe); background: radial-gradient(circle, var(--lampe) 0 4px, transparent 5px); }
  .film input { position: absolute; opacity: 0; }
  .film:focus-within { outline: 3px solid var(--lampe-vive); outline-offset: 2px; }
  @media (hover: hover) { .film:not(.choisi):hover { background: var(--s3); } }
  .case { display: flex; gap: 10px; align-items: center; min-height: 44px; cursor: pointer; }
  .case input { width: 20px; height: 20px; accent-color: var(--lampe); }
  .vide { color: var(--doux); margin: 0; }
  .erreur { color: var(--mal); margin: 0; }
  .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .succes { display: grid; gap: 12px; }
  .succes h1 { font-size: 2.25rem; }
  .lien { display: flex; gap: 8px; flex-wrap: wrap; }
  .lien input { flex: 1; min-width: 200px; background: var(--s2); border: 1px solid var(--bord-champ); border-radius: var(--r-m); padding: 0 14px; min-height: 48px; color: inherit; }
  @media (max-width: 640px) { section { padding: var(--e-4); } .actions :global(.bouton) { flex: 1 1 auto; } }
</style>
