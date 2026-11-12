<script lang="ts">
  interface Props {
    texte?: string;
  }
  let { texte = 'Chargement…' }: Props = $props();
</script>

<div class="chargement" role="status">
  <span class="rond" aria-hidden="true"></span>
  <span>{texte}</span>
</div>

<style>
  .chargement { display: flex; align-items: center; justify-content: center; gap: var(--espace-3); padding: var(--espace-5); color: var(--doux); }
  .rond { width: 20px; height: 20px; border: 2px solid var(--or-doux); border-right-color: transparent; border-radius: 50%; animation: tour 0.8s linear infinite; }
  @keyframes tour { to { transform: rotate(360deg); } }
</style>
