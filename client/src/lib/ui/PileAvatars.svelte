<script lang="ts">
  /**
   * <PileAvatars personnes={[{ prenom, couleur?, present? }]} max={4} taille={36} />
   * Avatars qui se chevauchent (−10 px) ; au-delà de `max`, une pastille « +2 ». Annonce « Awa, Léa et 2 autres ».
   */
  import Avatar from './Avatar.svelte';

  interface Personne { prenom: string; couleur?: string | null; present?: boolean }
  interface Props { personnes: Personne[]; max?: number; taille?: number }
  let { personnes, max = 4, taille = 36 }: Props = $props();
  const visibles = $derived(personnes.slice(0, max));
  const reste = $derived(Math.max(0, personnes.length - max));
  const noms = $derived.by(() => {
    const p = personnes.map((x) => x.prenom);
    if (p.length <= 1) return p.join('');
    if (p.length <= max) return `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}`;
    return `${p.slice(0, max - 1).join(', ')} et ${p.length - (max - 1)} autres`;
  });
</script>

<span class="pile" role="img" aria-label={noms}>
  {#each visibles as p, i (i)}
    <Avatar prenom={p.prenom} couleur={p.couleur ?? `var(--presence-${(i % 6) + 1})`} present={p.present} {taille} decoratif />
  {/each}
  {#if reste > 0}<span class="plus" style:--t="{taille}px" aria-hidden="true">+{reste}</span>{/if}
</span>

<style>
  .pile { display: inline-flex; flex: none; }
  .pile > :global(* + *) { margin-left: -10px; }
  .plus {
    display: inline-grid; place-items: center; width: var(--t); height: var(--t); border-radius: 50%; background: var(--s3);
    color: var(--doux); font: 600 calc(var(--t) * 0.36) / 1 var(--texte-police); border: 2px solid var(--fond);
  }
</style>
