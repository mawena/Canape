<script lang="ts">
  /**
   * <Lueur couleur="#3b82f6" intensite={0.4} />  (dans un parent `position: relative; isolation: isolate`)
   * « La lueur » : halo flou décoratif (`aria-hidden`) qui dépose la couleur du film derrière un élément.
   * `couleur` : `#rrggbb` (repli : lampe). `intensite` : 0 à 1. `position` : où se pose le halo (`gauche` | `centre` | `haut-droite`).
   * Jamais de texte posé dessus sans fond opaque.
   */
  interface Props {
    couleur?: string | null;
    intensite?: number;
    position?: 'gauche' | 'centre' | 'haut-droite';
  }
  let { couleur = null, intensite = 0.35, position = 'gauche' }: Props = $props();
  const c = $derived(couleur && /^#[0-9a-f]{6}$/i.test(couleur) ? couleur : '#3b82f6');
</script>

<span class="lueur {position}" style:--c={c} style:--i={intensite} aria-hidden="true"></span>

<style>
  .lueur {
    position: absolute; inset: -40%; z-index: -1; pointer-events: none; filter: blur(30px);
    background: radial-gradient(40% 40% at var(--x) var(--y), color-mix(in srgb, var(--c) calc(var(--i) * 100%), transparent), transparent 70%);
  }
  .gauche { --x: 18%; --y: 50%; }
  .centre { --x: 50%; --y: 50%; }
  .haut-droite { --x: 85%; --y: 10%; }
</style>
