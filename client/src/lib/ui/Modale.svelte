<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icone from './Icone.svelte';

  interface Props {
    ouverte: boolean;
    titre: string;
    surFermer?: () => void;
    children?: Snippet;
    pied?: Snippet;
  }
  let { ouverte = $bindable(), titre, surFermer, children, pied }: Props = $props();
  let dialogue: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialogue) return;
    if (ouverte && !dialogue.open) dialogue.showModal();
    else if (!ouverte && dialogue.open) dialogue.close();
  });

  function fermer(): void {
    ouverte = false;
    surFermer?.();
  }
</script>

<!-- Le <dialog> natif gère le focus, Échap et l'inertie du reste de la page. -->
<dialog
  bind:this={dialogue}
  aria-labelledby="titre-modale"
  onclose={fermer}
  onclick={(e) => { if (e.target === dialogue) fermer(); }}
>
  <header>
    <h2 id="titre-modale">{titre}</h2>
    <button class="x" type="button" aria-label="Fermer" onclick={fermer}><Icone nom="fermer" /></button>
  </header>
  <div class="corps">{@render children?.()}</div>
  {#if pied}<footer>{@render pied()}</footer>{/if}
</dialog>

<style>
  dialog {
    background: var(--fond-2); color: var(--creme); border: 1px solid rgba(233, 184, 114, 0.35);
    border-radius: var(--rayon-l); padding: 0; width: min(520px, calc(100vw - 32px)); box-shadow: var(--ombre);
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.7); }
  header { display: flex; justify-content: space-between; align-items: center; padding: var(--espace-4) var(--espace-5); }
  h2 { font-size: 1.3rem; }
  .x { background: none; border: 0; color: var(--doux); padding: 4px; border-radius: var(--rayon-s); display: grid; }
  .x:hover { color: var(--creme); background: var(--fond-3); }
  .corps { padding: 0 var(--espace-5) var(--espace-4); display: grid; gap: var(--espace-3); }
  footer { display: flex; justify-content: flex-end; gap: var(--espace-3); padding: var(--espace-4) var(--espace-5); border-top: 1px solid var(--bordure); }
</style>
