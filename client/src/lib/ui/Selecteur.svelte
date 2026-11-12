<script lang="ts">
  /**
   * <Selecteur libelle="Trier par" bind:value options={[{ valeur: 'recents', libelle: 'Récents' }]} />
   * Liste déroulante native (accessible partout, clavier et mobile gérés par le système), habillée comme un champ.
   * `libelle` est au-dessus ; `libelleMasque` le cache visuellement mais le garde pour les lecteurs d'écran.
   */
  import Icone from './Icone.svelte';

  interface Option { valeur: string; libelle: string }
  interface Props {
    libelle: string;
    value?: string;
    options: Option[];
    aide?: string;
    libelleMasque?: boolean;
    disabled?: boolean;
    class?: string;
  }
  let { libelle, value = $bindable(''), options, aide, libelleMasque = false, disabled = false, class: classe = '' }: Props = $props();
  const idAuto = $props.id();
</script>

<div class="selecteur {classe}">
  <label for="sel-{idAuto}" class:vh={libelleMasque}>{libelle}</label>
  <div class="boite">
    <select id="sel-{idAuto}" bind:value {disabled} aria-describedby={aide ? `sel-${idAuto}-a` : undefined}>
      {#each options as o (o.valeur)}<option value={o.valeur}>{o.libelle}</option>{/each}
    </select>
    <Icone nom="chevron-bas" taille={18} class="fleche" />
  </div>
  {#if aide}<p id="sel-{idAuto}-a">{aide}</p>{/if}
</div>

<style>
  .selecteur { display: grid; gap: 6px; min-width: 0; }
  label { font-size: 14px; font-weight: 500; color: var(--doux); }
  .boite { position: relative; display: flex; align-items: center; }
  select {
    width: 100%; min-height: 48px; padding: 0 44px 0 16px; background: var(--s2); color: var(--texte);
    border: 1px solid var(--bord-champ); border-radius: var(--r-m); font-size: 16px; appearance: none; cursor: pointer;
  }
  select:focus { outline: 3px solid var(--lampe-vive); outline-offset: 2px; border-color: var(--lampe); }
  select:disabled { opacity: 0.45; cursor: not-allowed; }
  option { background: var(--s2); color: var(--texte); }
  .boite :global(.fleche) { position: absolute; right: 14px; color: var(--doux); pointer-events: none; }
  p { font-size: 14px; color: var(--discret); }
</style>
