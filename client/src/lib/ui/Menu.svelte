<script lang="ts">
  /**
   * <Menu libelle="Mon compte" elements={[{ libelle: 'Mon compte', icone: 'utilisateur', href: '/compte' }, { libelle: 'Se déconnecter', icone: 'deconnexion', surClic: …, danger: true, separateurAvant: true }]}>
   *   {#snippet declencheur()}<Avatar …/>{/snippet}
   * </Menu>
   * Bouton + menu déroulant (`role="menu"`) : flèches ↑↓, Début/Fin, première lettre, `Échap` (rend le focus), clic extérieur.
   * Lignes de 44 px, fond `--s2`, rayon 14. Sans `declencheur`, le bouton est rond avec « ⋯ ».
   * - `libelle` : nom accessible du bouton et du menu. - `alignement` : `fin` (défaut, aligné à droite) ou `debut`.
   * - `variante` : `rond` (défaut) · `libre` (pas de style : le snippet fait le bouton) · `secondaire`.
   * - Élément : `{ libelle, icone?, href?, surClic?, danger?, separateurAvant?, desactive? }`. Action destructive : `danger`.
   */
  import type { Snippet } from 'svelte';
  import Icone, { type NomIcone } from './Icone.svelte';
  import type { ElementMenu } from './types.ts';
  interface Props {
    libelle: string;
    elements: ElementMenu[];
    alignement?: 'debut' | 'fin';
    variante?: 'rond' | 'libre' | 'secondaire';
    haut?: boolean;
    declencheur?: Snippet;
  }
  let { libelle, elements, alignement = 'fin', variante = 'rond', haut = false, declencheur }: Props = $props();

  let ouvert = $state(false);
  let racine: HTMLElement | undefined = $state();
  let bouton: HTMLButtonElement | undefined = $state();
  let pop: HTMLElement | undefined = $state();

  function items(): HTMLElement[] {
    return pop ? [...pop.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')] : [];
  }
  function ouvrir(): void { ouvert = true; }
  function fermer(rendreFocus = false): void {
    ouvert = false;
    if (rendreFocus) bouton?.focus();
  }
  $effect(() => {
    if (ouvert) queueMicrotask(() => items()[0]?.focus());
  });
  function toucheBouton(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ouvrir(); }
  }
  function touchePop(e: KeyboardEvent): void {
    const liste = items();
    const i = liste.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); fermer(true); }
    else if (e.key === 'Tab') fermer();
    else if (e.key === 'ArrowDown') { e.preventDefault(); liste[(i + 1) % liste.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); liste[(i - 1 + liste.length) % liste.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); liste[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); liste[liste.length - 1]?.focus(); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const lettre = e.key.toLowerCase();
      const ordre = [...liste.slice(i + 1), ...liste.slice(0, i + 1)];
      ordre.find((el) => el.textContent?.trim().toLowerCase().startsWith(lettre))?.focus();
    }
  }
  function choisir(el: ElementMenu): void {
    if (el.desactive) return;
    fermer(!el.href);
    el.surClic?.();
  }
</script>

<svelte:window onpointerdown={(e) => { if (ouvert && racine && !racine.contains(e.target as Node)) fermer(); }} />

<div class="menu" bind:this={racine}>
  <button
    bind:this={bouton} type="button" class="declencheur {variante}" aria-haspopup="menu" aria-expanded={ouvert}
    aria-label={libelle} onclick={() => (ouvert ? fermer() : ouvrir())} onkeydown={toucheBouton}
  >
    {#if declencheur}{@render declencheur()}{:else}<Icone nom="menu-points" />{/if}
  </button>
  {#if ouvert}
    <div bind:this={pop} class="pop {alignement}" class:haut role="menu" aria-label={libelle} tabindex="-1" onkeydown={touchePop}>
      {#each elements as el, i (i)}
        {#if el.separateurAvant}<hr role="separator" />{/if}
        {#if el.href}
          <a role="menuitem" href={el.href} tabindex="-1" class:danger={el.danger} onclick={() => choisir(el)}>
            {#if el.icone}<Icone nom={el.icone} />{/if}{el.libelle}
          </a>
        {:else}
          <button type="button" role="menuitem" tabindex="-1" class:danger={el.danger} aria-disabled={el.desactive || undefined} onclick={() => choisir(el)}>
            {#if el.icone}<Icone nom={el.icone} />{/if}{el.libelle}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu { position: relative; display: inline-flex; }
  .declencheur { display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--doux); padding: 0; }
  .rond { width: 44px; height: 44px; border-radius: 50%; }
  .secondaire { min-height: 44px; padding: 0 18px; gap: 8px; border-radius: var(--r-pill); background: var(--s2); border: 1px solid var(--bord-champ); color: var(--texte); font: 600 15px/20px var(--texte-police); }
  .libre { border-radius: 50%; }
  @media (hover: hover) {
    .rond:hover { background: var(--s2); color: var(--texte); }
    .secondaire:hover { background: var(--s3); }
  }
  .pop {
    position: absolute; z-index: 60; top: calc(100% + 8px); min-width: 220px; padding: 6px;
    background: var(--s2); border: 1px solid var(--bord-champ); border-radius: var(--r-m); box-shadow: var(--ombre-2);
    animation: entree var(--d-2) var(--ease);
  }
  .pop.haut { top: auto; bottom: calc(100% + 8px); }
  .fin { right: 0; }
  .debut { left: 0; }
  .pop > :where(a, button) {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 12px; border: 0; border-radius: var(--r-s);
    background: transparent; color: var(--texte); font: 400 15px/20px var(--texte-police); text-align: left; text-decoration: none; cursor: pointer;
  }
  .pop > :where(a, button):hover, .pop > :where(a, button):focus-visible { background: var(--s3); }
  .pop > :where(a, button):focus-visible { outline-offset: -3px; }
  .pop > [aria-disabled='true'] { opacity: 0.45; cursor: not-allowed; }
  .danger { color: var(--mal) !important; }
  hr { border: 0; border-top: 1px solid var(--bord); margin: 6px 4px; }
  @keyframes entree { from { opacity: 0; transform: translateY(-4px); } }
</style>
