<script lang="ts">
  /**
   * <Modale bind:ouverte titre="Supprimer ce film ?" surFermer={() => …} dangereuse>
   *   texte…{#snippet pied()}<Bouton variante="discret">Garder</Bouton><Bouton variante="danger" confirme>Supprimer</Bouton>{/snippet}
   * </Modale>
   * `<dialog>` natif : piège de focus, `Échap`, inertie du reste de la page, retour du focus au déclencheur.
   * Fond `--s2`, rayon 22, 440 px au plus ; sur téléphone, feuille qui monte du bas avec poignée.
   * `dangereuse` : un clic sur le voile ne ferme pas (destruction). `large` : 640 px (création de séance…).
   */
  import type { Snippet } from 'svelte';
  import Icone from './Icone.svelte';

  interface Props {
    ouverte: boolean;
    titre: string;
    surFermer?: () => void;
    dangereuse?: boolean;
    large?: boolean;
    children?: Snippet;
    pied?: Snippet;
  }
  let { ouverte = $bindable(), titre, surFermer, dangereuse = false, large = false, children, pied }: Props = $props();
  let dialogue: HTMLDialogElement | undefined = $state();
  const idAuto = $props.id();

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

<dialog
  bind:this={dialogue}
  class:large
  aria-labelledby="titre-modale-{idAuto}"
  onclose={fermer}
  onclick={(e) => { if (e.target === dialogue && !dangereuse) fermer(); }}
>
  <span class="poignee" aria-hidden="true"></span>
  <header>
    <h2 id="titre-modale-{idAuto}">{titre}</h2>
    <button class="x" type="button" aria-label="Fermer" onclick={fermer}><Icone nom="fermer" /></button>
  </header>
  <div class="corps">{@render children?.()}</div>
  {#if pied}<footer>{@render pied()}</footer>{/if}
</dialog>

<style>
  dialog {
    background: var(--s2); color: var(--texte); border: 1px solid var(--bord-vif); border-radius: var(--r-xl);
    padding: var(--e-7) var(--e-7) var(--e-6); width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 48px);
    box-shadow: var(--ombre-4); overflow: auto; margin: auto;
  }
  dialog.large { width: min(640px, calc(100vw - 32px)); }
  dialog[open] { animation: entree var(--d-2) var(--ease); }
  dialog::backdrop { background: var(--voile); }
  .poignee { display: none; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--e-3); margin-bottom: var(--e-2); }
  h2 { font: 700 1.375rem / 1.25 var(--texte-police); letter-spacing: -0.02em; }
  .x { display: grid; place-items: center; width: 36px; height: 36px; margin: -4px -8px 0 0; background: none; border: 0; border-radius: 50%; color: var(--doux); flex: none; }
  @media (hover: hover) { .x:hover { color: var(--texte); background: var(--s3); } }
  .corps { display: grid; gap: var(--e-3); color: var(--doux); }
  footer { display: flex; justify-content: flex-end; gap: var(--e-3); margin-top: var(--e-5); flex-wrap: wrap; }
  @keyframes entree { from { opacity: 0; transform: translateY(8px) scale(0.98); } }

  @media (max-width: 640px) {
    dialog {
      width: 100%; max-width: 100%; margin: auto 0 0; border-radius: var(--r-xl) var(--r-xl) 0 0; border-bottom: 0;
      padding-bottom: calc(var(--e-6) + env(safe-area-inset-bottom));
    }
    dialog[open] { animation: monte var(--d-2) var(--ease); }
    .poignee { display: block; width: 36px; height: 4px; border-radius: 2px; background: var(--bord-champ); margin: -8px auto 14px; }
    footer { flex-direction: column-reverse; }
    footer :global(.bouton) { width: 100%; }
  }
  @keyframes monte { from { transform: translateY(100%); } }
</style>
