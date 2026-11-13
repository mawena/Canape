<!--
  La salle : on y regarde le film ensemble. Éléments marqués `data-test` (pour l'essai Playwright) :
  - Sas : `sas`, `sas-micro`, `sas-camera`, `sas-vumetre`, `sas-casque`, `entrer-salle`
  - Salle : `salle` (conteneur ; attributs `data-phase`, `data-liaison`, `data-lecture`, `data-position`, `data-nb-presents`),
    `film` (<video>), `titre-seance`, `synchro` (attribut `data-niveau` : ok|moyen|mal|neutre), `quitter`, `presents`
  - Commandes : `commandes`, `lecture`, `lancer-ensemble`, `reculer`, `avancer`, `barre-temps`, `volumes`, `vol-film`, `vol-voix`,
    `vol-personne`, `baisse-film`, `langue-st`, `menu-langue`, `langue-<index>`, `st-aucun`, `st-<cle>`, `micro`, `camera`,
    `bouton-chat`, `je-reviens`, `inviter-seance` (hôte seulement ; ouvre `panneau-inviter`, `lien-seance`, `copier-lien-seance`, `partager-lien-seance`, `erreur-lien-seance`), `plein-ecran`, `reaction-1` à `reaction-8`
  - Soirée (plusieurs films) : `bouton-programme` (ouvre `programme`, `programme-film`, `programme-monter`, `programme-descendre`, `programme-retirer`,
    `ajouter-film-programme`, `programme-recherche`, `programme-choix`, `film-suivant`, `confirmer-film-suivant` ; actions pour l'hôte seulement),
    `entracte` (dans la scène ; `entracte-film`, `entracte-temps`, `entracte-lancer`, `entracte-prolonger` pour l'hôte) ; `salle` a `data-entracte`
  - Vignettes : `vignettes`, `vignette` (attributs `data-cid`, `data-parle`, `data-moi`, `data-pair` : new|connecting|connected…), `menu-vignette`, `afficher-cameras`
  - Chat : `chat`, `saisie-chat`, `message` ; réactions flottantes : `reaction`
  - Voiles : `compte-a-rebours`, `attente`, `ne-plus-attendre`, `reprise`, `reprendre-position`, `depuis-le-debut`,
    `lecture-bloquee`, `reprendre-ici`, `erreur-lecture`, `sans-film`, `fin-seance` (+ `temps-ensemble`, `present-fin`, `note-autre`, `note-coeur`, `note-bien`, `note-bof`, `revoir-fin`), `quitter-fin`
  - `annonce` (chaque geste partagé), `raccourcis`
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Users from '@lucide/svelte/icons/users';
  import { EMOJIS } from '@canape/partage';
  import { ErreurApi } from '$lib/api/client.ts';
  import { Avatar, Bouton, Chargement } from '$lib/ui/index.ts';
  import Chat from '$lib/seance/Chat.svelte';
  import Commandes from '$lib/seance/Commandes.svelte';
  import Entracte from '$lib/seance/Entracte.svelte';
  import { peutInviter } from '$lib/seance/inviter.ts';
  import { lireMoi, urlConnexion } from '$lib/seance/moi.ts';
  import { coteChat } from '$lib/seance/prefs.ts';
  import { emojiDeTouche } from '$lib/seance/reactions.ts';
  import Reactions from '$lib/seance/Reactions.svelte';
  import Sas from '$lib/seance/Sas.svelte';
  import { Salle } from '$lib/seance/salle.svelte.ts';
  import Vignettes from '$lib/seance/Vignettes.svelte';
  import Voiles from '$lib/seance/Voiles.svelte';

  const id = page.params['id'] ?? '';
  const salle = new Salle(id, () => { void goto(urlConnexion(`/seances/${id}`)); });

  let pret = $state(false);
  let moiId: number | null = $state(null);
  let erreur: string | null = $state(null);
  let conteneur: HTMLDivElement | undefined = $state();
  let video: HTMLVideoElement | undefined = $state();
  let pleinEcran = $state(false);
  let repos = $state(false);
  let menu: string | null = $state(null);
  let aide = $state(false);
  let presents = $state(false);
  let detailsSynchro = $state(false);
  let largeur = $state(1280);
  let hauteur = $state(800);
  let minuteRepos: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    try {
      const moi = await lireMoi();
      if (!moi) { await goto(urlConnexion(`/seances/${id}`)); return; }
      moiId = moi.id;
      await salle.chargerSeance();
      await salle.rafraichirPeripheriques();
      pret = true;
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) { await goto(urlConnexion(`/seances/${id}`)); return; }
      erreur = e instanceof ErreurApi && e.statut === 404 ? 'Cette séance n’existe pas, ou tu n’y es pas invité·e.' : e instanceof Error ? e.message : 'Erreur inconnue.';
    }
  });
  onDestroy(() => {
    if (minuteRepos) clearTimeout(minuteRepos);
    salle.quitter();
  });

  // Ne dépend que de l'élément <video> : sans `untrack`, l'effet suivrait aussi l'état lu dans `lierVideo` et
  // rebrancherait le lecteur (nouveau moteur de synchro, qui oublie son « je charge ») à chaque message reçu.
  $effect(() => {
    const v = video;
    if (v) return untrack(() => salle.lierVideo(v));
  });

  const inviter = $derived(peutInviter(salle.seance, moiId));
  const portrait = $derived(largeur <= 640 && hauteur > largeur);
  const paysageTel = $derived(hauteur <= 520 && largeur > hauteur);
  const cote = $derived(coteChat(salle.prefs.coin));
  const attente = $derived((salle.etat?.attente.length ?? 0) > 0 || salle.compte !== null);
  const cache = $derived(repos && salle.enLecture && !attente && menu === null && !portrait);

  function reveiller(): void {
    repos = false;
    if (minuteRepos) clearTimeout(minuteRepos);
    minuteRepos = setTimeout(() => {
      const focus = conteneur?.querySelector('.commandes')?.contains(document.activeElement) ?? false;
      repos = !focus;
    }, 3000);
  }

  function basculerPleinEcran(): void {
    const el = conteneur;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => { pleinEcran = !pleinEcran; });
    else pleinEcran = !pleinEcran; // iPhone : pas de plein écran d'un conteneur, on se rabat sur « plein cadre »
  }
  function surChangementPleinEcran(): void {
    pleinEcran = document.fullscreenElement === conteneur;
  }

  function quitter(): void {
    salle.quitter();
    void goto('/seances');
  }

  function choisirFilm(): void {
    void goto('/galerie');
  }

  function clavier(e: KeyboardEvent): void {
    if (salle.phase !== 'salle') return;
    const t = e.target as HTMLElement | null;
    const champ = !!t && (t.matches('input, textarea, select') || t.isContentEditable);
    reveiller();
    salle.reveillerSons();
    if (e.key === 'Escape') {
      if (aide) aide = false;
      else if (menu) menu = null;
      else if (salle.chatOuvert) salle.ouvrirChat(false);
      return;
    }
    if (champ || e.ctrlKey || e.metaKey || e.altKey) return;
    const surBouton = !!t && t.matches('button, [role=slider]');
    const k = e.key.toLowerCase();
    if ((e.key === ' ' && !surBouton) || k === 'k') { e.preventDefault(); salle.basculerLecture(); }
    else if (e.key === 'ArrowLeft' && !(t?.matches('[role=slider]'))) { e.preventDefault(); salle.allerRelatif(e.shiftKey ? -30 : -10); }
    else if (e.key === 'ArrowRight' && !(t?.matches('[role=slider]'))) { e.preventDefault(); salle.allerRelatif(e.shiftKey ? 30 : 10); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (t?.matches('[role=slider]')) return;
      e.preventDefault();
      salle.prefs.volFilm = Math.max(0, Math.min(1, Math.round((salle.prefs.volFilm + (e.key === 'ArrowUp' ? 0.05 : -0.05)) * 100) / 100));
      salle.appliquerVolumes();
      salle.sauverPrefs();
    }
    else if (k === 'm') salle.basculerMicro();
    else if (k === 'v') salle.basculerCamera();
    else if (k === 'c') salle.ouvrirChat(!salle.chatOuvert);
    else if (k === 'f') basculerPleinEcran();
    else if (k === 's') menu = menu === 'langue' ? null : 'langue';
    else if (e.key === '?') aide = !aide;
    else {
      const emoji = emojiDeTouche(e.key, EMOJIS);
      if (emoji) salle.reagir(emoji);
    }
  }

  function cliquerFilm(e: MouseEvent): void {
    reveiller();
    menu = null;
    if ((e as PointerEvent).pointerType === 'touch') return;
    salle.basculerLecture();
  }
  function doubleClic(e: MouseEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.3) salle.allerRelatif(-10);
    else if (x > 0.7) salle.allerRelatif(10);
    else basculerPleinEcran();
  }
</script>

<svelte:window bind:innerWidth={largeur} bind:innerHeight={hauteur} onkeydown={clavier} onpointerdown={() => salle.reveillerSons()} />
<svelte:document onfullscreenchange={surChangementPleinEcran} />
<svelte:head><title>{salle.titre} — Canapé</title></svelte:head>

{#if erreur}
  <main class="plein-ecran-message">
    <h1>Séance introuvable</h1>
    <p>{erreur}</p>
    <Bouton href="/seances">Retour aux séances</Bouton>
  </main>
{:else if !pret}
  <main class="plein-ecran-message"><Chargement /></main>
{:else if salle.phase === 'sas'}
  <Sas {salle} surQuitter={quitter} peutInviter={inviter} />
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    data-theme="sombre" class="salle" class:repos={cache} class:portrait class:paysage={paysageTel} class:plein-cadre={pleinEcran && !document.fullscreenElement} class:en-entracte={salle.enEntracte}
    bind:this={conteneur} onpointermove={reveiller} onpointerdown={reveiller} data-test="salle" data-phase={salle.phase} data-liaison={salle.liaison}
    data-lecture={salle.enLecture} data-position={Math.round(salle.temps)} data-nb-presents={salle.personnes.length} data-entracte={salle.enEntracte}
  >
    <div class="lueur" aria-hidden="true"></div>

    <header class="haut">
      <button type="button" class="retour" onclick={quitter} aria-label="Quitter la salle" data-test="quitter"><ChevronLeft size={22} /></button>
      <h1 data-test="titre-seance">{salle.titre}</h1>
      <div class="a-droite">
        <button type="button" class="synchro {salle.synchro.niveau}" data-niveau={salle.synchro.niveau} data-test="synchro"
          onclick={() => (detailsSynchro = !detailsSynchro)} aria-expanded={detailsSynchro}>
          <span class="point" aria-hidden="true"></span>{salle.synchro.texte}
        </button>
        {#if detailsSynchro}
          <div class="details" role="dialog" aria-label="Détails de la synchro">
            <p>Écart avec le groupe : {salle.ecart.toFixed(2).replace('.', ',')} s</p>
            <p>Latence du serveur : {salle.serveurRtt ?? '—'} ms</p>
            <p>Liaison : {salle.liaison === 'ouvert' ? 'connectée' : salle.liaison === 'connexion' ? 'en cours' : 'coupée'}</p>
            <Bouton taille="s" onclick={() => { salle.resynchroniser(); detailsSynchro = false; }} data-test="resynchroniser">Resynchroniser</Bouton>
          </div>
        {/if}
        <button type="button" class="pile" onclick={() => (presents = !presents)} aria-expanded={presents} aria-label="Qui est dans la salle" data-test="presents">
          {#each salle.personnes.slice(0, 4) as p (p.cid)}<span class="av"><Avatar prenom={p.utilisateur.prenom} couleur={p.utilisateur.couleur} taille={32} /></span>{/each}
          {#if salle.personnes.length === 0}<Users size={20} />{/if}
        </button>
        {#if presents}
          <ul class="liste-presents" aria-label="Dans la salle">
            {#each salle.personnes as p (p.cid)}
              <li>{p.utilisateur.prenom}{p.soi ? ' (moi)' : ''} · {p.micro ? 'micro' : 'micro coupé'} · {p.camera ? 'caméra' : 'caméra coupée'}{p.faible ? ' · connexion faible' : ''}</li>
            {/each}
          </ul>
        {/if}
      </div>
    </header>

    <div class="scene" ondblclick={doubleClic} role="presentation">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} playsinline onclick={cliquerFilm} data-test="film" aria-label="Film"></video>
      {#if salle.enEntracte}<Entracte {salle} />{/if}
    </div>

    <Vignettes {salle} avecNom={!cache} imposerRangee={portrait} {paysageTel} {conteneur} />
    {#if salle.chatOuvert}<Chat {salle} {cote} />{/if}
    <Reactions {salle} />
    <Voiles {salle} surQuitter={quitter} surChoisir={choisirFilm} />

    {#if !salle.chatOuvert && salle.apercu}
      <p class="apercu" role="status"><strong>{salle.apercu.prenom}</strong> {salle.apercu.texte}</p>
    {/if}

    <div class="annonces" role="status" aria-live="polite">
      {#each salle.annonces as a (a.id)}<p class="annonce" data-test="annonce">{a.texte}</p>{/each}
    </div>

    {#if !salle.prefs.conseilCasqueVu && !salle.prefs.casque && !salle.chatOuvert}
      <p class="conseil">
        Un casque évite l’écho : sans casque, le film repart dans le micro.
        <button type="button" onclick={() => { salle.prefs.conseilCasqueVu = true; salle.sauverPrefs(); }}>Ne plus afficher</button>
      </p>
    {/if}

    <footer class="bas"><Commandes {salle} {pleinEcran} surPleinEcran={basculerPleinEcran} bind:menu peutInviter={inviter} /></footer>

    {#if aide}
      <div class="aide" role="dialog" aria-label="Raccourcis clavier" data-test="raccourcis">
        <h2>Raccourcis</h2>
        <ul>
          <li><kbd>Espace</kbd> / <kbd>K</kbd> lecture, pause</li><li><kbd>←</kbd> <kbd>→</kbd> ±10 s (<kbd>Maj</kbd> : ±30 s)</li>
          <li><kbd>↑</kbd> <kbd>↓</kbd> volume du film</li><li><kbd>M</kbd> micro · <kbd>V</kbd> caméra</li>
          <li><kbd>C</kbd> discussion · <kbd>F</kbd> plein écran</li><li><kbd>S</kbd> langue et sous-titres</li>
          <li><kbd>1</kbd>–<kbd>8</kbd> réactions · <kbd>?</kbd> cette aide</li>
        </ul>
        <Bouton taille="s" onclick={() => (aide = false)}>Fermer</Bouton>
      </div>
    {/if}
  </div>
{/if}

<style>
  .plein-ecran-message { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 12px; text-align: center; padding: 24px; }
  .salle {
    position: relative; display: flex; flex-direction: column; width: 100%; height: 100dvh; overflow: hidden;
    background: var(--fond, #0d0c12); color: #fff; user-select: none;
  }
  .salle.plein-cadre { position: fixed; inset: 0; z-index: 100; }
  .salle.repos { cursor: none; }
  .lueur { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(96, 165, 250, 0.16), transparent 70%); filter: blur(40px); }
  .scene { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; z-index: 1; }
  video { width: 100%; height: 100%; object-fit: contain; background: transparent; }
  .haut {
    position: absolute; top: 0; left: 0; right: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 12px 20px 40px;
    background: linear-gradient(rgba(6, 5, 10, 0.85), transparent); transition: opacity 220ms; pointer-events: none;
  }
  .haut > * { pointer-events: auto; }
  .retour { border: 0; background: rgba(255, 255, 255, 0.1); color: #fff; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; }
  h1 { font: 400 1.5rem 'Instrument Serif', Georgia, serif; margin: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .a-droite { position: relative; display: flex; align-items: center; gap: 10px; }
  .synchro { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; padding: 6px 12px; background: rgba(13, 12, 18, 0.7); color: #fff; font-size: 13px; }
  .point { width: 10px; height: 10px; border-radius: 50%; background: var(--discret, #9f99ad); }
  .ok .point { background: var(--ok, #5fdcae); }
  .moyen .point { background: var(--alerte, #ffd166); }
  .mal .point { background: var(--mal, #ff7b6e); }
  .details, .liste-presents { position: absolute; top: 44px; right: 0; z-index: 9; background: var(--s2, #1d1b26); border-radius: 14px; padding: 12px 14px; display: grid; gap: 6px; min-width: 240px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6); font-size: 0.9rem; margin: 0; list-style: none; }
  .details p { margin: 0; }
  .pile { display: flex; border: 0; background: none; padding: 0; color: #fff; }
  .av { margin-left: -10px; display: inline-flex; }
  .av:first-child { margin-left: 0; }
  .annonces { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); z-index: 9; display: grid; gap: 6px; justify-items: center; pointer-events: none; }
  .annonce { margin: 0; padding: 8px 16px; border-radius: 999px; background: rgba(13, 12, 18, 0.85); backdrop-filter: blur(8px); font-size: 0.95rem; animation: entre 180ms ease-out; }
  @keyframes entre { from { opacity: 0; transform: translateY(-6px); } }
  .apercu { position: absolute; z-index: 6; bottom: 130px; left: 50%; transform: translateX(-50%); margin: 0; max-width: 280px; padding: 6px 14px; border-radius: 999px; background: rgba(13, 12, 18, 0.85); font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .conseil { position: absolute; z-index: 6; top: 64px; left: 16px; margin: 0; padding: 8px 14px; border-radius: 12px; background: rgba(13, 12, 18, 0.85); font-size: 0.85rem; max-width: 360px; }
  .conseil button { background: none; border: 0; color: var(--lampe, #1f5ce0); text-decoration: underline; padding: 0 0 0 6px; }
  .bas { position: absolute; left: 0; right: 0; bottom: 0; z-index: 5; transition: opacity 220ms; }
  .repos .haut, .repos .bas { opacity: 0; pointer-events: none; }
  .repos .conseil { display: none; }
  .aide { position: absolute; z-index: 20; inset: 0; margin: auto; width: min(420px, 90vw); height: fit-content; background: var(--s1, #15141c); border-radius: 22px; padding: 20px 24px; display: grid; gap: 10px; }
  .aide h2 { font: 400 1.5rem 'Instrument Serif', Georgia, serif; margin: 0; }
  .aide ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  kbd { background: var(--s3, #282532); border-radius: 6px; padding: 1px 7px; font: inherit; font-size: 0.85rem; }

  /* Téléphone en portrait : le film n'est jamais couvert ; caméras en rangée dessous, commandes dans le flux. */
  .salle:not(.portrait) :global(.vignettes.rangee) { margin-bottom: 112px; position: relative; z-index: 4; }
  .portrait .haut { position: static; padding: 8px 12px; background: var(--s1, #15141c); }
  .portrait .scene { flex: none; aspect-ratio: 16 / 9; }
  /* Entracte sur téléphone : la scène grandit pour l'affiche, le minuteur et les boutons. */
  .portrait.en-entracte .scene { aspect-ratio: auto; min-height: 300px; }
  .portrait .bas { position: static; }
  .portrait .annonces { top: 52px; }
  .portrait .apercu, .portrait .conseil { display: none; }
  /* Téléphone en paysage : film plein cadre, une vignette de 92 px, commandes en surimpression. */
  .paysage .haut { padding: 6px 12px 24px; }
  .paysage .annonces { top: 44px; }
  .paysage .apercu { bottom: 90px; }
  @media (prefers-reduced-motion: reduce) { .annonce { animation: none; } }
</style>
