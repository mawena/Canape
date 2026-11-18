<script lang="ts">
  /**
   * <Logo taille={32} mot />
   * Le logo « la séance » : un écran rouge cinéma, et devant, deux personnes sur un canapé vu de dos (encre).
   * `mot` : ajoute « Canapé » en Instrument Serif (taille du mot = 1,05 × `taille`).
   * Décoratif quand le mot est là ; sinon `libelle` donne son nom accessible.
   */
  interface Props { taille?: number; mot?: boolean; libelle?: string }
  let { taille = 32, mot = false, libelle = 'Canapé' }: Props = $props();
</script>

<span class="logo" style:--t="{taille}px">
  <svg width={taille} height={taille} viewBox="0 0 32 32" role={mot ? undefined : 'img'} aria-label={mot ? undefined : libelle} aria-hidden={mot ? 'true' : undefined}>
    <rect x="3" y="3" width="26" height="13" rx="1.2" fill="var(--logo-2)"/>
    <circle cx="12" cy="19" r="2.8" fill="var(--logo-1)"/>
    <circle cx="20" cy="19" r="2.8" fill="var(--logo-1)"/>
    <path d="M3 25.6a2.4 2.4 0 0 1 4.8 0V23.6a1.4 1.4 0 0 1 1.4-1.4h13.6a1.4 1.4 0 0 1 1.4 1.4v2a2.4 2.4 0 0 1 4.8 0V29H3z" fill="var(--logo-1)"/>
  </svg>
  {#if mot}<span class="mot">Canapé</span>{/if}
</span>

<style>
  .logo { display: inline-flex; align-items: center; gap: 10px; color: var(--texte); }
  svg { flex: none; }
  .mot { font: 400 calc(var(--t) * 1.05) / 1 var(--titre); letter-spacing: -0.01em; }
</style>
