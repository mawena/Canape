<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { ListeSeances, ReponseLienSeance, Seance } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { session } from '$lib/interface/session.svelte.ts';
  import { Avatar, Bouton, Carte, Chargement, EtatVide, toast } from '$lib/ui/index.ts';
  import BoutonAgenda from '$lib/seance/BoutonAgenda.svelte';
  import { dateEnLettres } from '$lib/seance/dates.ts';
  import { peutInviter } from '$lib/seance/inviter.ts';
  import { urlConnexion } from '$lib/seance/moi.ts';

  let liste = $state(null as ListeSeances | null);
  let erreur: string | null = $state(null);
  let onglet: 'avenir' | 'passees' = $state('avenir');

  onMount(async () => {
    try {
      liste = await api.get<ListeSeances>('/api/seances');
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) { await goto(urlConnexion('/seances')); return; }
      erreur = e instanceof Error ? e.message : 'Erreur inconnue.';
    }
  });

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

  <div class="onglets" role="tablist">
    <button type="button" role="tab" aria-selected={onglet === 'avenir'} onclick={() => (onglet = 'avenir')} data-test="onglet-avenir">À venir</button>
    <button type="button" role="tab" aria-selected={onglet === 'passees'} onclick={() => (onglet = 'passees')} data-test="onglet-passees">Passées</button>
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
        <li>
          <Carte doree={enCours}>
            <div class="ligne" data-test="seance">
              <div class="date-bloc" aria-hidden="true"><b class="tn">{jour(s)}</b><span>{mois(s)}</span></div>
              <div class="infos">
                <strong>{titre(s)}</strong>
                {#if s.titre && s.filmTitre}<span class="film">{s.filmTitre}</span>{/if}
                <span class="date">{enCours ? `${s.presents} dans la salle` : dateEnLettres(s.prevueLe) || dateEnLettres(s.creeLe)}</span>
              </div>
              <div class="avatars">
                {#each [{ id: s.hoteId, prenom: s.hotePrenom, couleur: null }, ...s.invites] as u (u.id)}
                  <Avatar prenom={u.prenom} couleur={u.couleur} taille={32} />
                {/each}
              </div>
              {#if onglet === 'avenir' && peutInviter(s, session.utilisateur?.id)}
                <Bouton variante="discret" icone="lien" chargement={copieEnCours === s.id} onclick={() => copierLien(s)} data-test="copier-lien-liste">Copier le lien</Bouton>
              {/if}
              {#if onglet === 'avenir' && s.prevueLe && s.termineeLe === null && !enCours}
                <BoutonAgenda seanceId={s.id} />
              {/if}
              <Bouton href="/seances/{s.id}" variante={onglet === 'avenir' ? 'primaire' : 'secondaire'}>{onglet === 'avenir' ? 'Entrer' : 'Voir'}</Bouton>
            </div>
          </Carte>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main { max-width: 820px; margin: 0 auto; display: grid; gap: var(--e-5); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  h1 { font: 400 clamp(2.25rem, 5vw, 3rem) / 1.02 var(--titre); letter-spacing: -0.01em; margin: 0; }
  .onglets { display: inline-flex; justify-self: start; gap: 2px; padding: 4px; background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-m); }
  .onglets button { background: none; border: 0; padding: 0 18px; min-height: 40px; border-radius: 9px; color: var(--doux); font-weight: 600; font-size: 14.5px; }
  .onglets button:hover:not([aria-selected='true']) { color: var(--texte); }
  .onglets button[aria-selected='true'] { background: var(--s3); color: var(--texte); box-shadow: inset 0 1px 0 var(--reflet), 0 1px 3px rgba(0, 0, 0, 0.4); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--e-3); }
  ul :global(.carte) { padding: var(--e-4) var(--e-5); }
  .ligne { display: flex; align-items: center; gap: var(--e-4); flex-wrap: wrap; }
  .date-bloc { display: grid; place-content: center; justify-items: center; width: 56px; height: 64px; border-radius: var(--r-m); background: var(--s2); border: 1px solid var(--bord); flex: none; line-height: 1; }
  .date-bloc b { font: 700 1.5rem / 1 var(--texte-police); }
  .date-bloc span { margin-top: 4px; font-size: 0.75rem; font-weight: 600; color: var(--lampe); text-transform: lowercase; }
  .infos { flex: 1; display: grid; gap: 2px; min-width: 160px; }
  .infos strong { font-weight: 650; font-size: 1.0625rem; }
  .film, .date { color: var(--doux); font-size: 0.9rem; }
  .avatars { display: flex; }
  .avatars :global(.avatar + .avatar) { margin-left: -8px; }
  .erreur { color: var(--mal); }
</style>
