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
  nav { display: flex; gap: 2px; padding: 4px; max-width: 100%; overflow-x: auto; scrollbar-width: none; justify-self: start; background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-m); }
  nav::-webkit-scrollbar { display: none; }
  nav a { display: inline-flex; align-items: center; min-height: 40px; color: var(--doux); text-decoration: none; padding: 0 16px; border-radius: 9px; font-weight: 600; font-size: 14.5px; white-space: nowrap; }
  nav a:hover:not([aria-current='page']) { color: var(--texte); }
  nav a[aria-current='page'] { color: var(--texte); background: var(--s3); box-shadow: inset 0 1px 0 var(--reflet), 0 1px 3px rgba(0, 0, 0, 0.4); }
  main { display: grid; gap: var(--e-5); align-content: start; }
  .refus { max-width: 480px; margin: var(--e-8) auto; padding: 0 var(--e-4); }
</style>
