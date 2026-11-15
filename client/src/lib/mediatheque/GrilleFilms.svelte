<script lang="ts">
  import type { EtatEnvie, Film } from '@canape/partage';
  import CarteAffiche from './CarteAffiche.svelte';

  /** `surEnvie` : avec ce rappel, chaque film prêt porte le cœur « J'ai envie de le voir ». */
  let { films, surEnvie }: { films: Film[]; surEnvie?: (e: EtatEnvie) => void } = $props();
</script>

<ul class="grille">
  {#each films as film (film.id)}
    <li><CarteAffiche {film} {surEnvie} /></li>
  {/each}
</ul>

<style>
  .grille { list-style: none; margin: 0; padding: 0; display: grid; gap: 24px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (min-width: 640px) { .grille { grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); } }
</style>
