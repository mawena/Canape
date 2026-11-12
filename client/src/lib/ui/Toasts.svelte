<script lang="ts">
  /**
   * <Toasts /> : zone d'affichage des notifications, une seule fois dans le layout. On les déclenche avec `toast.ok(…)`,
   * `toast.info(…)`, `toast.erreur(…)` (voir toasts.svelte.ts). Pile de 3 au plus, en bas au centre (au-dessus de la
   * barre d'onglets sur téléphone) ; `role="status"` (`alert` pour une erreur).
   */
  import Icone from './Icone.svelte';
  import { retirerToast, toasts } from './toasts.svelte.ts';
</script>

<div class="zone">
  {#each toasts.liste as t (t.id)}
    <div class="toast {t.type}" role={t.type === 'erreur' ? 'alert' : 'status'}>
      <span class="ic"><Icone nom={t.type === 'ok' ? 'verifier' : t.type === 'erreur' ? 'alerte' : 'info'} taille={16} /></span>
      <span class="texte">{t.texte}</span>
      {#if t.action}
        {@const a = t.action}
        <button type="button" class="action" onclick={() => { a.surClic(); retirerToast(t.id); }}>{a.libelle}</button>
      {/if}
      <button type="button" class="x" aria-label="Fermer la notification" onclick={() => retirerToast(t.id)}><Icone nom="fermer" taille={16} /></button>
    </div>
  {/each}
</div>

<style>
  .zone {
    position: fixed; z-index: 1000; left: 50%; transform: translateX(-50%);
    bottom: calc(var(--e-5) + env(safe-area-inset-bottom)); display: grid; justify-items: center; gap: var(--e-2);
    width: min(520px, calc(100vw - 32px)); pointer-events: none;
  }
  @media (max-width: 640px) { :global(body.avec-onglets) .zone { bottom: calc(var(--barre-onglets) + var(--e-4) + env(safe-area-inset-bottom)); } }
  .toast {
    display: flex; align-items: center; gap: 12px; width: fit-content; max-width: 100%; pointer-events: auto;
    background: var(--s3); border: 1px solid var(--bord-vif); border-radius: 16px;
    padding: 8px 8px 8px 10px; font-size: 15px; box-shadow: var(--ombre-3); animation: entree var(--d-2) var(--ease);
  }
  .ic { display: grid; place-items: center; width: 28px; height: 28px; flex: none; border-radius: 50%; background: var(--lampe-fond); color: var(--lampe); }
  .ok .ic { background: var(--ok-fond); color: var(--ok); }
  .erreur .ic { background: var(--mal-fond); color: var(--mal); }
  .texte { flex: 1; min-width: 0; padding: 0 2px; }
  .action { background: transparent; border: 0; color: var(--lampe); font-weight: 600; font-size: 14px; min-height: 36px; padding: 0 12px; border-radius: var(--r-pill); }
  @media (hover: hover) { .action:hover { background: var(--lampe-fond); } }
  .x { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border: 0; border-radius: 50%; background: transparent; color: var(--doux); }
  @media (hover: hover) { .x:hover { background: rgba(255, 255, 255, 0.08); color: var(--texte); } }
  @keyframes entree { from { opacity: 0; transform: translateY(10px); } }
</style>
