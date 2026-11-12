<script lang="ts">
  interface Props {
    /** 0 à 1 ; `null` = indéterminée. */
    valeur: number | null;
    libelle?: string;
  }
  let { valeur, libelle = 'Progression' }: Props = $props();
  const pct = $derived(valeur === null ? null : Math.round(Math.min(1, Math.max(0, valeur)) * 100));
</script>

<div class="barre" role="progressbar" aria-label={libelle} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct ?? undefined}>
  <div class="rempli" class:indeterminee={pct === null} style:width={pct === null ? undefined : `${pct}%`}></div>
</div>

<style>
  .barre { height: 8px; background: var(--fond-3); border-radius: 999px; overflow: hidden; }
  .rempli { height: 100%; background: linear-gradient(90deg, var(--or-doux), var(--or)); border-radius: 999px; transition: width var(--duree); }
  .indeterminee { width: 35%; animation: va-et-vient 1.2s ease-in-out infinite alternate; }
  @keyframes va-et-vient { from { margin-left: 0; } to { margin-left: 65%; } }
</style>
