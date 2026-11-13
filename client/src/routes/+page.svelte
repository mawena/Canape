<script lang="ts">
  import { onMount } from 'svelte';
  import type { Film, ListeSeances, ProgressionFilm, ReponseLienSeance, Seance } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import {
    AfficheFilm, BarreProgression, Bouton, Badge, EnTetePage, EtatVide, Icone, Lueur, MiniAffiche, PileAvatars, Squelette, toast,
    couleurDuTitre, formaterDans, formaterDuree, formaterHeure, formaterJourLong,
  } from '$lib/ui/index.ts';
  import { accroche, autresPersonnes, filmsARreprendre, filmsPourLancer, ouvertureSalle, salleOuverte, seanceDeCeSoir } from '$lib/interface/accueil.ts';
  import LancementRapide from '$lib/interface/LancementRapide.svelte';
  import Telechargements from '$lib/interface/Telechargements.svelte';
  import Installer from '$lib/interface/Installer.svelte';
  import PremiersPas from '$lib/interface/PremiersPas.svelte';
  import { liens } from '$lib/interface/liens.ts';
  import { session } from '$lib/interface/session.svelte.ts';

  let seances = $state<ListeSeances | null>(null);
  let reprises: ProgressionFilm[] = $state([]);
  let films: Film[] = $state([]);
  let erreurs = $state({ seances: false, reprises: false, films: false });
  let charge = $state(false);
  let maintenant = $state(new Date());

  async function charger(): Promise<void> {
    erreurs = { seances: false, reprises: false, films: false };
    const [s, r, f] = await Promise.allSettled([
      api.get<ListeSeances>('/api/seances'),
      api.get<ProgressionFilm[]>('/api/reprendre'),
      api.get<Film[]>('/api/films?vue=tous'),
    ]);
    if (s.status === 'fulfilled') seances = s.value; else erreurs.seances = true;
    if (r.status === 'fulfilled') reprises = Array.isArray(r.value) ? r.value : []; else erreurs.reprises = true;
    if (f.status === 'fulfilled') films = Array.isArray(f.value) ? f.value : []; else erreurs.films = true;
    charge = true;
  }

  async function apresLancement(): Promise<void> {
    try { seances = await api.get<ListeSeances>('/api/seances'); } catch { /* l'accueil se met à jour au prochain chargement */ }
  }

  onMount(() => {
    void charger();
    const minuteur = setInterval(() => { maintenant = new Date(); }, 30_000);
    return () => clearInterval(minuteur);
  });

  const moi = $derived(session.utilisateur);
  const filmParId = $derived(new Map(films.map((f) => [f.id, f])));
  const ceSoir = $derived(seanceDeCeSoir(seances, maintenant));
  const filmDeSeance = $derived(ceSoir?.filmId ? (filmParId.get(ceSoir.filmId) ?? null) : null);
  const aReprendre = $derived(filmsARreprendre(reprises));
  const recents = $derived(films.filter((f) => f.etat !== 'erreur').slice(0, 6));
  const toutesSeances = $derived<Seance[]>(seances ? [...seances.enCours, ...seances.aVenir, ...seances.recentes] : []);
  const seanceParId = $derived(new Map(toutesSeances.map((s) => [s.id, s])));
  const compteNeuf = $derived(charge && !erreurs.films && films.length === 0 && !ceSoir && aReprendre.length === 0);
  const tout = $derived(accroche(moi?.prenom ?? '', ceSoir, moi?.id ?? 0, aReprendre.length > 0, maintenant));
  const autres = $derived(ceSoir && moi ? autresPersonnes(ceSoir, moi.id) : []);
  const ouverte = $derived(ceSoir ? salleOuverte(ceSoir, maintenant) : false);
  const ouverture = $derived(ceSoir ? ouvertureSalle(ceSoir) : null);
  const personnesSeance = $derived(
    ceSoir
      ? [
          { prenom: ceSoir.hotePrenom, couleur: ceSoir.invites.find((i) => i.id === ceSoir.hoteId)?.couleur ?? null, present: false },
          ...ceSoir.invites.filter((i) => i.id !== ceSoir.hoteId).map((i) => ({ prenom: i.prenom, couleur: i.couleur, present: false })),
        ]
      : [],
  );
  const pretsALancer = $derived(filmsPourLancer(films, aReprendre));
  const enCours = $derived(ceSoir !== null && ceSoir.presents > 0);

  function lienReprise(p: ProgressionFilm): string {
    const s = p.seanceId ? seanceParId.get(p.seanceId) : undefined;
    return s && s.termineeLe === null ? liens.seance(s.id) : liens.nouvelleSeance(p.film.id);
  }
  function avecQui(p: ProgressionFilm): string {
    const s = p.seanceId ? seanceParId.get(p.seanceId) : undefined;
    if (!s || !moi) return '';
    const noms = autresPersonnes(s, moi.id).map((x) => x.prenom);
    return noms.length ? ` · avec ${noms.length > 2 ? `${noms[0]} et ${noms.length - 1} autres` : noms.join(' et ')}` : '';
  }
  function arrete(p: ProgressionFilm): string {
    return `Arrêté à ${formaterDuree(p.position)}${avecQui(p)}`;
  }

  let pasVisibles = $state(false);
  let copie = $state(false);
  async function copierLien(): Promise<void> {
    if (!ceSoir) return;
    try {
      const r = await api.post<ReponseLienSeance>(`/api/seances/${ceSoir.id}/lien`);
      const lien = r.lien.startsWith('http') ? r.lien : `${location.origin}${r.lien}`;
      await navigator.clipboard.writeText(lien);
      copie = true;
      toast.ok('Lien copié. À coller où tu veux.');
      setTimeout(() => (copie = false), 3000);
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'Impossible de copier le lien.');
    }
  }

  const dateDuJour = $derived(formaterJourLong(maintenant));
  const lueurCouleur = $derived(filmDeSeance?.aAffiche ? null : ceSoir ? couleurDuTitre(ceSoir.filmTitre ?? '') : null);
  const heureSeance = $derived(ceSoir?.prevueLe ? formaterHeure(new Date(ceSoir.prevueLe)) : null);
</script>

<svelte:head><title>Ce soir · Canapé</title></svelte:head>

<div class="accueil">
  <EnTetePage taille="affiche" surtitre={dateDuJour} titre={charge ? `${tout.salut} ${tout.suite}` : `${tout.salut}`} />

  {#if !charge}
    <div class="hero chargement" aria-busy="true" aria-label="Chargement de ta soirée">
      <Squelette forme="affiche" largeur="220px" />
      <div class="lignes"><Squelette largeur="30%" /><Squelette hauteur="52px" largeur="70%" /><Squelette largeur="90%" /><Squelette largeur="60%" /></div>
    </div>
    <section aria-hidden="true"><div class="rangee"><Squelette forme="carte-affiche" /><Squelette forme="carte-affiche" /><Squelette forme="carte-affiche" /><Squelette forme="carte-affiche" /></div></section>
  {:else if erreurs.seances && erreurs.films && erreurs.reprises}
    <EtatVide icone="alerte" titre="Impossible de charger ta soirée." texte="Le serveur ne répond pas. Vérifie ta connexion, puis réessaie.">
      {#snippet actions()}<Bouton icone="actualiser" onclick={charger}>Réessayer</Bouton>{/snippet}
    </EtatVide>
  {:else if compteNeuf}
    <PremiersPas films={films.length} seances={toutesSeances.length} estAdmin={session.estAdmin} bind:visible={pasVisibles} />
    {#if !pasVisibles}
      <EtatVide icone="clap" titre="Ta galerie est vide." texte="Dépose ton premier film : dès qu’il est arrivé, il est prêt à regarder.">
        {#snippet actions()}<Bouton taille="l" icone="televerser" href={liens.ajouterFilm}>Ajouter un film</Bouton>{/snippet}
      </EtatVide>
    {/if}
    <Telechargements />
  {:else}
    <PremiersPas films={films.length} seances={toutesSeances.length} estAdmin={session.estAdmin} />
    <!-- 1. La séance en cours ou la prochaine ; sinon le lancement rapide -->
    {#if ceSoir}
      <section class="hero ce-soir" aria-labelledby="titre-ce-soir" data-test="seance-hero" data-etat={enCours ? 'en-cours' : 'prevue'}>
        <Lueur couleur={lueurCouleur} intensite={0.34} position="gauche" />
        <div class="affiche-hero">
          <AfficheFilm
            {...(filmDeSeance ? { film: filmDeSeance } : { titre: ceSoir.filmTitre ?? 'Film' })}
            etat="pret" sansLegende
          />
        </div>
        <div class="contenu">
          <div class="entete">
            <p class="puces">
              <Badge ton="lampe" icone="calendrier">
                {enCours ? 'Séance en cours' : ceSoir.termineeLe === null && !ceSoir.prevueLe ? 'Séance prête' : `${maintenant.getHours() >= 18 ? 'Séance de ce soir' : 'Séance du jour'}${heureSeance ? ` · ${heureSeance}` : ''}`}
              </Badge>
              {#if ceSoir.prevueLe && !ouverte}<span class="compte tn">{formaterDans(ceSoir.prevueLe, maintenant)}</span>{/if}
            </p>
            <h2 id="titre-ce-soir">{ceSoir.filmTitre ?? filmDeSeance?.titre ?? 'Séance'}</h2>
          </div>
          {#if filmDeSeance?.resume}<p class="resume">{filmDeSeance.resume}</p>{/if}
          <div class="qui">
            <PileAvatars personnes={personnesSeance} />
            <p>
              {#if ceSoir.presents > 0}{autres.length ? `${autres.map((a) => a.prenom).join(', ')} ${autres.length > 1 ? 'sont' : 'est'} dans la salle.` : 'Tu es dans la salle.'}
              {:else if autres.length}{autres.map((a) => a.prenom).join(', ')} {autres.length > 1 ? 'ne sont' : 'n’est'} pas encore là.{ouverture && !ouverte ? ` Ouverture de la salle à ${formaterHeure(ouverture)}.` : ''}
              {:else}Personne n’est encore là. Copie le lien pour inviter.{/if}
            </p>
          </div>
          <div class="boutons">
            <Bouton taille="l" icone="lecture" href={ouverte ? liens.seance(ceSoir.id) : undefined} disabled={!ouverte} data-test="rejoindre">{enCours ? 'Rejoindre' : 'Entrer dans la salle'}</Bouton>
            <Bouton variante="secondaire" icone={copie ? 'verifier' : 'lien'} onclick={copierLien} data-test="copier-lien-hero">Copier le lien</Bouton>
          </div>
          {#if !ouverte && ouverture}<p class="aide-hero">La salle ouvre à {formaterHeure(ouverture)}.</p>{/if}
        </div>
      </section>
    {:else}
      <LancementRapide films={pretsALancer} onCree={apresLancement} />
    {/if}

    {#if erreurs.seances}
      <p class="alerte" role="status"><Icone nom="alerte" taille={16} /> Impossible de charger tes séances. <button type="button" class="lien-bouton" onclick={charger}>Réessayer</button></p>
    {/if}

    <!-- 2. Reprendre : un geste -->
    {#if aReprendre.length > 0}
      <section class="bloc" aria-labelledby="titre-reprendre" data-test="reprendre">
        <div class="tete-bloc"><h2 id="titre-reprendre" class="t-titre2">Reprendre</h2></div>
        <ul class="reprises">
          {#each aReprendre.slice(0, 4) as p (p.film.id)}
            <li>
              <a class="reprise" href={lienReprise(p)} data-test="reprendre-film" aria-label="Reprendre {p.film.titre}. {arrete(p)}">
                <MiniAffiche film={p.film} largeur={56} />
                <span class="texte">
                  <span class="nom">{p.film.titre}</span>
                  <span class="sous">{arrete(p)}</span>
                  <BarreProgression valeur={p.duree ? p.position / p.duree : null} libelle="Progression de {p.film.titre}" fine />
                </span>
                <span class="jouer" aria-hidden="true"><Icone nom="lecture" taille={20} /></span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- 3. Téléchargements en cours -->
    <Telechargements />

    <!-- 4. Lancer une séance (quand une séance est déjà là, plus bas) -->
    {#if ceSoir}<LancementRapide films={pretsALancer} titre="Lancer une autre séance" onCree={apresLancement} />{/if}

    <!-- 5. Ajoutés récemment -->
    {#if recents.length > 0}
      <section class="bloc" aria-labelledby="titre-recents">
        <div class="tete-bloc">
          <h2 id="titre-recents" class="t-titre2">Ajoutés récemment</h2>
          <a class="voir-tout" href={liens.galerie}>Voir tous les films</a>
        </div>
        <div class="rangee defile">
          {#each recents as f (f.id)}
            <AfficheFilm film={f} href={liens.film(f.id)} sousTitre={f.proprietaireId === moi?.id ? 'Ajouté par toi' : `Ajouté par ${f.proprietairePrenom}`} />
          {/each}
        </div>
      </section>
    {:else if !erreurs.films}
      <EtatVide icone="film" titre="Rien à l’affiche pour l’instant." texte="Dépose un film : il sera prêt à regarder dès qu’il est arrivé.">
        {#snippet actions()}<Bouton icone="televerser" href={liens.ajouterFilm}>Ajouter un film</Bouton>{/snippet}
      </EtatVide>
    {/if}
    {#if erreurs.films || erreurs.reprises}
      <p class="alerte" role="status"><Icone nom="alerte" taille={16} /> Une partie de l’accueil n’a pas pu se charger. <button type="button" class="lien-bouton" onclick={charger}>Réessayer</button></p>
    {/if}
  {/if}

  <Installer />
</div>

<style>
  .accueil { display: grid; gap: var(--e-7); }
  .accueil > :global(header) { margin-bottom: calc(var(--e-2) * -1); }

  .hero {
    position: relative; isolation: isolate; overflow: hidden; display: grid; grid-template-columns: 220px 1fr; gap: 36px; align-items: center;
    padding: var(--e-8); border-radius: var(--r-xl); background: var(--s1); border: 1px solid var(--bord); box-shadow: var(--ombre-3);
  }
  /* Carte vedette : dégradé bleu → indigo, texte blanc, jetons locaux pour que tout reste lisible dessus (AA calculé) */
  .hero.ce-soir {
    --texte: #ffffff; --doux: #e8edff; --discret: #dbe2ff;
    background: var(--hero-degrade); border-color: transparent; color: #fff;
    box-shadow: 0 24px 56px -16px rgba(55, 48, 163, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  }
  .hero .puces :global(.badge) { background: rgba(255, 255, 255, 0.2); color: #fff; }
  .hero .compte { color: #fff; }
  .hero :global(.bouton.primaire) { background: #fff; color: #1e3a8a; box-shadow: 0 10px 24px -8px rgba(15, 23, 42, 0.5); }
  .hero :global(.bouton.primaire:hover:not(:disabled)) { background: #eef2ff; box-shadow: 0 14px 30px -8px rgba(15, 23, 42, 0.6); }
  .hero :global(.bouton.secondaire) { background: rgba(255, 255, 255, 0.14); border-color: rgba(255, 255, 255, 0.55); color: #fff; box-shadow: none; }
  .hero :global(.bouton.secondaire:hover:not(:disabled)) { background: rgba(255, 255, 255, 0.24); }
  .hero.chargement { align-items: start; }
  .lignes { display: grid; gap: 14px; }
  .affiche-hero { filter: drop-shadow(0 0 60px color-mix(in srgb, var(--lampe) 30%, transparent)); }
  .affiche-hero :global(.affiche) { box-shadow: var(--lueur-hero); }
  .contenu { display: grid; gap: var(--e-3); min-width: 0; justify-items: start; }
  .puces { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .compte { font-weight: 600; color: var(--lampe); font-size: 16px; }
  .hero h2 { font: 400 clamp(2.25rem, 5vw, 3.375rem) / 1 var(--titre); letter-spacing: -0.01em; text-wrap: balance; }
  .resume { color: var(--doux); max-width: 60ch; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .qui { display: flex; align-items: center; gap: 14px; color: var(--doux); margin: 6px 0 4px; }
  .boutons { display: flex; gap: var(--e-3); flex-wrap: wrap; align-items: center; }
  .aide-hero { color: var(--discret); font-size: 14px; }

  .bloc { display: grid; gap: var(--e-5); }
  .tete-bloc { display: flex; align-items: baseline; justify-content: space-between; gap: var(--e-4); }
  .voir-tout { color: var(--lampe); text-decoration: none; font-weight: 600; font-size: 15px; border-radius: var(--r-s); }
  @media (hover: hover) { .voir-tout:hover { color: var(--lampe-vive); text-decoration: underline; text-underline-offset: 4px; } }
  .rangee { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 28px 20px; }
  .rangee > :global(:nth-child(n + 7)) { display: none; }

  .entete { display: grid; gap: var(--e-2); min-width: 0; justify-items: start; }
  .reprises { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--e-3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); }
  .reprise {
    display: flex; align-items: center; gap: 14px; padding: var(--e-4); min-height: 44px; border-radius: var(--r-l); text-decoration: none; color: var(--texte);
    background: var(--s1); border: 1px solid var(--bord); box-shadow: var(--ombre-1, none);
  }
  .reprise:focus-visible { outline: 3px solid var(--lampe); outline-offset: 2px; }
  @media (hover: hover) { .reprise:hover { border-color: var(--lampe); } }
  .reprise .texte { display: grid; gap: 6px; min-width: 0; flex: 1; }
  .reprise .nom { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reprise .sous { color: var(--doux); font-size: 14px; }
  .reprise .jouer { flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--lampe); color: #fff; }
  .alerte { display: flex; align-items: center; gap: 8px; color: var(--alerte); font-size: 14px; }
  .lien-bouton { background: none; border: 0; padding: 0 4px; color: var(--lampe); font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; min-height: 24px; }

  @media (max-width: 640px) {
    .accueil { gap: var(--e-6); }
    .hero { grid-template-columns: 1fr; padding: var(--e-5); gap: var(--e-4); }
    .hero { grid-template-columns: 84px 1fr; align-items: start; gap: var(--e-3) var(--e-4); }
    .hero.chargement { grid-template-columns: 1fr; }
    .hero .contenu { display: contents; }
    .hero .entete { align-self: center; }
    .hero .resume, .hero .qui, .hero .boutons, .hero .aide-hero { grid-column: 1 / -1; }
    .hero .resume { display: none; }
    .hero h2 { font-size: 1.875rem; }
    .accueil > :global(header) :global(h1) { font-size: clamp(2rem, 9vw, 2.5rem); }
    .reprise { padding: var(--e-3); }
    .rangee.defile {
      display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x proximity; margin: 0 calc(var(--gouttiere) * -1); padding: 4px var(--gouttiere) 8px;
      scrollbar-width: none;
    }
    .rangee.defile::-webkit-scrollbar { display: none; }
    .rangee.defile > :global(*) { flex: none; width: 112px; scroll-snap-align: start; display: block !important; }
    .boutons :global(.bouton) { flex: 1 1 auto; }
  }
</style>
