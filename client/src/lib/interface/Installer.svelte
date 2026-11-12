<script lang="ts">
  /**
   * Invitation à installer Canapé, proposée une fois, en discret, à partir de la deuxième visite (DESIGN.md §7.2).
   * Chrome/Edge/Android : bouton qui déclenche l'invite du navigateur. iOS (Safari) : mini-guide « Partager → Sur l'écran d'accueil ».
   * Rien ne s'affiche si l'appli est déjà installée ou si l'invitation a été refusée.
   */
  import { onMount } from 'svelte';
  import { Bouton, Icone } from '$lib/ui/index.ts';

  interface EvenementInstallation extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
  let invite: EvenementInstallation | null = $state(null);
  let ios = $state(false);
  let visible = $state(false);

  const lire = (cle: string): string | null => { try { return localStorage.getItem(cle); } catch { return null; } };
  const ecrire = (cle: string, valeur: string): void => { try { localStorage.setItem(cle, valeur); } catch { /* stockage indisponible */ } };

  onMount(() => {
    const installee = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const visites = Number(lire('canape.visites') ?? '0') + 1;
    ecrire('canape.visites', String(visites));
    if (installee || lire('canape.installation') === 'non' || visites < 2) return;
    ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    visible = ios;
    const surInvite = (e: Event) => { e.preventDefault(); invite = e as EvenementInstallation; visible = true; };
    window.addEventListener('beforeinstallprompt', surInvite);
    return () => window.removeEventListener('beforeinstallprompt', surInvite);
  });

  async function installer(): Promise<void> {
    if (!invite) return;
    await invite.prompt();
    const choix = await invite.userChoice;
    if (choix.outcome === 'accepted') ecrire('canape.installation', 'non');
    invite = null;
    visible = false;
  }
  function refuser(): void {
    ecrire('canape.installation', 'non');
    visible = false;
  }
</script>

{#if visible}
  <aside class="installer" aria-label="Installer Canapé">
    <span class="pastille"><Icone nom="telecharger" /></span>
    <div class="texte">
      <p class="titre">Installer Canapé sur cet appareil ?</p>
      {#if ios}<p class="aide">Touche « Partager », puis « Sur l’écran d’accueil ».</p>
      {:else}<p class="aide">Une icône sur l’écran d’accueil, et l’application s’ouvre en plein écran.</p>{/if}
    </div>
    {#if invite}<Bouton taille="s" onclick={installer}>Installer</Bouton>{/if}
    <Bouton taille="s" variante="discret" onclick={refuser}>Plus tard</Bouton>
  </aside>
{/if}

<style>
  .installer {
    display: flex; align-items: center; gap: var(--e-4); flex-wrap: wrap; padding: var(--e-4) var(--e-5);
    background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-l);
  }
  .pastille { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--lampe-fond); color: var(--lampe); flex: none; }
  .texte { flex: 1; min-width: 200px; }
  .titre { font-weight: 600; }
  .aide { color: var(--doux); font-size: 14px; line-height: 20px; }
</style>
