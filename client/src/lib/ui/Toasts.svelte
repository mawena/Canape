<script lang="ts">
  import Icone from './Icone.svelte';
  import { retirerToast, toasts } from './toasts.svelte.ts';
</script>

<div class="zone" aria-live="polite">
  {#each toasts.liste as t (t.id)}
    <div class="toast {t.type}" role={t.type === 'erreur' ? 'alert' : 'status'}>
      <Icone nom={t.type === 'ok' ? 'verifier' : t.type === 'erreur' ? 'alerte' : 'info'} />
      <span>{t.texte}</span>
      <button type="button" aria-label="Fermer la notification" onclick={() => retirerToast(t.id)}><Icone nom="fermer" taille={16} /></button>
    </div>
  {/each}
</div>

<style>
  .zone {
    position: fixed; z-index: 1000; right: var(--espace-4); bottom: calc(var(--espace-4) + env(safe-area-inset-bottom));
    display: grid; gap: var(--espace-2); width: min(380px, calc(100vw - 32px));
  }
  .toast {
    display: flex; align-items: center; gap: var(--espace-3); padding: var(--espace-3) var(--espace-4);
    background: var(--fond-2); border: 1px solid var(--bordure); border-left-width: 4px; border-radius: var(--rayon);
    box-shadow: var(--ombre);
  }
  .toast span { flex: 1; }
  .ok { border-left-color: var(--ok); }
  .erreur { border-left-color: var(--mal); }
  .info { border-left-color: var(--or); }
  button { background: none; border: 0; color: var(--doux); display: grid; padding: 2px; }
</style>
