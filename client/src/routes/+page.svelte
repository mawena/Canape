<script lang="ts">
  import type { EtatApi } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { Carte, Chargement } from '$lib/ui/index.ts';

  // Page provisoire : l'agent « interface » la remplace par l'accueil « Ce soir ».
  let etat: EtatApi | null = $state(null);
  let erreur: string | null = $state(null);

  $effect(() => {
    api.get<EtatApi>('/api/etat').then(
      (e) => { etat = e; },
      (e: unknown) => { erreur = e instanceof ErreurApi ? e.message : 'Erreur inconnue.'; },
    );
  });
</script>

<svelte:head><title>Canapé</title></svelte:head>

<main>
  <p class="surtitre">Ce soir</p>
  <h1>Canapé</h1>
  <p class="accroche">Le cinéma à deux, chacun chez soi.</p>
  <Carte doree>
    {#if erreur}
      <p class="erreur">{erreur}</p>
    {:else if etat}
      <p>Serveur en version {etat.version}.</p>
      <p>{etat.utilisateur ? `Bonjour ${etat.utilisateur.prenom}.` : etat.installationRequise ? 'Installation requise.' : 'Vous n’êtes pas connecté.'}</p>
    {:else}
      <Chargement />
    {/if}
  </Carte>
</main>

<style>
  main { min-height: 100%; display: grid; place-content: center; justify-items: center; gap: var(--espace-3); padding: var(--espace-5) var(--espace-4); text-align: center;
    background: radial-gradient(ellipse 60% 50% at 50% 0%, rgba(233, 184, 114, 0.22), transparent 70%), radial-gradient(ellipse 80% 60% at 50% 110%, rgba(142, 36, 51, 0.25), transparent 70%), var(--fond); }
  .surtitre { margin: 0; letter-spacing: 0.35em; text-transform: uppercase; font-size: 0.75rem; color: var(--or); }
  h1 { font-size: clamp(3.4rem, 14vw, 5.4rem); line-height: 1; color: var(--or); text-shadow: 0 0 28px rgba(233, 184, 114, 0.55), 0 2px 0 #7a5320; }
  .accroche { color: var(--doux); font-family: var(--titre); font-style: italic; margin: 0 0 var(--espace-4); }
  main :global(.carte) { width: min(420px, 100%); text-align: left; }
  .erreur { color: var(--mal); }
</style>
