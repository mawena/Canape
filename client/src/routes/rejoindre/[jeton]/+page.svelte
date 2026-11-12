<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { Bouton, Chargement } from '$lib/ui/index.ts';
  import { lireMoi, urlConnexion } from '$lib/seance/moi.ts';

  const jeton = page.params['jeton'] ?? '';
  let erreur: string | null = $state(null);

  onMount(async () => {
    try {
      const moi = await lireMoi();
      if (!moi) { await goto(urlConnexion(`/rejoindre/${jeton}`), { replaceState: true }); return; }
      const r = await api.post<{ seanceId: string }>(`/api/rejoindre/${encodeURIComponent(jeton)}`);
      await goto(`/seances/${r.seanceId}`, { replaceState: true });
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) { await goto(urlConnexion(`/rejoindre/${jeton}`), { replaceState: true }); return; }
      erreur = e instanceof ErreurApi && e.statut === 404 ? 'Ce lien n’est plus valable. Demande-en un nouveau.' : e instanceof Error ? e.message : 'Erreur inconnue.';
    }
  });
</script>

<svelte:head><title>Rejoindre une séance — Canapé</title></svelte:head>

<main data-test="page-rejoindre">
  {#if erreur}
    <h1>Impossible de rejoindre</h1>
    <p role="alert">{erreur}</p>
    <Bouton href="/seances">Mes séances</Bouton>
  {:else}
    <Chargement />
    <p>On t’installe dans la salle…</p>
  {/if}
</main>

<style>
  main { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 12px; text-align: center; padding: 24px; }
  h1 { font: 400 2rem 'Instrument Serif', var(--titre, Georgia, serif); margin: 0; }
  p { margin: 0; color: var(--doux, #b9afc4); }
</style>
