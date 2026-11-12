<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icone, { type NomIcone } from './Icone.svelte';

  interface Props {
    titre: string;
    texte?: string;
    icone?: NomIcone;
    actions?: Snippet;
  }
  let { titre, texte, icone = 'film', actions }: Props = $props();
</script>

<div class="vide">
  <span class="pastille"><Icone nom={icone} taille={32} /></span>
  <h3>{titre}</h3>
  {#if texte}<p>{texte}</p>{/if}
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
  .vide { display: grid; justify-items: center; gap: var(--espace-3); text-align: center; padding: var(--espace-6) var(--espace-4); color: var(--doux); }
  .pastille { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: var(--fond-3); color: var(--or); }
  h3 { color: var(--creme); font-size: 1.25rem; }
  p { margin: 0; max-width: 40ch; }
  .actions { display: flex; gap: var(--espace-3); flex-wrap: wrap; justify-content: center; }
</style>
