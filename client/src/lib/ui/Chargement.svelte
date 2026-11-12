<script lang="ts">
  /**
   * <Chargement texte="Chargement…" />
   * Anneau de 46 px à contour lampe, pour une attente d'action (pas pour un contenu qui a une forme : voir
   * `Squelette`). Apparaît après 150 ms (pas de clignotement). `role="status"`.
   */
  interface Props { texte?: string }
  let { texte = 'Chargement…' }: Props = $props();
</script>

<div class="chargement" role="status">
  <span class="anneau" aria-hidden="true"></span>
  <span>{texte}</span>
</div>

<style>
  .chargement {
    display: grid; justify-items: center; gap: var(--e-3); padding: var(--e-7); color: var(--doux);
    opacity: 0; animation: apparait 0.01s linear 150ms forwards;
  }
  .anneau {
    width: 46px; height: 46px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.14);
    border-top-color: var(--lampe); animation: tour 1.1s linear infinite;
  }
  @keyframes tour { to { transform: rotate(360deg); } }
  @keyframes apparait { to { opacity: 1; } }
</style>
