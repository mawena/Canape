<script lang="ts">
  // Réactions qui flottent : montent de 220 px en 4,5 s ; en mouvement réduit, une ligne statique pendant 2 s.
  import { EMOJIS } from '@canape/partage';
  import type { Salle } from './salle.svelte.ts';
  import { DUREE_REACTION } from './reactions.ts';

  let { salle }: { salle: Salle } = $props();
  const dernieres = $derived(salle.reactions.filter((r) => Date.now() - r.creeeA < 2000).slice(-3));
  void EMOJIS;
</script>

<div class="zone" aria-hidden="true">
  {#each salle.reactions as r (r.id)}
    <span class="emoji" class:soi={r.soi} style:left="{r.depart}%" style:--derive="{r.derive}px" style:--duree="{DUREE_REACTION}ms" data-test="reaction">{r.emoji}</span>
  {/each}
</div>
<div class="statique" aria-hidden="true">
  {#each dernieres as r (r.id)}<span>{salle.personnes.find((p) => p.cid === r.cid)?.utilisateur.prenom ?? ''} : {r.emoji}</span>{/each}
</div>
<p class="vh" role="status" aria-live="polite">{salle.annonceReaction}</p>

<style>
  .zone { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 3; }
  .emoji { position: absolute; bottom: 90px; font-size: 38px; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5)); animation: monte var(--duree) ease-out forwards; }
  .emoji.soi { font-size: 33px; opacity: 0.8; }
  @keyframes monte {
    0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
    3% { transform: translate(0, -6px) scale(1); opacity: 1; }
    70% { opacity: 1; }
    100% { transform: translate(var(--derive), -220px) scale(1); opacity: 0; }
  }
  .statique { display: none; }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @media (prefers-reduced-motion: reduce) {
    .zone { display: none; }
    .statique { display: flex; gap: 8px; position: absolute; left: 16px; bottom: 120px; z-index: 3; color: #fff; font-size: 14px; }
  }
  @media (max-width: 640px) { .emoji { font-size: 28px; } .emoji.soi { font-size: 25px; } }
</style>
