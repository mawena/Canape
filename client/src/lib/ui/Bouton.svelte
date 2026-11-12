<script lang="ts">
  /**
   * <Bouton variante="primaire" taille="m" icone="plus" chargement={false} href="/x" rond confirme>Texte</Bouton>
   * - `variante` : `primaire` (lampe, une seule par écran) · `secondaire` · `discret` · `danger`.
   * - `taille` : `s` (36 px) · `m` (44 px, défaut) · `l` (56 px, « gros » : Entrer dans la salle).
   * - `icone` : nom d'icône (à gauche du texte). `rond` : bouton rond d'icône seule (44 px) : passer `aria-label`.
   * - `chargement` : anneau 18 px, bouton inactif, `aria-busy`.
   * - `href` : le bouton devient un lien. `confirme` (danger) : fond plein rouge, pour la confirmation.
   * Reste : attributs natifs de `<button>` (`onclick`, `disabled`, `type`…).
   */
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icone, { type NomIcone } from './Icone.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'children'> {
    variante?: 'primaire' | 'secondaire' | 'discret' | 'danger';
    taille?: 's' | 'm' | 'l';
    icone?: NomIcone;
    chargement?: boolean;
    rond?: boolean;
    confirme?: boolean;
    /** Si renseigné, le bouton est un lien. */
    href?: string;
    children?: Snippet;
  }
  let {
    variante = 'primaire', taille = 'm', icone, chargement = false, rond = false, confirme = false, href, children,
    type = 'button', disabled, class: classe = '', ...reste
  }: Props = $props();
  const tIcone = $derived(taille === 's' ? 16 : 20);
</script>

{#if href}
  <a {href} class="bouton {variante} {taille} {classe}" class:rond class:confirme aria-disabled={disabled || undefined} {...reste as object}>
    {#if icone}<Icone nom={icone} taille={tIcone} />{/if}
    {@render children?.()}
  </a>
{:else}
  <button {type} class="bouton {variante} {taille} {classe}" class:rond class:confirme disabled={disabled || chargement} aria-busy={chargement || undefined} {...reste}>
    {#if chargement}<span class="anneau" aria-hidden="true"></span>{:else if icone}<Icone nom={icone} taille={tIcone} />{/if}
    {@render children?.()}
  </button>
{/if}

<style>
  .bouton {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 44px; padding: 0 20px; border: 1px solid transparent; border-radius: var(--r-m);
    font: 650 15px/20px var(--texte-police); text-decoration: none; white-space: nowrap; user-select: none;
    transition: background var(--d-1) var(--ease), transform var(--d-1) var(--ease), border-color var(--d-1) var(--ease), color var(--d-1) var(--ease);
  }
  .bouton:active:not(:disabled):not([aria-disabled='true']) { transform: scale(0.97); }
  .bouton:disabled, .bouton[aria-disabled='true'] { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
  .bouton[aria-disabled='true'] { pointer-events: none; }
  .s { min-height: 36px; padding: 0 14px; font-size: 14px; border-radius: 10px; }
  .l { min-height: 56px; padding: 0 28px; font-size: 16.5px; border-radius: 16px; }
  .rond { width: 44px; padding: 0; border-radius: 50%; }
  .rond.s { width: 36px; }
  .rond.l { width: 56px; }

  .primaire { background: var(--lampe-degrade); color: var(--lampe-sur); box-shadow: var(--halo-lampe), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
  .secondaire { background: var(--s2); border-color: var(--bord-champ); color: var(--texte); box-shadow: inset 0 1px 0 var(--reflet); }
  .discret { background: transparent; color: var(--doux); }
  .danger { background: transparent; border-color: var(--mal); color: var(--mal); }
  .danger.confirme { background: var(--mal); color: var(--mal-sur); }
  @media (hover: hover) {
    .primaire:hover:not(:disabled) { background: var(--lampe-vive); filter: brightness(1.04); box-shadow: var(--halo-lampe-fort), inset 0 1px 0 rgba(255, 255, 255, 0.35); }
    .secondaire:hover:not(:disabled) { background: var(--s3); }
    .discret:hover:not(:disabled) { background: var(--s2); color: var(--texte); }
    .danger:hover:not(:disabled) { background: var(--mal-fond); }
    .danger.confirme:hover:not(:disabled) { background: var(--mal); filter: brightness(1.08); }
  }
  .anneau {
    width: 18px; height: 18px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent;
    animation: tour 0.8s linear infinite;
  }
  @keyframes tour { to { transform: rotate(360deg); } }
</style>
