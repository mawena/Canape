<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icone, { type NomIcone } from './Icone.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'children'> {
    variante?: 'primaire' | 'secondaire' | 'discret' | 'danger';
    taille?: 's' | 'm' | 'l';
    icone?: NomIcone;
    chargement?: boolean;
    /** Si renseigné, le bouton est un lien. */
    href?: string;
    children?: Snippet;
  }
  let {
    variante = 'primaire', taille = 'm', icone, chargement = false, href, children,
    type = 'button', disabled, class: classe = '', ...reste
  }: Props = $props();
</script>

{#if href}
  <a {href} class="bouton {variante} {taille} {classe}" aria-disabled={disabled || undefined}>
    {#if icone}<Icone nom={icone} taille={taille === 's' ? 16 : 20} />{/if}
    {@render children?.()}
  </a>
{:else}
  <button {type} class="bouton {variante} {taille} {classe}" disabled={disabled || chargement} aria-busy={chargement} {...reste}>
    {#if chargement}<span class="rond" aria-hidden="true"></span>{:else if icone}<Icone nom={icone} taille={taille === 's' ? 16 : 20} />{/if}
    {@render children?.()}
  </button>
{/if}

<style>
  .bouton {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--espace-2);
    border: 1px solid transparent; border-radius: var(--rayon); font-weight: 600; text-decoration: none;
    transition: background var(--duree), border-color var(--duree), transform var(--duree);
    white-space: nowrap;
  }
  .bouton:active:not(:disabled) { transform: translateY(1px); }
  .bouton:disabled, .bouton[aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
  .s { padding: 5px 10px; font-size: 0.85rem; }
  .m { padding: 9px 16px; }
  .l { padding: 13px 22px; font-size: 1.05rem; }
  .primaire { background: linear-gradient(180deg, var(--or), var(--or-doux)); color: #2a1a08; }
  .primaire:hover { background: var(--or); }
  .secondaire { background: var(--fond-3); border-color: var(--bordure); color: var(--creme); }
  .secondaire:hover { border-color: var(--or-doux); }
  .discret { background: transparent; color: var(--doux); }
  .discret:hover { background: var(--fond-3); color: var(--creme); }
  .danger { background: var(--velours); border-color: var(--velours-vif); color: var(--creme); }
  .danger:hover { background: var(--velours-vif); }
  .rond {
    width: 1em; height: 1em; border: 2px solid currentColor; border-right-color: transparent;
    border-radius: 50%; animation: tour 0.8s linear infinite;
  }
  @keyframes tour { to { transform: rotate(360deg); } }
</style>
