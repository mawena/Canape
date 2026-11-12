<script lang="ts">
  /**
   * <Logo taille={32} mot />
   * Le logo « deux coussins » : deux coussins arrondis qui se chevauchent (lampe et rose) sur une assise claire.
   * `mot` : ajoute « Canapé » en Instrument Serif (taille du mot = 0,95 × `taille`).
   * Décoratif quand le mot est là ; sinon `libelle` donne son nom accessible.
   */
  interface Props { taille?: number; mot?: boolean; libelle?: string }
  let { taille = 32, mot = false, libelle = 'Canapé' }: Props = $props();
</script>

<span class="logo" style:--t="{taille}px">
  <svg width={taille} height={taille} viewBox="0 0 32 32" role={mot ? undefined : 'img'} aria-label={mot ? undefined : libelle} aria-hidden={mot ? 'true' : undefined}>
    <rect x="2" y="10" width="16" height="16" rx="6" fill="var(--logo-1)" />
    <rect x="14" y="6" width="16" height="20" rx="7" fill="var(--logo-2)" fill-opacity=".92" />
    <rect x="2" y="24" width="28" height="4" rx="2" fill="var(--logo-assise)" />
  </svg>
  {#if mot}<span class="mot">Canapé</span>{/if}
</span>

<style>
  .logo { display: inline-flex; align-items: center; gap: 10px; color: var(--texte); }
  svg { flex: none; }
  .mot { font: 400 calc(var(--t) * 0.95) / 1 var(--titre); }
</style>
