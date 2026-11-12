<script lang="ts">
  /**
   * <ChampRecherche bind:value libelle="Rechercher un film" placeholder="Titre, année, personne…" />
   * Pilule de 48 px, loupe à gauche, `type="search"`, bouton d'effacement. `libelle` : nom accessible.
   */
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Icone from './Icone.svelte';

  interface Props extends Omit<HTMLInputAttributes, 'value' | 'type'> {
    value?: string;
    libelle?: string;
  }
  let { value = $bindable(''), libelle = 'Rechercher', class: classe = '', ...reste }: Props = $props();
</script>

<div class="recherche {classe}">
  <Icone nom="recherche" taille={20} class="loupe" />
  <input type="search" bind:value aria-label={libelle} autocomplete="off" {...reste} />
  {#if value}
    <button type="button" class="effacer" aria-label="Effacer la recherche" onclick={() => (value = '')}><Icone nom="fermer" taille={16} /></button>
  {/if}
</div>

<style>
  .recherche { position: relative; display: flex; align-items: center; min-width: 0; }
  .recherche :global(.loupe) { position: absolute; left: 16px; color: var(--discret); pointer-events: none; }
  input {
    width: 100%; min-height: 48px; padding: 0 48px 0 46px; background: var(--s2); color: var(--texte);
    border: 1px solid var(--bord-champ); border-radius: var(--r-pill); font-size: 16px; appearance: none;
  }
  input::-webkit-search-cancel-button { display: none; }
  input::placeholder { color: var(--discret); }
  input:focus { outline: 3px solid var(--lampe-vive); outline-offset: 2px; border-color: var(--lampe); }
  .effacer {
    position: absolute; right: 6px; display: grid; place-items: center; width: 36px; height: 36px;
    border: 0; border-radius: 50%; background: transparent; color: var(--doux);
  }
  @media (hover: hover) { .effacer:hover { background: var(--s3); color: var(--texte); } }
</style>
