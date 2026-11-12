<script lang="ts">
  /**
   * <Curseur bind:valeur libelle="Film" min={0} max={1} pas={0.01} icone="volume" afficherValeur />
   * Curseur (volume…) : piste 6 px, poignée de 20 px (zone de 44 px), flèches du clavier. `libelle` obligatoire
   * (nom accessible, affiché si `libelleVisible`). `formater` : texte annoncé / affiché (ex. « 80 % »).
   */
  import Icone, { type NomIcone } from './Icone.svelte';

  interface Props {
    valeur?: number;
    libelle: string;
    min?: number;
    max?: number;
    pas?: number;
    icone?: NomIcone;
    libelleVisible?: boolean;
    afficherValeur?: boolean;
    formater?: (v: number) => string;
    disabled?: boolean;
    surChangement?: (v: number) => void;
  }
  let {
    valeur = $bindable(0), libelle, min = 0, max = 1, pas = 0.01, icone, libelleVisible = false, afficherValeur = false,
    formater = (v: number) => `${Math.round(((v - min) / (max - min)) * 100)} %`, disabled = false, surChangement,
  }: Props = $props();
  const pct = $derived(((valeur - min) / (max - min)) * 100);
</script>

<label class="curseur">
  {#if icone}<Icone nom={icone} taille={20} />{/if}
  <span class:vh={!libelleVisible} class="lib">{libelle}</span>
  <input
    type="range" {min} {max} step={pas} bind:value={valeur} {disabled}
    aria-valuetext={formater(valeur)} style:--p="{pct}%"
    oninput={() => surChangement?.(valeur)}
  />
  {#if afficherValeur}<output class="tn">{formater(valeur)}</output>{/if}
</label>

<style>
  .curseur { display: flex; align-items: center; gap: 10px; min-height: 44px; color: var(--doux); }
  .lib { font-size: 14px; }
  output { min-width: 3.5ch; text-align: right; font-size: 14px; }
  input {
    flex: 1; min-width: 80px; height: 44px; margin: 0; background: transparent; appearance: none; cursor: pointer;
  }
  input:disabled { opacity: 0.45; cursor: not-allowed; }
  input::-webkit-slider-runnable-track {
    height: 6px; border-radius: 999px; background: linear-gradient(90deg, var(--lampe) var(--p), var(--s3) var(--p));
  }
  input::-moz-range-track { height: 6px; border-radius: 999px; background: var(--s3); }
  input::-moz-range-progress { height: 6px; border-radius: 999px; background: var(--lampe); }
  input::-webkit-slider-thumb {
    appearance: none; width: 20px; height: 20px; margin-top: -7px; border-radius: 50%; border: 0;
    background: var(--lampe-vive); box-shadow: 0 0 0 5px var(--lampe-fond);
  }
  input::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; border: 0; background: var(--lampe-vive); box-shadow: 0 0 0 5px var(--lampe-fond); }
  input:focus-visible { outline: 3px solid var(--lampe-vive); outline-offset: 0; border-radius: 999px; }
</style>
