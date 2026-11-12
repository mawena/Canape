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
  .admin { max-width: 960px; margin: 0 auto; padding: var(--espace-4); display: grid; gap: var(--espace-4); }
  nav { display: flex; flex-wrap: wrap; gap: var(--espace-3); border-bottom: 1px solid var(--bordure); padding-bottom: var(--espace-3); }
  nav a { color: var(--doux); text-decoration: none; padding: var(--espace-1) var(--espace-2); border-radius: var(--rayon-m, 8px); }
  nav a[aria-current='page'] { color: var(--or); }
  main { display: grid; gap: var(--espace-4); align-content: start; }
  .refus { max-width: 480px; margin: var(--espace-6) auto; padding: 0 var(--espace-4); }
</style>
