<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLInputAttributes, 'value'> {
    libelle: string;
    value?: string;
    aide?: string;
    erreur?: string | null;
  }
  let { libelle, value = $bindable(''), aide, erreur = null, id, class: classe = '', ...reste }: Props = $props();
  const idAuto = $props.id();
  const idChamp = $derived(id ?? `champ-${idAuto}`);
</script>

<div class="champ {classe}">
  <label for={idChamp}>{libelle}</label>
  <input id={idChamp} bind:value aria-invalid={erreur ? 'true' : undefined} aria-describedby={erreur || aide ? `${idChamp}-m` : undefined} {...reste} />
  {#if erreur}<p id="{idChamp}-m" class="erreur" role="alert">{erreur}</p>
  {:else if aide}<p id="{idChamp}-m" class="aide">{aide}</p>{/if}
</div>

<style>
  .champ { display: grid; gap: 6px; }
  label { font-size: 0.85rem; color: var(--doux); }
  input {
    background: #0b0809; border: 1px solid var(--bordure); border-radius: 8px;
    padding: 11px 12px; color: var(--creme); font-size: 1rem; width: 100%;
  }
  input:focus { border-color: var(--or); outline: none; box-shadow: 0 0 0 3px rgba(233, 184, 114, 0.2); }
  input[aria-invalid='true'] { border-color: var(--mal); }
  p { margin: 0; font-size: 0.85rem; }
  .erreur { color: var(--mal); }
  .aide { color: var(--doux); }
</style>
