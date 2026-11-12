<script lang="ts">
  interface Props {
    prenom: string;
    couleur?: string | null;
    taille?: number;
  }
  let { prenom, couleur = null, taille = 36 }: Props = $props();
  const initiale = $derived((prenom.trim()[0] ?? '?').toUpperCase());
</script>

<span
  class="avatar"
  style:--t="{taille}px"
  style:background={couleur ?? 'var(--velours-vif)'}
  role="img"
  aria-label={prenom}
>{initiale}</span>

<style>
  .avatar {
    display: inline-grid; place-items: center; flex: none; width: var(--t); height: var(--t); border-radius: 50%;
    color: #fff; font-weight: 700; font-size: calc(var(--t) * 0.42); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(233, 184, 114, 0.4);
  }
</style>
