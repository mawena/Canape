<script lang="ts">
  // Vignettes des caméras : flottantes dans un coin (déplaçables, aimantées) ou en rangée sous le film.
  import Vignette from './Vignette.svelte';
  import { coinLePlusProche, type Coin } from './prefs.ts';
  import type { Salle } from './salle.svelte.ts';

  interface Props {
    salle: Salle;
    avecNom: boolean;
    /** Écran étroit en portrait : rangée imposée. */
    imposerRangee: boolean;
    paysageTel: boolean;
    conteneur: HTMLElement | undefined;
  }
  let { salle, avecNom, imposerRangee, paysageTel, conteneur }: Props = $props();

  const rangee = $derived(imposerRangee || (salle.prefs.rangee ?? false));
  let glisse: { x: number; y: number; dx: number; dy: number } | null = $state(null);
  let boite: HTMLDivElement | undefined = $state();

  function bas(e: PointerEvent): void {
    if (rangee || e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, label')) return;
    const r = boite!.getBoundingClientRect();
    glisse = { x: r.left, y: r.top, dx: e.clientX - r.left, dy: e.clientY - r.top };
    boite!.setPointerCapture(e.pointerId);
  }
  function deplace(e: PointerEvent): void {
    if (!glisse || !conteneur) return;
    const c = conteneur.getBoundingClientRect();
    glisse = { ...glisse, x: e.clientX - glisse.dx - c.left, y: e.clientY - glisse.dy - c.top };
  }
  function haut(e: PointerEvent): void {
    if (!glisse || !conteneur || !boite) { glisse = null; return; }
    const c = conteneur.getBoundingClientRect();
    const b = boite.getBoundingClientRect();
    const coin: Coin = coinLePlusProche(e.clientX - c.left - glisse.dx + b.width / 2, e.clientY - c.top - glisse.dy + b.height / 2, c.width, c.height);
    glisse = null;
    salle.placerVignettes(coin);
  }

  function basculerRangee(): void {
    salle.prefs.rangee = !rangee;
    salle.prefs.vignettesMasquees = false;
    salle.sauverPrefs();
  }
  function masquer(): void {
    salle.prefs.vignettesMasquees = true;
    salle.sauverPrefs();
  }
  function grande(): void {
    salle.prefs.grandes = !salle.prefs.grandes;
    salle.sauverPrefs();
  }
  const visibles = $derived(paysageTel ? salle.personnes.filter((p) => p.parle || p.soi).slice(0, 2) : salle.personnes);
</script>

{#if salle.prefs.vignettesMasquees}
  <button type="button" class="reviennent" onclick={() => { salle.prefs.vignettesMasquees = false; salle.sauverPrefs(); }} data-test="afficher-cameras">Afficher les caméras</button>
{:else}
  <div
    bind:this={boite} class="vignettes {salle.prefs.coin}" class:rangee class:glisse={glisse !== null}
    style:left={glisse ? `${glisse.x}px` : undefined} style:top={glisse ? `${glisse.y}px` : undefined}
    style:right={glisse ? 'auto' : undefined} style:bottom={glisse ? 'auto' : undefined}
    data-test="vignettes" role="group" aria-label="Caméras"
    onpointerdown={bas} onpointermove={deplace} onpointerup={haut} onpointercancel={() => (glisse = null)}
  >
    {#each visibles as p (p.cid)}
      <Vignette
        personne={p} {avecNom} grande={salle.prefs.grandes} petite={paysageTel} enRangee={rangee}
        surPlacer={(c) => salle.placerVignettes(c)} surRangee={basculerRangee} surMasquer={masquer} surGrande={grande}
        surVolume={(v) => { p.volume = v; salle.appliquerVolumes(); }}
      />
    {/each}
  </div>
{/if}

<style>
  .vignettes { position: absolute; z-index: 4; display: flex; flex-direction: column; gap: 10px; touch-action: none; cursor: grab; }
  .vignettes.glisse { cursor: grabbing; transition: none; }
  .haut-gauche { top: 70px; left: 16px; }
  .haut-droite { top: 70px; right: 16px; }
  .bas-gauche { bottom: 130px; left: 16px; flex-direction: column-reverse; }
  .bas-droite { bottom: 130px; right: 16px; flex-direction: column-reverse; }
  .vignettes.rangee { position: static; flex-direction: row; justify-content: center; gap: 10px; padding: 8px 12px; overflow-x: auto; cursor: auto; }
  .reviennent { position: absolute; z-index: 4; top: 70px; right: 16px; border: 0; border-radius: 999px; padding: 6px 14px; background: rgba(13, 12, 18, 0.75); color: #fff; }
  @media (max-width: 1100px) { .vignettes { --largeur-vignette: 144px; } }
  @media (max-width: 640px) and (orientation: portrait) { .reviennent { position: static; margin: 6px auto; } }
</style>
