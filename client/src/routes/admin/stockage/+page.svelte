<script lang="ts">
  import type { Stockage } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { formaterOctets, pourcentage } from '$lib/comptes/format.ts';
  import { BarreProgression, Carte, Chargement } from '$lib/ui/index.ts';

  let stockage = $state<Stockage | null>(null);
  let echec = $state<string | null>(null);

  $effect(() => {
    api.get<Stockage>('/api/admin/stockage').then((s) => { stockage = s; }, (x: unknown) => {
      echec = x instanceof ErreurApi ? x.message : 'Impossible de lire l’espace disque.';
    });
  });

  const utilise = $derived(stockage ? stockage.disque.total - stockage.disque.libre : 0);
  const critique = $derived(stockage ? pourcentage(utilise, stockage.disque.total) >= 95 : false);
</script>

<svelte:head><title>Espace disque · Canapé</title></svelte:head>

<h1>Espace disque</h1>
{#if echec}
  <p>{echec}</p>
{:else if !stockage}
  <Chargement />
{:else}
  <Carte titre="Disque">
    <BarreProgression valeur={stockage.disque.total ? utilise / stockage.disque.total : 0} libelle="Disque utilisé" />
    <p>{formaterOctets(stockage.disque.libre)} libres sur {formaterOctets(stockage.disque.total)}.</p>
    {#if critique}<p class="alerte">Il reste {formaterOctets(stockage.disque.libre)} : pense à faire de la place.</p>{/if}
    <p class="doux">Films : {formaterOctets(stockage.films)} · Cache de lecture : {formaterOctets(stockage.cache)} (plafond {formaterOctets(stockage.cacheMax)}).</p>
  </Carte>
  <Carte titre="Par personne">
    <ul class="liste">
      {#each stockage.parUtilisateur as u (u.utilisateurId)}
        <li>
          <div class="ligne"><strong>{u.prenom}</strong><span class="doux">{formaterOctets(u.octets)} / {u.quotaOctets === null ? 'illimité' : formaterOctets(u.quotaOctets)}</span></div>
          {#if u.quotaOctets !== null}<BarreProgression valeur={u.quotaOctets > 0 ? u.octets / u.quotaOctets : 1} libelle={`Espace de ${u.prenom}`} />{/if}
        </li>
      {/each}
    </ul>
  </Carte>
{/if}

<style>
  .liste { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--espace-3); }
  .ligne { display: flex; justify-content: space-between; gap: var(--espace-3); }
  .doux { color: var(--doux); }
  .alerte { color: var(--mal); margin: 0; }
  p { margin: 0; }
</style>
