<script lang="ts">
  /**
   * Inviter quelqu'un dans une séance déjà prête ou en cours (hôte seulement : l'appelant décide de l'afficher).
   * Bouton + petit panneau (non modal : le film continue, rien n'est mis en pause). Le lien est demandé à l'ouverture.
   * Le panneau est un enfant du bouton : placé dans l'élément en plein écran, il reste visible en plein écran.
   * `data-test` : `inviter-seance` (bouton), `panneau-inviter`, `lien-seance`, `copier-lien-seance`, `partager-lien-seance`, `erreur-lien-seance`.
   */
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import Link from '@lucide/svelte/icons/link';
  import Check from '@lucide/svelte/icons/check';
  import Share2 from '@lucide/svelte/icons/share-2';
  import X from '@lucide/svelte/icons/x';
  import { tick } from 'svelte';
  import type { ReponseLienSeance, Seance } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { toast } from '$lib/ui/index.ts';
  import { texteDePartage } from './inviter.ts';

  interface Props {
    seanceId: string;
    seance: Pick<Seance, 'titre' | 'filmTitre' | 'prevueLe'> | null;
    ouvert?: boolean;
    /** `barre` : bouton rond de la barre de commandes (salle) ; `bouton` : bouton secondaire d'une page. */
    variante?: 'barre' | 'bouton';
  }
  let { seanceId, seance, ouvert = $bindable(false), variante = 'barre' }: Props = $props();

  let lien: string | null = $state(null);
  let chargement = $state(false);
  let erreur: string | null = $state(null);
  let copie = $state(false);
  let declencheur: HTMLButtonElement | undefined = $state();
  let champ: HTMLInputElement | undefined = $state();
  let etaitOuvert = false;
  let minuteCopie: ReturnType<typeof setTimeout> | null = null;
  const peutPartager = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function demanderLien(): Promise<void> {
    if (chargement) return;
    chargement = true;
    erreur = null;
    try {
      lien = (await api.post<ReponseLienSeance>(`/api/seances/${encodeURIComponent(seanceId)}/lien`)).lien;
    } catch (e) {
      erreur = e instanceof ErreurApi && e.statut === 403 ? 'Seul l’hôte de la séance peut inviter.'
        : e instanceof ErreurApi ? e.message : 'Impossible de récupérer le lien. Vérifie ta connexion et réessaie.';
    } finally {
      chargement = false;
    }
  }

  $effect(() => {
    if (ouvert && !etaitOuvert) {
      etaitOuvert = true;
      void demanderLien().then(() => tick()).then(() => champ?.focus());
    } else if (!ouvert && etaitOuvert) {
      etaitOuvert = false;
      declencheur?.focus();
    }
  });

  async function copier(): Promise<void> {
    if (!lien) return;
    try {
      await navigator.clipboard.writeText(lien);
      toast.ok('Lien copié.');
      copie = true;
      if (minuteCopie) clearTimeout(minuteCopie);
      minuteCopie = setTimeout(() => (copie = false), 2200);
    } catch {
      champ?.select();
      toast.erreur('Copie impossible : le lien est sélectionné, copie-le à la main.');
    }
  }
  async function partager(): Promise<void> {
    if (!lien || !seance) return;
    try { await navigator.share({ text: texteDePartage(seance, lien) }); } catch { /* annulé */ }
  }
  function fermer(): void { ouvert = false; }
  function clavier(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); }
  }
</script>

<div class="inviter" class:bouton={variante === 'bouton'}>
  <button bind:this={declencheur} type="button" class={variante === 'barre' ? 'rond' : 'secondaire'} class:actif={ouvert}
    onclick={() => (ouvert = !ouvert)} aria-expanded={ouvert} aria-haspopup="dialog" aria-label="Inviter quelqu’un" title="Inviter quelqu’un" data-test="inviter-seance">
    <UserPlus size={variante === 'barre' ? 22 : 20} aria-hidden="true" /><span class="libelle">Inviter</span>
  </button>

  {#if ouvert}
    <button type="button" class="voile" tabindex="-1" aria-hidden="true" onclick={fermer}></button>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="panneau" role="dialog" aria-label="Inviter quelqu’un" tabindex="-1" onkeydown={clavier} data-test="panneau-inviter">
      <span class="poignee" aria-hidden="true"></span>
      <header>
        <h2>Inviter quelqu’un</h2>
        <button type="button" class="x" onclick={fermer} aria-label="Fermer"><X size={18} aria-hidden="true" /></button>
      </header>

      {#if erreur}
        <p class="erreur" role="alert" data-test="erreur-lien-seance">{erreur}</p>
        <button type="button" class="action" onclick={demanderLien}>Réessayer</button>
      {:else}
        <input bind:this={champ} class="lien" readonly value={lien ?? (chargement ? 'Un instant…' : '')} aria-label="Lien de la séance" aria-busy={chargement}
          onfocus={(e) => e.currentTarget.select()} data-test="lien-seance" />
        <div class="actions">
          <button type="button" class="action primaire" onclick={copier} disabled={!lien} data-test="copier-lien-seance">
            {#if copie}<Check size={18} aria-hidden="true" /> Lien copié{:else}<Link size={18} aria-hidden="true" /> Copier le lien{/if}
          </button>
          {#if peutPartager}
            <button type="button" class="action" onclick={partager} disabled={!lien} data-test="partager-lien-seance"><Share2 size={18} aria-hidden="true" /> Partager…</button>
          {/if}
        </div>
        <p class="note">La personne arrive directement dans la salle, au bon moment du film.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .inviter { position: relative; display: inline-block; }
  button { color: inherit; font: inherit; }
  .rond, .secondaire { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; background: transparent; min-height: 44px; transition: background 120ms; }
  .inviter > button:first-child { position: relative; z-index: 32; }
  .rond { min-width: 44px; padding: 0 12px; border-radius: 999px; }
  .rond:hover { background: rgba(255, 255, 255, 0.12); }
  .rond.actif { background: var(--lampe-fond); color: var(--lampe, #1f5ce0); }
  .secondaire { padding: 0 18px; border-radius: var(--r-m, 12px); background: var(--s3); border: 1px solid var(--bord-vif); font-weight: 600; }
  .libelle { font-size: 14.5px; font-weight: 600; display: none; }
  .secondaire .libelle { display: inline; }
  @media (min-width: 1024px) { .libelle { display: inline; } }

  .voile { position: fixed; inset: 0; z-index: 30; border: 0; padding: 0; background: transparent; cursor: default; }
  .panneau {
    position: absolute; z-index: 31; bottom: calc(100% + 8px); right: 0; width: min(360px, calc(100vw - 24px)); display: grid; gap: 12px;
    padding: 16px 18px 18px; border-radius: 20px; background: var(--s2); color: var(--texte); border: 1px solid var(--bord-vif); box-shadow: var(--ombre-3);
    text-align: left; animation: entree 160ms var(--ease, ease-out);
  }
  .bouton .panneau { right: auto; left: 0; }
  .poignee { display: none; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  h2 { margin: 0; font: 700 1.125rem / 1.25 var(--texte-police); letter-spacing: -0.01em; }
  .x { display: grid; place-items: center; width: 44px; height: 44px; margin: -8px -10px -8px 0; border: 0; border-radius: 50%; background: none; color: var(--doux); }
  .x:hover { background: var(--s3); color: var(--texte); }
  .lien { width: 100%; box-sizing: border-box; min-height: 44px; padding: 0 12px; border-radius: var(--r-m, 12px); border: 1px solid var(--bord-champ); background: var(--s1); color: var(--texte); font: 0.9rem ui-monospace, 'SFMono-Regular', Menlo, monospace; text-overflow: ellipsis; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: var(--r-m, 12px); border: 1px solid var(--bord-vif); background: var(--s3); font-weight: 600; flex: 1 1 auto; }
  .action.primaire { background: var(--lampe); border-color: transparent; color: var(--lampe-sur, #fff); }
  .action:disabled { opacity: 0.5; cursor: not-allowed; }
  .note { margin: 0; font-size: 0.875rem; line-height: 1.45; color: var(--doux); }
  .erreur { margin: 0; color: var(--mal); font-size: 0.9rem; }
  :is(.rond, .secondaire, .x, .action, .lien):focus-visible { outline: 2px solid var(--lampe, #60a5fa); outline-offset: 2px; }
  @keyframes entree { from { opacity: 0; transform: translateY(6px); } }

  @media (max-width: 640px) {
    .voile { background: rgba(6, 5, 10, 0.55); }
    .panneau { position: fixed; left: 0; right: 0; bottom: 0; width: auto; border-radius: 22px 22px 0 0; border-bottom: 0; padding-bottom: calc(20px + env(safe-area-inset-bottom)); animation: monte 200ms var(--ease, ease-out); }
    .bouton .panneau { left: 0; }
    .poignee { display: block; width: 36px; height: 4px; border-radius: 2px; background: var(--bord-champ); margin: -6px auto 0; }
    .action { flex-basis: 100%; }
  }
  @keyframes monte { from { transform: translateY(100%); } }
  @media (prefers-reduced-motion: reduce) { .panneau { animation: none; } }
</style>
