<script lang="ts">
  /** Choix du thème : Clair, Sombre, Comme mon appareil (trois boutons-radio en segments). Mémorisé par `theme`. */
  import { theme, LIBELLES_THEME, type PreferenceTheme } from '$lib/interface/theme.svelte.ts';
  const CHOIX: PreferenceTheme[] = ['clair', 'sombre', 'auto'];
</script>

<div class="theme" role="radiogroup" aria-label="Apparence" data-test="selecteur-theme">
  {#each CHOIX as c (c)}
    <button type="button" role="radio" aria-checked={theme.preference === c} class:actif={theme.preference === c} data-test="theme-{c}" onclick={() => theme.choisir(c)}>
      {LIBELLES_THEME[c]}
    </button>
  {/each}
</div>

<style>
  .theme { display: inline-flex; gap: 2px; padding: 4px; max-width: 100%; background: var(--s2); border: 1px solid var(--bord); border-radius: var(--r-m); }
  button { min-height: 40px; padding: 0 14px; border: 0; border-radius: 9px; background: transparent; color: var(--doux); font: 600 14px/1.2 var(--texte-police); }
  button:hover:not(.actif) { color: var(--texte); }
  .actif { background: var(--s1); color: var(--lampe); box-shadow: var(--ombre-1), inset 0 1px 0 var(--reflet); }
  @media (max-width: 400px) { button { padding: 0 8px; font-size: 13px; } }
</style>
