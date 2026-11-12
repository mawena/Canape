<script lang="ts">
  /**
   * <Champ libelle="Identifiant" bind:value aide="…" erreur="…" type="password" />
   * Hauteur 48 px, libellé au-dessus, aide dessous (`--discret`). Erreur : contour rouge + icône + texte,
   * `aria-invalid` et `aria-describedby`. `type="password"` ajoute le bouton « Afficher » (collage permis).
   * Reste : attributs natifs de `<input>` (`autocomplete`, `required`, `inputmode`…).
   */
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Icone from './Icone.svelte';

  interface Props extends Omit<HTMLInputAttributes, 'value'> {
    libelle: string;
    value?: string;
    aide?: string;
    erreur?: string | null;
  }
  let { libelle, value = $bindable(''), aide, erreur = null, id, type = 'text', class: classe = '', ...reste }: Props = $props();
  const idAuto = $props.id();
  const idChamp = $derived(id ?? `champ-${idAuto}`);
  let montre = $state(false);
  const estMotDePasse = $derived(type === 'password');
</script>

<div class="champ {classe}" class:err={!!erreur}>
  <label for={idChamp}>{libelle}</label>
  <div class="entree">
    <input
      id={idChamp}
      bind:value
      type={estMotDePasse && montre ? 'text' : type}
      class:avec-bouton={estMotDePasse}
      aria-invalid={erreur ? 'true' : undefined}
      aria-describedby={erreur || aide ? `${idChamp}-m` : undefined}
      {...reste}
    />
    {#if estMotDePasse}
      <button type="button" class="afficher" aria-pressed={montre} onclick={() => (montre = !montre)}>
        <Icone nom={montre ? 'oeil-barre' : 'oeil'} taille={16} />{montre ? 'Masquer' : 'Afficher'}
      </button>
    {/if}
  </div>
  {#if erreur}<p id="{idChamp}-m" class="msg erreur" role="alert"><Icone nom="alerte" taille={16} />{erreur}</p>
  {:else if aide}<p id="{idChamp}-m" class="msg aide">{aide}</p>{/if}
</div>

<style>
  .champ { display: grid; gap: 6px; min-width: 0; }
  label { font-size: 14px; font-weight: 600; color: var(--doux); }
  .entree { position: relative; display: flex; }
  input {
    width: 100%; min-height: 48px; padding: 0 16px; background: var(--s2); color: var(--texte);
    border: 1px solid var(--bord-champ); border-radius: var(--r-m); font-size: 16px; box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: border-color var(--d-1) var(--ease);
  }
  input::placeholder { color: var(--discret); }
  input:focus { outline: 3px solid var(--lampe-vive); outline-offset: 2px; border-color: var(--lampe); }
  input[aria-invalid='true'] { border-color: var(--mal); }
  input:disabled { opacity: 0.45; cursor: not-allowed; }
  .avec-bouton { padding-right: 112px; }
  .afficher {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; gap: 6px;
    min-height: 36px; padding: 0 12px; border: 0; border-radius: var(--r-pill); background: transparent; color: var(--doux); font-size: 14px; font-weight: 500;
  }
  @media (hover: hover) { .afficher:hover { background: var(--s3); color: var(--texte); } }
  .msg { display: flex; gap: 6px; align-items: flex-start; font-size: 14px; line-height: 20px; }
  .msg :global(svg) { margin-top: 2px; }
  .erreur { color: var(--mal); }
  .aide { color: var(--discret); }
</style>
