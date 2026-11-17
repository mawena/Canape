<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { goto, onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { Avatar, Bouton, EtatVide, Icone, Logo, Menu, Modale, Toasts, toast, type ElementMenu, type NomIcone } from '$lib/ui/index.ts';
  import { estRouteLibre, estSalle, sectionActive } from '$lib/interface/routes.ts';
  import { session } from '$lib/interface/session.svelte.ts';
  import { theme, LIBELLES_THEME, type PreferenceTheme } from '$lib/interface/theme.svelte.ts';
  import SelecteurTheme from '$lib/interface/SelecteurTheme.svelte';
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
    (['clair', 'sombre', 'auto'] as PreferenceTheme[]).forEach((c, i) => liste.push({
      libelle: `Thème : ${LIBELLES_THEME[c].toLowerCase()}`, icone: theme.preference === c ? 'verifier' : 'lune', surClic: () => theme.choisir(c), separateurAvant: i === 0,
    }));
    liste.push({ libelle: 'Se déconnecter', icone: 'deconnexion', surClic: () => void session.deconnexion(), separateurAvant: true });
    return liste;
  });

  async function charger(): Promise<void> {
    erreurChargement = false;
    try { await session.charger(true); } catch { erreurChargement = true; }
  }

  onMount(() => {
    theme.init();
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
  // Transitions de page : fondu court par l'API View Transitions quand le navigateur la connaît (sinon rien ne change).
  // Jamais vers ou depuis la salle (plein cadre, vidéo) ; le mouvement réduit est respecté par jetons.css.
  onNavigate((nav) => {
    if (!document.startViewTransition || !nav.to || estSalle(nav.to.url.pathname) || estSalle(page.url.pathname)) return;
    if (nav.from?.url.pathname === nav.to.url.pathname) return;
    return new Promise((fin) => {
      document.startViewTransition(async () => { fin(); await nav.complete; });
    });
  });
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
    <a class="marque" href="/" aria-label="Canapé, accueil"><Logo taille={30} mot /></a>
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
      <div class="theme-moi" role="presentation" onclick={(e) => e.stopPropagation()}><span>Apparence</span><SelecteurTheme /></div>
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
    background: var(--fond-verre); backdrop-filter: var(--flou-verre); -webkit-backdrop-filter: var(--flou-verre);
    border-bottom: 1px solid color-mix(in srgb, var(--bord) 70%, transparent);
  }
  @supports not (backdrop-filter: blur(1px)) { .haut { background: var(--s1); } }
  .marque { display: inline-flex; border-radius: var(--r-s); text-decoration: none; }
  /* Navigation en segments : la page courante est une pastille claire posée sur un rail (avec le point de lampe). */
  .nav {
    display: flex; gap: 2px; margin-right: auto; padding: 4px; border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--s3) 55%, transparent); box-shadow: inset 0 1px 2px rgba(20, 16, 10, 0.06);
  }
  .nav a {
    position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 16px; border-radius: var(--r-pill);
    color: var(--doux); text-decoration: none; font-weight: 600; font-size: 15px;
    transition: color var(--d-1) var(--ease), background var(--d-2) var(--ease), box-shadow var(--d-2) var(--ease);
  }
  .nav a[aria-current='page'] { color: var(--texte); background: var(--s1); box-shadow: var(--ombre-1), inset 0 1px 0 var(--reflet); }
  .nav a[aria-current='page']::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--ambre); box-shadow: 0 0 10px var(--ambre-lueur);
  }
  @media (hover: hover) { .nav a:not([aria-current='page']):hover { color: var(--texte); background: color-mix(in srgb, var(--s1) 60%, transparent); } }
  .actions-haut { display: flex; align-items: center; gap: var(--e-4); }

  main { max-width: 1440px; margin: 0 auto; padding: 48px var(--gouttiere) 88px; outline: none; view-transition-name: contenu; }

  .haut-mobile, .onglets-bas { display: none; }

  @media (max-width: 640px) {
    .haut, .nav { display: none; }
    .haut-mobile {
      display: flex; align-items: center; justify-content: space-between; padding: calc(12px + env(safe-area-inset-top)) var(--gouttiere) 6px;
    }
    main { padding: 16px var(--gouttiere) calc(var(--barre-onglets) + env(safe-area-inset-bottom) + 44px); }
    /* Barre d'onglets flottante : une capsule de verre détachée des bords. */
    .onglets-bas {
      position: fixed; z-index: 40; left: 12px; right: 12px; bottom: calc(10px + env(safe-area-inset-bottom));
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; padding: 6px; min-height: var(--barre-onglets);
      border-radius: 26px; background: var(--fond-verre); backdrop-filter: var(--flou-verre); -webkit-backdrop-filter: var(--flou-verre);
      border: 1px solid color-mix(in srgb, var(--bord-vif) 60%, transparent); box-shadow: var(--ombre-3), inset 0 1px 0 var(--reflet);
    }
    @supports not (backdrop-filter: blur(1px)) { .onglets-bas { background: var(--s1); } }
    .onglets-bas a, .onglets-bas button {
      display: grid; justify-items: center; align-content: center; gap: 2px; min-height: 52px; border: 0; border-radius: 20px; background: transparent;
      color: var(--discret); font: 600 11px/1.2 var(--texte-police); text-decoration: none; position: relative;
      transition: background var(--d-2) var(--ease), color var(--d-1) var(--ease);
    }
    .onglets-bas [aria-current='page'] { color: var(--lampe); background: var(--lampe-fond); }
  }
  @media (min-width: 641px) and (max-width: 900px) {
    .haut { gap: 12px; }
    .nav a { padding: 0 12px; }
    .nav a[aria-current='page']::before { display: none; }
  }

  .moi { display: grid; gap: 2px; margin: 0 -8px; }
  .moi a, .moi button {
    display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 12px; border: 0; border-radius: var(--r-m);
    background: transparent; color: var(--texte); font: 400 16px/1 var(--texte-police); text-decoration: none; text-align: left;
  }
  .moi a:hover, .moi button:hover { background: var(--s3); }
  .moi .sortie { color: var(--mal); }
  .theme-moi { display: grid; gap: 8px; padding: 8px 12px 12px; color: var(--doux); font-size: 14px; font-weight: 600; }
</style>
