<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Avatar, Bouton, EtatVide, Icone, Logo, Menu, Modale, Toasts, toast, type ElementMenu, type NomIcone } from '$lib/ui/index.ts';
  import { estRouteLibre, estSalle, sectionActive } from '$lib/interface/routes.ts';
  import { session } from '$lib/interface/session.svelte.ts';
  import '$lib/ui/jetons.css';

  let { children }: { children: Snippet } = $props();

  const chemin = $derived(page.url.pathname);
  const libre = $derived(estRouteLibre(chemin));
  const salle = $derived(estSalle(chemin));
  const section = $derived(sectionActive(chemin));
  const connecte = $derived(session.utilisateur !== null);
  const avecNavigation = $derived(connecte && !libre && !salle);
  let erreurChargement = $state(false);
  let moiOuvert = $state(false);

  const ONGLETS: Array<{ id: NonNullable<typeof section>; libelle: string; court: string; href: string; icone: NomIcone }> = [
    { id: 'accueil', libelle: 'Ce soir', court: 'Ce soir', href: '/', icone: 'maison' },
    { id: 'films', libelle: 'Films', court: 'Films', href: '/galerie', icone: 'film' },
    { id: 'seances', libelle: 'Séances', court: 'Séances', href: '/seances', icone: 'calendrier' },
    { id: 'historique', libelle: 'Historique', court: 'Historique', href: '/historique', icone: 'historique' },
  ];

  const elementsCompte = $derived.by<ElementMenu[]>(() => {
    const liste: ElementMenu[] = [{ libelle: 'Mon compte', icone: 'utilisateur', href: '/compte' }];
    if (session.estAdmin) liste.push({ libelle: 'Administration', icone: 'reglages', href: '/admin' });
    liste.push({ libelle: 'Se déconnecter', icone: 'deconnexion', surClic: () => void session.deconnexion(), separateurAvant: true });
    return liste;
  });

  async function charger(): Promise<void> {
    erreurChargement = false;
    try { await session.charger(true); } catch { erreurChargement = true; }
  }

  onMount(() => {
    void charger();
    // Hors ligne : on le dit une fois, doucement.
    const horsLigne = () => toast.info('Tu es hors ligne. Canapé revient dès que le réseau revient.', 6000);
    window.addEventListener('offline', horsLigne);
    // Nouvelle version : jamais de rechargement forcé, un toast avec une action.
    let nettoyage: (() => void) | undefined;
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        const prevenir = (sw: ServiceWorker) => {
          // Dans la salle, le toast permanent recouvrirait « Entrer dans la salle » : on le montrera à la sortie.
          if (page.url.pathname.startsWith('/seances/') && !page.url.pathname.endsWith('/nouvelle')) return;
          toast.info('Une nouvelle version est prête.', -1, {
            libelle: 'Recharger',
            surClic: () => {
              navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
              sw.postMessage({ type: 'SKIP_WAITING' });
            },
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) prevenir(reg.waiting);
        const surTrouve = () => {
          const nouveau = reg.installing;
          nouveau?.addEventListener('statechange', () => {
            if (nouveau.state === 'installed' && navigator.serviceWorker.controller) prevenir(nouveau);
          });
        };
        reg.addEventListener('updatefound', surTrouve);
        nettoyage = () => reg.removeEventListener('updatefound', surTrouve);
      });
    }
    return () => { window.removeEventListener('offline', horsLigne); nettoyage?.(); };
  });

  // Garde : non connecté → /connexion?retour=… (sauf routes qui gèrent elles-mêmes l'accès).
  $effect(() => {
    if (session.charge && !connecte && !libre) {
      void goto(`/connexion?retour=${encodeURIComponent(`${chemin}${page.url.search}`)}`, { replaceState: true });
    }
  });

  // La zone des toasts monte au-dessus de la barre d'onglets du téléphone.
  $effect(() => {
    document.body.classList.toggle('avec-onglets', avecNavigation);
    return () => document.body.classList.remove('avec-onglets');
  });

  // Après un changement de page, le focus revient au contenu (lecteurs d'écran et clavier).
  let principal: HTMLElement | undefined = $state();
  $effect(() => {
    void chemin;
    principal?.scrollTo?.(0, 0);
  });

  function ouvrirMoi(): void { moiOuvert = true; }
</script>

<a class="evitement" href="#contenu">Aller au contenu</a>

{#if libre || salle}
  <!-- Connexion, invitation, lien de séance gèrent leur page ; la salle est plein cadre. -->
  {@render children()}
{:else if erreurChargement}
  <div class="plein">
    <EtatVide icone="alerte" titre="Impossible de joindre Canapé." texte="Vérifie ta connexion, puis réessaie.">
      {#snippet actions()}<Bouton icone="actualiser" onclick={charger}>Réessayer</Bouton>{/snippet}
    </EtatVide>
  </div>
{:else if !connecte}
  <div class="plein" role="status" aria-label="Chargement"><span class="logo-attente"><Logo taille={56} /></span></div>
{:else}
  <header class="haut">
    <a class="marque" href="/" aria-label="Canapé, accueil"><Logo taille={32} mot /></a>
    <nav class="nav" aria-label="Navigation principale">
      {#each ONGLETS as o (o.id)}
        <a href={o.href} aria-current={section === o.id ? 'page' : undefined}>{o.libelle}</a>
      {/each}
    </nav>
    <div class="actions-haut">
      <Bouton variante="secondaire" icone="plus" href="/galerie?ajouter=1">Ajouter un film</Bouton>
      <Menu libelle="Menu du compte" variante="libre" elements={elementsCompte}>
        {#snippet declencheur()}<Avatar prenom={session.utilisateur?.prenom ?? '?'} couleur={session.utilisateur?.couleur ?? null} taille={40} />{/snippet}
      </Menu>
    </div>
  </header>

  <header class="haut-mobile">
    <a class="marque" href="/" aria-label="Canapé, accueil"><Logo taille={28} mot /></a>
    <Bouton variante="secondaire" taille="s" icone="plus" href="/galerie?ajouter=1">Ajouter</Bouton>
  </header>

  <main id="contenu" bind:this={principal} tabindex="-1">{@render children()}</main>

  <nav class="onglets-bas" aria-label="Navigation principale">
    {#each ONGLETS.slice(0, 3) as o (o.id)}
      <a href={o.href} aria-current={section === o.id ? 'page' : undefined}><Icone nom={o.icone} />{o.court}</a>
    {/each}
    <button type="button" aria-haspopup="dialog" aria-current={section === 'historique' || chemin.startsWith('/compte') || chemin.startsWith('/admin') ? 'page' : undefined} onclick={ouvrirMoi}>
      <Icone nom="utilisateur" />Moi
    </button>
  </nav>

  <Modale bind:ouverte={moiOuvert} titre={session.utilisateur?.prenom ?? 'Moi'}>
    <nav class="moi" aria-label="Mon espace" onclick={() => (moiOuvert = false)} role="presentation">
      <a href="/historique"><Icone nom="historique" />Historique</a>
      <a href="/compte"><Icone nom="utilisateur" />Mon compte</a>
      {#if session.estAdmin}<a href="/admin"><Icone nom="reglages" />Administration</a>{/if}
      <button type="button" class="sortie" onclick={() => void session.deconnexion()}><Icone nom="deconnexion" />Se déconnecter</button>
    </nav>
  </Modale>
{/if}

<Toasts />

<style>
  .evitement {
    position: fixed; z-index: 2000; left: 16px; top: -80px; padding: 12px 20px; background: var(--lampe); color: var(--lampe-sur);
    border-radius: var(--r-pill); font-weight: 600; text-decoration: none; transition: top var(--d-2) var(--ease);
  }
  .evitement:focus { top: 12px; }
  .plein { min-height: 100dvh; display: grid; place-content: center; padding: var(--e-5); }
  .logo-attente { display: block; animation: respire 1.8s ease-in-out infinite; }
  @keyframes respire { 50% { opacity: 0.45; } }

  .haut {
    position: sticky; top: 0; z-index: 40; display: flex; align-items: center; gap: 28px; height: var(--barre-haute);
    padding: 0 var(--gouttiere); padding-top: env(safe-area-inset-top);
    background: rgba(20, 17, 26, 0.86); backdrop-filter: blur(14px); border-bottom: 1px solid var(--bord);
  }
  @supports not (backdrop-filter: blur(1px)) { .haut { background: rgba(28, 24, 36, 0.96); } }
  .marque { display: inline-flex; border-radius: var(--r-s); text-decoration: none; }
  .nav { display: flex; gap: 4px; margin-right: auto; }
  .nav a {
    display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: var(--r-pill);
    color: var(--doux); text-decoration: none; font-weight: 500; transition: color var(--d-1) var(--ease), background var(--d-1) var(--ease);
  }
  .nav a[aria-current='page'] { color: var(--texte); background: var(--s2); }
  @media (hover: hover) { .nav a:hover { color: var(--texte); } }
  .actions-haut { display: flex; align-items: center; gap: var(--e-4); }

  main { max-width: 1440px; margin: 0 auto; padding: 44px var(--gouttiere) 72px; outline: none; }

  .haut-mobile, .onglets-bas { display: none; }

  @media (max-width: 640px) {
    .haut, .nav { display: none; }
    .haut-mobile {
      display: flex; align-items: center; justify-content: space-between; padding: calc(10px + env(safe-area-inset-top)) var(--gouttiere) 6px;
    }
    main { padding: 16px var(--gouttiere) calc(var(--barre-onglets) + env(safe-area-inset-bottom) + 32px); }
    .onglets-bas {
      position: fixed; z-index: 40; left: 0; right: 0; bottom: 0; display: grid; grid-template-columns: repeat(4, 1fr);
      padding: 6px 8px env(safe-area-inset-bottom); min-height: var(--barre-onglets); background: var(--s1); border-top: 1px solid var(--bord);
    }
    .onglets-bas a, .onglets-bas button {
      display: grid; justify-items: center; align-content: center; gap: 2px; min-height: 52px; border: 0; background: transparent;
      color: var(--discret); font: 500 11px/1.2 var(--texte-police); text-decoration: none;
    }
    .onglets-bas [aria-current='page'] { color: var(--lampe); }
  }
  @media (min-width: 641px) and (max-width: 860px) {
    .haut { gap: 12px; }
    .nav a { padding: 0 11px; }
  }

  .moi { display: grid; gap: 2px; margin: 0 -8px; }
  .moi a, .moi button {
    display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 12px; border: 0; border-radius: var(--r-m);
    background: transparent; color: var(--texte); font: 400 16px/1 var(--texte-police); text-decoration: none; text-align: left;
  }
  .moi a:hover, .moi button:hover { background: var(--s3); }
  .moi .sortie { color: var(--mal); }
</style>
