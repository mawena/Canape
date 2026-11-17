<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import { session } from '$lib/comptes/session.svelte.ts';
  import { Carte, Chargement } from '$lib/ui/index.ts';

  let { children }: { children: Snippet } = $props();

  const sections = [
    { href: '/admin', texte: 'Tableau de bord' },
    { href: '/admin/utilisateurs', texte: 'Comptes' },
    { href: '/admin/invitations', texte: 'Invitations' },
    { href: '/admin/stockage', texte: 'Espace disque' },
    { href: '/admin/lecture', texte: 'Conversions' },
    { href: '/admin/reglages', texte: 'Réglages' },
  ];

  $effect(() => {
    session.charger().then(() => {
      if (!session.utilisateur) void goto(`/connexion?retour=${encodeURIComponent(page.url.pathname)}`, { replaceState: true });
    }, () => undefined);
  });
</script>

{#if !session.charge}
  <Chargement />
{:else if !session.utilisateur}
  <Chargement texte="Redirection…" />
{:else if !session.estAdmin}
  <main class="refus">
    <Carte titre="Cette partie est réservée aux administrateurs.">
      <p><a href="/">Retour à l'accueil</a></p>
    </Carte>
  </main>
{:else}
  <div class="admin">
    <nav aria-label="Administration">
      {#each sections as s (s.href)}
        <a href={s.href} aria-current={page.url.pathname === s.href ? 'page' : undefined}>{s.texte}</a>
      {/each}
    </nav>
    <main>{@render children()}</main>
  </div>
{/if}

<style>
  .admin { max-width: 960px; margin: 0 auto; display: grid; gap: var(--e-5); }
  nav { display: flex; gap: var(--e-6); max-width: 100%; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--bord); }
  nav::-webkit-scrollbar { display: none; }
  nav a { display: inline-flex; align-items: center; min-height: 44px; color: var(--doux); text-decoration: none; padding: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; font: 650 12.5px/1 var(--texte-police); letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; }
  nav a:hover:not([aria-current='page']) { color: var(--texte); }
  nav a[aria-current='page'] { color: var(--texte); border-bottom-color: var(--lampe); }
  main { display: grid; gap: var(--e-5); align-content: start; }
  .refus { max-width: 480px; margin: var(--e-8) auto; padding: 0 var(--e-4); }
</style>
