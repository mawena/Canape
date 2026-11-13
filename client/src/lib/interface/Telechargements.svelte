<script lang="ts">
  /**
   * Téléchargements par torrent en cours, sur l'accueil (phase 18) : nom, barre d'avancement, chiffres. Rien tant qu'il n'y en a pas.
   * Le suivi (rafraîchissement, arrêt quand l'onglet est caché) est celui de la galerie : `telechargements.svelte.ts`.
   */
  import { onMount } from 'svelte';
  import { BarreProgression, Icone } from '$lib/ui/index.ts';
  import { telechargements } from '$lib/mediatheque/torrents/telechargements.svelte.ts';
  import { detailChiffres, libelleEtat, nomAffiche } from '$lib/mediatheque/torrents/logique.ts';
  import { telechargementsAMontrer, titreTelechargements } from '$lib/interface/accueil.ts';
  import { liens } from '$lib/interface/liens.ts';

  onMount(() => { void telechargements.charger(); });
  const actifs = $derived(telechargementsAMontrer(telechargements.liste));
</script>

{#if actifs.length > 0}
  <section class="dl" aria-labelledby="titre-dl" data-test="accueil-telechargements">
    <div class="tete">
      <h2 id="titre-dl" class="t-titre2">{titreTelechargements(actifs.length)}</h2>
      <a class="voir-tout" href={liens.galerie}>Voir dans la galerie</a>
    </div>
    <ul>
      {#each actifs.slice(0, 4) as t (t.id)}
        <li data-test="accueil-telechargement" data-etat={t.etat}>
          <Icone nom="televerser" taille={18} />
          <div class="corps">
            <p class="nom">{nomAffiche(t)}</p>
            <BarreProgression valeur={t.octetsTotal === null ? null : t.progression} libelle="Avancement de {nomAffiche(t)}" ton={t.etat === 'pause' ? 'doux' : 'lampe'} fine />
            <p class="detail tn">{detailChiffres(t, telechargements.attentePlace(t)) || libelleEtat(t, telechargements.attentePlace(t), telechargements.metaLongue(t))}</p>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .dl { display: grid; gap: var(--e-4); }
  .tete { display: flex; align-items: baseline; justify-content: space-between; gap: var(--e-4); flex-wrap: wrap; }
  .voir-tout { color: var(--lampe); text-decoration: none; font-weight: 600; font-size: 15px; min-height: 24px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--e-3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); }
  li { display: flex; gap: 12px; align-items: flex-start; padding: var(--e-4); border-radius: var(--r-l); background: var(--s1); border: 1px solid var(--bord); box-shadow: var(--ombre-1, none); color: var(--lampe); }
  .corps { display: grid; gap: 8px; min-width: 0; flex: 1; color: var(--texte); }
  .nom { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { color: var(--doux); font-size: 14px; }
</style>
