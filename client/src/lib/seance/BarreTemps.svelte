<script lang="ts">
  // Barre de temps partagée : curseur accessible (role="slider"), couches tampon et lu, glisser au pointeur.
  import { formaterDuree, formaterTemps } from './synchro.ts';

  interface Props {
    temps: number;
    duree: number;
    tampon: number;
    surAller: (s: number) => void;
  }
  let { temps, duree, tampon, surAller }: Props = $props();
  let piste: HTMLDivElement | undefined = $state();
  let glisse: number | null = $state(null);

  const affiche = $derived(glisse ?? temps);
  const pct = (s: number): number => (duree > 0 ? Math.max(0, Math.min(100, (s / duree) * 100)) : 0);

  function depuis(e: PointerEvent): number {
    const r = piste!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duree;
  }
  function bas(e: PointerEvent): void {
    if (!duree) return;
    piste!.setPointerCapture(e.pointerId);
    glisse = depuis(e);
  }
  function deplace(e: PointerEvent): void {
    if (glisse !== null) glisse = depuis(e);
  }
  function haut(e: PointerEvent): void {
    if (glisse === null) return;
    surAller(depuis(e));
    glisse = null;
  }
  function clavier(e: KeyboardEvent): void {
    const pas = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!pas) return;
    e.preventDefault();
    e.stopPropagation();
    surAller(temps + pas);
  }
</script>

<div class="ligne">
  <span class="t">{formaterTemps(affiche)}</span>
  <div
    class="zone" bind:this={piste} role="slider" tabindex="0" aria-label="Position dans le film" aria-valuemin="0" aria-valuemax={Math.round(duree)}
    aria-valuenow={Math.round(affiche)} aria-valuetext="{formaterDuree(affiche)} sur {formaterDuree(duree)}" data-test="barre-temps"
    onpointerdown={bas} onpointermove={deplace} onpointerup={haut} onpointercancel={() => (glisse = null)} onkeydown={clavier}
  >
    <div class="rail">
      <div class="tampon" style:width="{pct(tampon)}%"></div>
      <div class="lu" style:width="{pct(affiche)}%"></div>
      <div class="poignee" style:left="{pct(affiche)}%"></div>
    </div>
  </div>
  <span class="t">{formaterTemps(duree)}</span>
</div>

<style>
  .ligne { display: flex; align-items: center; gap: 12px; color: #fff; }
  .t { font-variant-numeric: tabular-nums; font-size: 13px; min-width: 3.2em; text-align: center; }
  .zone { flex: 1; height: 32px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
  .rail { position: relative; width: 100%; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.22); transition: height 120ms; }
  .zone:hover .rail, .zone:focus-visible .rail { height: 10px; }
  .tampon, .lu { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; }
  .tampon { background: rgba(255, 255, 255, 0.28); }
  .lu { background: var(--lampe, #ffb347); }
  .poignee { position: absolute; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: var(--lampe-vive, #ffc873); box-shadow: 0 0 0 5px rgba(255, 179, 71, 0.25); }
</style>
