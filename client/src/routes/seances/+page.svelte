<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { phraseProgramme, programmeTrie, type ListeSeances, type ReponseLienSeance, type Seance } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { session } from '$lib/interface/session.svelte.ts';
  import { Avatar, Bouton, Carte, Chargement, EtatVide, Interrupteur, Modale, toast } from '$lib/ui/index.ts';
  import BoutonAgenda from '$lib/seance/BoutonAgenda.svelte';
  import { dateEnLettres } from '$lib/seance/dates.ts';
  import { peutGererSeance, peutInviter } from '$lib/seance/inviter.ts';
  import { urlConnexion } from '$lib/seance/moi.ts';

  let liste = $state(null as ListeSeances | null);
  let erreur: string | null = $state(null);
  let onglet: 'avenir' | 'passees' = $state('avenir');

  const admin = $derived(session.utilisateur?.role === 'admin');
  const moiId = $derived(session.utilisateur?.id ?? null);
  /** Administrateur : voir aussi les séances des autres (pour les gérer). */
  let toutes = $state(false);

  async function charger(): Promise<void> {
    try {
      liste = await api.get<ListeSeances>(toutes ? '/api/seances?toutes=1' : '/api/seances');
      erreur = null;
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) { await goto(urlConnexion('/seances')); return; }
      erreur = e instanceof Error ? e.message : 'Erreur inconnue.';
    }
  }
  onMount(charger);

  let aSupprimer: Seance | null = $state(null);
  let confirmation = $state(false);
  let suppressionEnCours = $state(false);
  function demanderSuppression(s: Seance): void { aSupprimer = s; confirmation = true; }
  async function supprimer(): Promise<void> {
    const s = aSupprimer;
    if (!s || !liste) return;
    suppressionEnCours = true;
    try {
      await api.supprimer(`/api/seances/${encodeURIComponent(s.id)}`);
      const sans = (l: Seance[]): Seance[] => l.filter((x) => x.id !== s.id);
      liste = { aVenir: sans(liste.aVenir), enCours: sans(liste.enCours), recentes: sans(liste.recentes) };
      toast.ok(`« ${titre(s)} » est supprimée.`);
      confirmation = false;
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'Suppression impossible.');
    } finally {
      suppressionEnCours = false;
    }
  }

  const avenir = $derived(liste ? [...liste.enCours, ...liste.aVenir] : []);
  const visibles = $derived(onglet === 'avenir' ? avenir : (liste?.recentes ?? []));
  let copieEnCours: string | null = $state(null);
  async function copierLien(s: Seance): Promise<void> {
    copieEnCours = s.id;
    try {
      const { lien } = await api.post<ReponseLienSeance>(`/api/seances/${encodeURIComponent(s.id)}/lien`);
      await navigator.clipboard.writeText(lien);
      toast.ok('Lien copié.');
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'Copie impossible : ouvre la séance et utilise « Inviter ».');
    } finally {
      copieEnCours = null;
    }
  }
  const titre = (s: Seance): string => s.titre ?? s.filmTitre ?? 'Séance';
  /** Soirée : « 3 films : A, B, C » à la place du titre du film ; `null` pour un seul film. */
  const programme = (s: Seance): string | null => phraseProgramme(programmeTrie(s.programme ?? []).map((f) => f.titre));
  const quand = (s: Seance): Date => new Date(s.prevueLe ?? s.creeLe);
  const jour = (s: Seance): string => String(quand(s).getDate());
  const mois = (s: Seance): string => quand(s).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
</script>

<svelte:head><title>Séances — Canapé</title></svelte:head>

<main data-test="page-seances">
  <header>
    <h1>Séances</h1>
    <Bouton href="/seances/nouvelle" icone="plus" data-test="nouvelle-seance">Lancer une séance</Bouton>
  </header>

  <div class="barre">
    <div class="onglets" role="tablist">
      <button type="button" role="tab" aria-selected={onglet === 'avenir'} onclick={() => (onglet = 'avenir')} data-test="onglet-avenir">À venir</button>
      <button type="button" role="tab" aria-selected={onglet === 'passees'} onclick={() => (onglet = 'passees')} data-test="onglet-passees">Passées</button>
    </div>
    {#if admin}
      <Interrupteur bind:coche={toutes} libelle="Toutes les séances" surChangement={charger} />
    {/if}
  </div>

  {#if erreur}
    <p class="erreur" role="alert">{erreur}</p>
  {:else if !liste}
    <Chargement />
  {:else if !visibles.length}
    <EtatVide icone="popcorn" titre={onglet === 'avenir' ? 'Aucune séance prévue.' : 'Pas encore de séance passée.'} texte={onglet === 'avenir' ? 'Choisis un film, fixe une heure et invite quelqu’un : le salon s’ouvre pour vous deux.' : 'Les séances terminées apparaîtront ici.'}>
      {#snippet actions()}{#if onglet === 'avenir'}<Bouton href="/seances/nouvelle" icone="plus">Lancer une séance</Bouton>{/if}{/snippet}
    </EtatVide>
  {:else}
    <ul>
      {#each visibles as s (s.id)}
        {@const enCours = s.presents > 0}
        {@const soiree = programme(s)}
        <li>
          <Carte doree={enCours}>
            <div class="ligne" data-test="seance">
              <div class="date-bloc" aria-hidden="true"><b class="tn">{jour(s)}</b><span>{mois(s)}</span></div>
              <div class="infos">
                <strong>{titre(s)}</strong>
                {#if soiree}<span class="film" data-test="resume-programme">{soiree}</span>
                {:else if s.titre && s.filmTitre}<span class="film">{s.filmTitre}</span>{/if}
                <span class="date">{enCours ? `${s.presents} dans la salle` : dateEnLettres(s.prevueLe) || dateEnLettres(s.creeLe)}</span>
              </div>
              <div class="avatars">
                {#each [{ id: s.hoteId, prenom: s.hotePrenom, couleur: null }, ...s.invites] as u (u.id)}
                  <Avatar prenom={u.prenom} couleur={u.couleur} taille={32} />
                {/each}
              </div>
              {#if onglet === 'avenir' && peutInviter(s, moiId, admin)}
                <Bouton variante="discret" icone="lien" chargement={copieEnCours === s.id} onclick={() => copierLien(s)} data-test="copier-lien-liste">Copier le lien</Bouton>
              {/if}
              {#if onglet === 'avenir' && s.prevueLe && s.termineeLe === null && !enCours}
                <BoutonAgenda seanceId={s.id} />
              {/if}
              {#if peutGererSeance(s, moiId, admin) && !enCours}
                <Bouton variante="discret" icone="supprimer" onclick={() => demanderSuppression(s)} aria-label="Supprimer la séance « {titre(s)} »" data-test="supprimer-seance">Supprimer</Bouton>
              {/if}
              <Bouton href="/seances/{s.id}" variante={onglet === 'avenir' ? 'primaire' : 'secondaire'}>{onglet === 'avenir' ? 'Entrer' : 'Voir'}</Bouton>
            </div>
          </Carte>
        </li>
      {/each}
    </ul>
  {/if}

  <Modale bind:ouverte={confirmation} titre={aSupprimer ? `Supprimer « ${titre(aSupprimer)} » ?` : 'Supprimer la séance ?'} dangereuse>
    <p>La séance, son lien d’invitation et sa discussion seront effacés pour de bon. Les films restent dans la galerie.</p>
    {#snippet pied()}
      <Bouton variante="discret" onclick={() => { confirmation = false; }}>Garder</Bouton>
      <Bouton variante="danger" icone="supprimer" chargement={suppressionEnCours} onclick={supprimer} data-test="confirmer-suppression-seance">Supprimer</Bouton>
    {/snippet}
  </Modale>
</main>

<style>
  main { max-width: 820px; margin: 0 auto; display: grid; gap: var(--e-5); }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; padding-bottom: var(--e-4); border-bottom: 2px solid var(--filet); }
  h1 { font: 400 clamp(2.75rem, 7vw, 4.5rem) / 0.97 var(--titre); letter-spacing: -0.01em; margin: 0; }
  .barre { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--e-4); flex-wrap: wrap; border-bottom: 1px solid var(--bord); }
  .onglets { display: flex; gap: var(--e-6); }
  .onglets button { background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 0; min-height: 44px; color: var(--doux); font: 650 12.5px/1 var(--texte-police); letter-spacing: 0.1em; text-transform: uppercase; }
  .onglets button:hover:not([aria-selected='true']) { color: var(--texte); }
  .onglets button[aria-selected='true'] { color: var(--texte); border-bottom-color: var(--lampe); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; }
  ul :global(.carte) { padding: var(--e-5) 0; background: none; border: 0; border-bottom: 1px solid var(--bord); border-radius: 0; }
  .ligne { display: flex; align-items: center; gap: var(--e-4); flex-wrap: wrap; }
  .date-bloc { display: grid; place-content: center; justify-items: center; width: 64px; flex: none; line-height: 1; border-right: 1px solid var(--bord); padding-right: var(--e-4); }
  .date-bloc b { font: 400 2.75rem / 0.9 var(--titre); }
  .date-bloc span { margin-top: 4px; font-size: 0.6875rem; font-weight: 650; letter-spacing: 0.12em; color: var(--lampe); text-transform: uppercase; }
  .infos { flex: 1; display: grid; gap: 2px; min-width: 160px; }
  .infos strong { font: 400 1.5rem / 1.1 var(--titre); }
  .film, .date { color: var(--doux); font-size: 0.9rem; }
  .avatars { display: flex; }
  .avatars :global(.avatar + .avatar) { margin-left: -8px; }
  .erreur { color: var(--mal); }
</style>
