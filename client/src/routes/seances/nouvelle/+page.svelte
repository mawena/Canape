<script lang="ts">
  // Nouvelle séance. Un film comme avant ; « Ajouter un autre film » en fait une soirée (programme ordonné, boutons
  // monter / descendre / retirer). `data-test` : `film-<id>` (choix), `ajouter-film-programme`, `programme`, `programme-film`,
  // `programme-monter`, `programme-descendre`, `programme-retirer`, `creer-seance`, `seance-creee`, `resume-programme`.
  import { onMount, tick } from 'svelte';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import X from '@lucide/svelte/icons/x';
  import BoutonAgenda from '$lib/seance/BoutonAgenda.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { MAX_FILMS_PROGRAMME, phraseProgramme, type CorpsCreerSeance, type Film, type ReponseLienSeance, type Seance, type UtilisateurPublic } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import ChercherCompte from '$lib/comptes/ChercherCompte.svelte';
  import { Avatar, Bouton, Carte, Champ, Chargement, MiniAffiche, toast } from '$lib/ui/index.ts';
  import { ceSoir21h, messageInvitation, versIso } from '$lib/seance/dates.ts';
  import { lireMoi, urlConnexion } from '$lib/seance/moi.ts';
  import { ajouterFilm, deplacerFilm, filmsDuCorps, retirerFilm, titresEnchaines } from '$lib/seance/programme.ts';

  let films: Film[] = $state([]);
  let comptes: UtilisateurPublic[] = $state([]);
  let chargement = $state(true);
  let erreur: string | null = $state(null);
  const filmDemande = page.url.searchParams.get('film');
  /** Les films de la séance, dans l'ordre (un seul : une séance ordinaire). */
  let programme: string[] = $state(filmDemande ? [filmDemande] : []);
  /** « Ajouter un autre film » : la liste devient des cases à cocher, l'ordre se règle au-dessus. */
  let soiree = $state(false);
  let statut = $state('');
  let listeProgramme: HTMLOListElement | undefined = $state();
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
  const filmParId = $derived(new Map(films.map((f) => [f.id, f])));
  const choisis = $derived(programme.map((id) => filmParId.get(id)).filter((f): f is Film => !!f));
  const film = $derived(choisis[0] ?? null);
  const plein = $derived(programme.length >= MAX_FILMS_PROGRAMME);

  function choisirSeul(id: string): void { programme = [id]; }
  function basculerFilm(f: Film, coche: boolean): void {
    if (coche && plein) return;
    programme = coche ? ajouterFilm(programme, f.id) : retirerFilm(programme, f.id);
    statut = coche ? `${f.titre} ajouté, ${programme.length}e film de la soirée.` : `${f.titre} retiré de la soirée.`;
    if (!programme.length) soiree = false;
  }
  function passerEnSoiree(): void {
    soiree = true;
    statut = 'Coche les autres films : ils passent dans l’ordre où tu les choisis.';
  }
  async function deplacer(f: Film, sens: -1 | 1): Promise<void> {
    programme = deplacerFilm(programme, f.id, sens);
    statut = `${f.titre} : ${programme.indexOf(f.id) + 1}e film.`;
    await tick();
    const ligne = listeProgramme?.querySelector(`[data-film="${CSS.escape(f.id)}"]`);
    const meme = ligne?.querySelector<HTMLButtonElement>(`[data-test="programme-${sens < 0 ? 'monter' : 'descendre'}"]`);
    const autre = ligne?.querySelector<HTMLButtonElement>(`[data-test="programme-${sens < 0 ? 'descendre' : 'monter'}"]`);
    (meme && !meme.disabled ? meme : autre)?.focus();
  }
  function retirer(f: Film): void {
    basculerFilm(f, false);
  }

  function ajouterTrouve(u: UtilisateurPublic): void {
    if (!comptes.some((c) => c.id === u.id)) comptes = [...comptes, u];
    if (!invites.includes(u.id)) invites = [...invites, u.id];
  }

  function basculerInvite(id: number): void {
    invites = invites.includes(id) ? invites.filter((x) => x !== id) : [...invites, id];
  }

  async function creer(e: Event): Promise<void> {
    e.preventDefault();
    if (!programme.length) { erreur = 'Choisis un film.'; return; }
    envoi = true;
    erreur = null;
    try {
      const corps: CorpsCreerSeance = { ...filmsDuCorps(programme), invites };
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
    const texte = messageInvitation(titresEnchaines(choisis.map((f) => f.titre)), creee?.prevueLe ?? null, lien);
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
        {#if phraseProgramme(choisis.map((f) => f.titre))}<p class="resume" data-test="resume-programme">{phraseProgramme(choisis.map((f) => f.titre))}</p>{/if}
        <p>Envoie ce lien à qui tu veux inviter.</p>
        <div class="lien">
          <input readonly value={lien} aria-label="Lien d’invitation" data-test="lien-invitation" onfocus={(e) => e.currentTarget.select()} />
          <Bouton variante="secondaire" icone="lien" onclick={() => copier(lien!, 'Lien copié.')} data-test="copier-lien">Copier le lien</Bouton>
        </div>
        <div class="actions">
          {#if creee.prevueLe}<BoutonAgenda seanceId={creee.id} variante="secondaire" />{/if}
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
        <h2><span class="num" aria-hidden="true">1</span>{soiree ? 'Les films de la soirée' : 'Le film'}</h2>
        {#if soiree}
          <p class="vide">Ils passent dans cet ordre, avec un entracte de 5 minutes entre deux.</p>
          <ol class="programme" bind:this={listeProgramme} aria-label="Ordre des films" data-test="programme">
            {#each choisis as f, i (f.id)}
              <li class="ligne-programme" data-test="programme-film" data-film={f.id}>
                <span class="rang tn" aria-hidden="true">{i + 1}</span>
                <MiniAffiche film={f} largeur={32} />
                <span class="titre-film">{f.titre}{#if f.annee}<span class="annee">{f.annee}</span>{/if}</span>
                <span class="gestes">
                  <button type="button" class="petit" onclick={() => deplacer(f, -1)} disabled={i === 0} aria-label="Monter {f.titre}" title="Monter" data-test="programme-monter"><ChevronUp size={18} aria-hidden="true" /></button>
                  <button type="button" class="petit" onclick={() => deplacer(f, 1)} disabled={i === choisis.length - 1} aria-label="Descendre {f.titre}" title="Descendre" data-test="programme-descendre"><ChevronDown size={18} aria-hidden="true" /></button>
                  <button type="button" class="petit" onclick={() => retirer(f)} aria-label="Retirer {f.titre}" title="Retirer" data-test="programme-retirer"><X size={18} aria-hidden="true" /></button>
                </span>
              </li>
            {/each}
          </ol>
        {/if}
        <Champ libelle={soiree ? 'Ajouter un film' : 'Chercher un film'} bind:value={recherche} type="search" />
        {#if !films.length}
          <p class="vide">Aucun film prêt pour l’instant.</p>
        {:else if soiree}
          <ul class="films" role="group" aria-label="Films de la soirée">
            {#each filtres as f (f.id)}
              {@const coche = programme.includes(f.id)}
              <li>
                <label class="film case-film" class:choisi={coche}>
                  <input type="checkbox" checked={coche} disabled={!coche && plein} onchange={(e) => basculerFilm(f, e.currentTarget.checked)} data-test="film-{f.id}" />
                  <span>{f.titre}{f.annee ? ` (${f.annee})` : ''}</span>
                  {#if coche}<span class="position tn">{programme.indexOf(f.id) + 1}</span>{/if}
                </label>
              </li>
            {/each}
          </ul>
        {:else}
          <ul class="films" role="radiogroup" aria-label="Film">
            {#each filtres as f (f.id)}
              <li>
                <label class="film" class:choisi={programme[0] === f.id}>
                  <input type="radio" name="film" value={f.id} checked={programme[0] === f.id} onchange={() => choisirSeul(f.id)} data-test="film-{f.id}" />
                  <span>{f.titre}{f.annee ? ` (${f.annee})` : ''}</span>
                </label>
              </li>
            {/each}
          </ul>
        {/if}
        {#if !soiree && film && films.length > 1}
          <div class="ajout">
            <Bouton variante="secondaire" icone="plus" onclick={passerEnSoiree} data-test="ajouter-film-programme">Ajouter un autre film</Bouton>
            <span class="vide">Pour enchaîner plusieurs films, avec un entracte entre deux.</span>
          </div>
        {/if}
        {#if plein}<p class="vide">Une soirée compte {MAX_FILMS_PROGRAMME} films au plus.</p>{/if}
        <p class="lu" role="status">{statut}</p>
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
        <ChercherCompte surTrouve={ajouterTrouve} exclus={comptes.map((c) => c.id)} />
        <p class="vide">Tu peux aussi inviter quelqu’un par lien : il apparaît après la création.</p>
      </section>

      {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
      <div class="actions">
        <Bouton variante="discret" href="/seances">Annuler</Bouton>
        <Bouton type="submit" chargement={envoi} disabled={!programme.length} data-test="creer-seance">{programme.length > 1 ? 'Créer la soirée' : 'Créer la séance'}</Bouton>
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
  .case-film::before { border-radius: 5px; }
  .case-film.choisi::before { background: var(--lampe); box-shadow: inset 0 0 0 3px var(--lampe-fond); }
  .position { margin-left: auto; display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 999px; background: var(--lampe); color: var(--lampe-sur, #fff); font-size: 13px; font-weight: 700; }
  .programme { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .ligne-programme { display: flex; align-items: center; gap: var(--e-3); min-height: 60px; padding: 6px 8px 6px 12px; border-radius: var(--r-m); background: var(--s2); border: 1px solid var(--bord); }
  .rang { flex: none; width: 20px; font-weight: 700; color: var(--lampe); text-align: center; }
  .titre-film { flex: 1; min-width: 0; font: 400 1.25rem / 1.15 var(--titre); overflow-wrap: anywhere; }
  .annee { margin-left: 8px; font: 500 0.85rem var(--texte-police); color: var(--discret); }
  .gestes { display: flex; gap: 2px; flex: none; }
  .petit { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 10px; background: transparent; color: var(--doux); }
  .petit:hover:not(:disabled) { background: var(--s3); color: var(--texte); }
  .petit:disabled { opacity: 0.3; cursor: not-allowed; }
  .petit:focus-visible { outline: 3px solid var(--lampe-vive); outline-offset: 1px; }
  .ajout { display: flex; align-items: center; gap: var(--e-3); flex-wrap: wrap; }
  .lu { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
  .resume { margin: 0; font-weight: 600; }
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
