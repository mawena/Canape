<script lang="ts">
  /**
   * <BarreProgression valeur={0.64} libelle="Envoi" ton="lampe" fine />
   * - `valeur` : 0 à 1 ; `null` = indéterminée. - `libelle` : nom accessible (`role="progressbar"`).
   * - `ton` : `lampe` (défaut) · `doux` (en pause) · `ok` · `mal`. - `fine` : 5 px au lieu de 6 px.
   */
  interface Props {
    valeur: number | null;
    libelle?: string;
    ton?: 'lampe' | 'doux' | 'ok' | 'mal';
    fine?: boolean;
  }
  let { valeur, libelle = 'Progression', ton = 'lampe', fine = false }: Props = $props();
  const pct = $derived(valeur === null ? null : Math.round(Math.min(1, Math.max(0, valeur)) * 100));
</script>

<div class="barre" class:fine role="progressbar" aria-label={libelle} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct ?? undefined}>
  <div class="rempli {ton}" class:indeterminee={pct === null} style:width={pct === null ? undefined : `${pct}%`}></div>
</div>

<style>
  .barre { height: 6px; background: var(--s3); border-radius: var(--r-pill); overflow: hidden; }
  .fine { height: 5px; }
  .rempli { height: 100%; border-radius: inherit; transition: width var(--d-2) var(--ease); }
  .lampe { background: var(--lampe); }
  .doux { background: var(--doux); }
  .ok { background: var(--ok); }
  .mal { background: var(--mal); }
  .indeterminee { width: 35%; animation: va-et-vient 1.2s ease-in-out infinite alternate; }
  @keyframes va-et-vient { from { margin-left: 0; } to { margin-left: 65%; } }
</style>
