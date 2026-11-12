<script lang="ts">
  /**
   * <Interrupteur bind:coche libelle="Baisser le film quand quelqu'un parle" aide="…" />
   * `role="switch"`, cible de 44 px, libellé cliquable. `coche` est liable.
   */
  interface Props {
    coche?: boolean;
    libelle: string;
    aide?: string;
    disabled?: boolean;
    surChangement?: (coche: boolean) => void;
  }
  let { coche = $bindable(false), libelle, aide, disabled = false, surChangement }: Props = $props();
  const idAuto = $props.id();
  function basculer(): void {
    if (disabled) return;
    coche = !coche;
    surChangement?.(coche);
  }
</script>

<div class="ligne">
  <button
    type="button" role="switch" class="inter" aria-checked={coche} aria-labelledby="int-{idAuto}"
    aria-describedby={aide ? `int-${idAuto}-a` : undefined} {disabled} onclick={basculer}
  ><span class="piste"><span class="bouton-rond"></span></span></button>
  <span class="texte">
    <span id="int-{idAuto}" class="lib">{libelle}</span>
    {#if aide}<span id="int-{idAuto}-a" class="aide">{aide}</span>{/if}
  </span>
</div>

<style>
  .ligne { display: flex; align-items: center; gap: 14px; min-height: 44px; }
  .inter { display: grid; place-items: center; width: 56px; height: 44px; padding: 0; border: 0; background: transparent; flex: none; }
  .inter:disabled { opacity: 0.45; cursor: not-allowed; }
  .piste {
    position: relative; width: 48px; height: 28px; border-radius: var(--r-pill); background: var(--s3); border: 1px solid var(--bord-champ);
    transition: background var(--d-2) var(--ease), border-color var(--d-2) var(--ease);
  }
  .bouton-rond {
    position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--doux);
    transition: transform var(--d-2) var(--ease), background var(--d-2) var(--ease);
  }
  [aria-checked='true'] .piste { background: var(--lampe); border-color: var(--lampe); }
  [aria-checked='true'] .bouton-rond { transform: translateX(20px); background: var(--lampe-sur); }
  .texte { display: grid; gap: 2px; }
  .lib { font-weight: 500; }
  .aide { font-size: 14px; color: var(--discret); }
</style>
