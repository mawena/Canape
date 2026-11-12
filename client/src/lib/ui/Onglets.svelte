<script lang="ts">
  /**
   * <Onglets libelle="Filtrer" elements={[{ id: 'tous', libelle: 'Tous', nombre: 12 }]} bind:valeur />
   * Onglets « pilule » (fond `--s1`, actif `--s3`, 36 px). Deux modes selon les éléments :
   * - sans `href` : `role="tablist"`, flèches ← →, `valeur` liable, `surChoix(id)` ;
   * - avec `href` : navigation (`<nav>` de liens), l'élément dont l'id vaut `valeur` porte `aria-current="page"`.
   * `defilant` : la rangée défile horizontalement (téléphone).
   */
  import Icone, { type NomIcone } from './Icone.svelte';

  interface Element { id: string; libelle: string; nombre?: number; href?: string; icone?: NomIcone }
  interface Props {
    elements: Element[];
    valeur?: string;
    libelle?: string;
    surChoix?: (id: string) => void;
  }
  let { elements, valeur = $bindable(''), libelle = 'Sections', surChoix }: Props = $props();
  const navigation = $derived(elements.some((e) => e.href));
  let boutons: HTMLButtonElement[] = $state([]);

  function choisir(id: string): void {
    valeur = id;
    surChoix?.(id);
  }
  function touche(e: KeyboardEvent, i: number): void {
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % elements.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + elements.length) % elements.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = elements.length - 1;
    else return;
    e.preventDefault();
    choisir(elements[n]!.id);
    boutons[n]?.focus();
  }
</script>

{#if navigation}
  <nav class="onglets" aria-label={libelle}>
    {#each elements as el (el.id)}
      <a href={el.href} class:actif={el.id === valeur} aria-current={el.id === valeur ? 'page' : undefined}>
        {#if el.icone}<Icone nom={el.icone} taille={16} />{/if}{el.libelle}
        {#if el.nombre !== undefined}<span class="nombre tn">{el.nombre}</span>{/if}
      </a>
    {/each}
  </nav>
{:else}
  <div class="onglets" role="tablist" aria-label={libelle}>
    {#each elements as el, i (el.id)}
      <button
        bind:this={boutons[i]} type="button" role="tab" class:actif={el.id === valeur}
        aria-selected={el.id === valeur} tabindex={el.id === valeur || (!valeur && i === 0) ? 0 : -1}
        onclick={() => choisir(el.id)} onkeydown={(e) => touche(e, i)}
      >
        {#if el.icone}<Icone nom={el.icone} taille={16} />{/if}{el.libelle}
        {#if el.nombre !== undefined}<span class="nombre tn">{el.nombre}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .onglets {
    display: inline-flex; gap: 2px; padding: 4px; max-width: 100%; overflow-x: auto; scrollbar-width: none;
    background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-pill);
  }
  .onglets::-webkit-scrollbar { display: none; }
  a, button {
    display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 16px; border: 0; border-radius: var(--r-pill);
    background: transparent; color: var(--doux); font: 500 14.5px/1 var(--texte-police); text-decoration: none; white-space: nowrap;
    transition: background var(--d-1) var(--ease), color var(--d-1) var(--ease);
  }
  .actif { background: var(--s3); color: var(--texte); }
  @media (hover: hover) { a:not(.actif):hover, button:not(.actif):hover { color: var(--texte); } }
  .nombre { color: var(--discret); font-size: 13px; }
  .actif .nombre { color: var(--doux); }
</style>
