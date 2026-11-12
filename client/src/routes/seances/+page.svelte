<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { ListeSeances, Seance } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { Avatar, Bouton, Carte, Chargement, EtatVide } from '$lib/ui/index.ts';
  import { dateEnLettres } from '$lib/seance/dates.ts';
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
  const titre = (s: Seance): string => s.titre ?? s.filmTitre ?? 'Séance';
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
    <EtatVide titre={onglet === 'avenir' ? 'Aucune séance prévue.' : 'Pas encore de séance passée.'} texte={onglet === 'avenir' ? 'Choisis un film et fixe une heure.' : undefined} />
  {:else}
    <ul>
      {#each visibles as s (s.id)}
        {@const enCours = s.presents > 0}
        <li>
          <Carte doree={enCours}>
            <div class="ligne" data-test="seance">
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
              <Bouton href="/seances/{s.id}" variante={onglet === 'avenir' ? 'primaire' : 'secondaire'}>{onglet === 'avenir' ? 'Entrer' : 'Voir'}</Bouton>
            </div>
          </Carte>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px; display: grid; gap: 16px; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  h1 { font: 400 2.2rem 'Instrument Serif', var(--titre, Georgia, serif); margin: 0; }
  .onglets { display: flex; gap: 4px; }
  .onglets button { background: none; border: 0; padding: 8px 14px; border-radius: 999px; color: var(--doux, #b9afc4); }
  .onglets button[aria-selected='true'] { background: var(--lampe-fond, rgba(244, 168, 91, 0.14)); color: var(--lampe, #f4a85b); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .ligne { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .infos { flex: 1; display: grid; min-width: 180px; }
  .film, .date { color: var(--doux, #b9afc4); font-size: 0.9rem; }
  .avatars { display: flex; gap: 4px; }
  .erreur { color: var(--mal, #ff7f70); }
</style>
