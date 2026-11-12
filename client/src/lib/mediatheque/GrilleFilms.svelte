<script lang="ts">
  import type { Film } from '@canape/partage';
  import CarteAffiche from './CarteAffiche.svelte';

  let { films }: { films: Film[] } = $props();
</script>

<ul class="grille">
  {#each films as film (film.id)}
    <li><CarteAffiche {film} /></li>
  {/each}
</ul>

<style>
  .grille { list-style: none; margin: 0; padding: 0; display: grid; gap: 24px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (min-width: 640px) { .grille { grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); } }
</style>
