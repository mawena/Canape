<script lang="ts">
  /**
   * <Avatar prenom="Awa" couleur="#ff8fb4" taille={36} present />
   * Rond avec l'initiale sur la couleur de présence (texte #16101c, contour `--fond` pour se chevaucher).
   * - `couleur` : `#rrggbb` ; repli : lampe. - `taille` : 24 (chat), 36 (défaut), 56 (profil).
   * - `present` : pastille verte « est dans la salle ». - `decoratif` : masque l'avatar aux lecteurs d'écran
   *   (quand le prénom est déjà écrit à côté).
   */
  interface Props {
    prenom: string;
    couleur?: string | null;
    taille?: number;
    present?: boolean;
    decoratif?: boolean;
  }
  let { prenom, couleur = null, taille = 36, present = false, decoratif = false }: Props = $props();
  const initiale = $derived((prenom.trim()[0] ?? '?').toUpperCase());
</script>

<span
  class="avatar"
  class:present
  style:--t="{taille}px"
  style:--c={couleur ?? 'var(--lampe)'}
  role={decoratif ? undefined : 'img'}
  aria-label={decoratif ? undefined : present ? `${prenom}, dans la salle` : prenom}
  aria-hidden={decoratif ? 'true' : undefined}
>{initiale}</span>

<style>
  .avatar {
    position: relative; display: inline-grid; place-items: center; flex: none;
    width: var(--t); height: var(--t); border-radius: 50%; background: var(--c); color: var(--sur-presence);
    font: 600 calc(var(--t) * 0.4) / 1 var(--texte-police); border: 2px solid var(--fond);
  }
  .present::after {
    content: ''; position: absolute; right: -2px; bottom: -2px; width: max(10px, calc(var(--t) / 3)); height: max(10px, calc(var(--t) / 3));
    border-radius: 50%; background: var(--ok); border: 2px solid var(--fond);
  }
</style>
