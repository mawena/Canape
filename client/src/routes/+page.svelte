<script lang="ts">
  import { onMount } from 'svelte';
  import type { Film, ListeSeances, ProgressionFilm, ReponseLienSeance, Seance } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import {
    AfficheFilm, Bouton, Badge, EnTetePage, EtatVide, Icone, Lueur, PileAvatars, Squelette, toast,
    couleurDuTitre, formaterDans, formaterDuree, formaterHeure, formaterJourLong,
  } from '$lib/ui/index.ts';
  import { accroche, autresPersonnes, filmsARreprendre, ouvertureSalle, salleOuverte, seanceDeCeSoir } from '$lib/interface/accueil.ts';
  import Installer from '$lib/interface/Installer.svelte';
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
  const dernierEnCours = $derived(seances?.enCours.find((s) => s.termineeLe === null) ?? null);
  const premierReprise = $derived(aReprendre[0] ?? null);

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
  <EnTetePage taille="affiche" surtitre={dateDuJour} titre={charge ? `${tout.salut} ${tout.suite}` : `${tout.salut}`}>
    {#snippet actions()}
      {#if ceSoir}<Bouton variante="secondaire" icone="plus" href={liens.nouvelleSeance()}>Lancer une séance</Bouton>{/if}
    {/snippet}
  </EnTetePage>

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
    <EtatVide icone="clap" titre="Ta galerie est vide — dépose ton premier film." texte="Dès qu’il est arrivé, il est prêt à regarder : tu pourras lancer une séance et inviter quelqu’un.">
      {#snippet actions()}<Bouton taille="l" icone="televerser" href={liens.ajouterFilm}>Ajouter un film</Bouton>{/snippet}
    </EtatVide>
  {:else}
    <!-- Carte « Ce soir » -->
    {#if ceSoir}
      <section class="hero ce-soir" aria-labelledby="titre-ce-soir">
        <Lueur couleur={lueurCouleur} intensite={0.34} position="gauche" />
        <div class="affiche-hero">
          <AfficheFilm
            {...(filmDeSeance ? { film: filmDeSeance } : { titre: ceSoir.filmTitre ?? 'Film' })}
            etat="pret" sansLegende
          />
        </div>
        <div class="contenu">
          <p class="puces">
            <Badge ton="lampe" icone="calendrier">
              {ceSoir.termineeLe === null && ceSoir.presents > 0 && !ceSoir.prevueLe ? 'Séance en cours' : `${maintenant.getHours() >= 18 ? 'Séance de ce soir' : 'Séance du jour'}${heureSeance ? ` · ${heureSeance}` : ''}`}
            </Badge>
            {#if ceSoir.prevueLe && !ouverte}<span class="compte tn">{formaterDans(ceSoir.prevueLe, maintenant)}</span>{/if}
          </p>
          <h2 id="titre-ce-soir">{ceSoir.filmTitre ?? filmDeSeance?.titre ?? 'Séance'}</h2>
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
            <Bouton taille="l" icone="lecture" href={ouverte ? liens.seance(ceSoir.id) : undefined} disabled={!ouverte}>Entrer dans la salle</Bouton>
            <Bouton variante="secondaire" icone={copie ? 'verifier' : 'lien'} onclick={copierLien}>Copier le lien</Bouton>
          </div>
          {#if !ouverte && ouverture}<p class="aide-hero">La salle ouvre à {formaterHeure(ouverture)}.</p>{/if}
        </div>
      </section>
    {:else}
      <section class="hero sans-seance" aria-labelledby="titre-ce-soir">
        <Lueur couleur={null} intensite={0.22} position="haut-droite" />
        <div class="contenu">
          <p class="puces"><Badge icone="lune">Ce soir</Badge></p>
          <h2 id="titre-ce-soir">Pas de séance ce soir.</h2>
          <p class="resume">Choisis un film, fixe une heure, invite quelqu’un : le salon s’ouvre pour vous deux.</p>
          <div class="boutons">
            <Bouton taille="l" icone="plus" href={liens.nouvelleSeance()}>Lancer une séance</Bouton>
            {#if dernierEnCours}
              <Bouton variante="secondaire" icone="lecture" href={liens.seance(dernierEnCours.id)}>Reprendre {dernierEnCours.filmTitre ?? 'la séance'}</Bouton>
            {:else if premierReprise}
              <Bouton variante="secondaire" icone="lecture" href={lienReprise(premierReprise)}>Reprendre {premierReprise.film.titre}</Bouton>
            {/if}
          </div>
        </div>
      </section>
    {/if}

    {#if erreurs.seances}
      <p class="alerte" role="status"><Icone nom="alerte" taille={16} /> Impossible de charger tes séances. <button type="button" class="lien-bouton" onclick={charger}>Réessayer</button></p>
    {/if}

    <!-- Reprendre -->
    {#if aReprendre.length > 0}
      <section class="bloc" aria-labelledby="titre-reprendre">
        <div class="tete-bloc"><h2 id="titre-reprendre" class="t-titre2">Reprendre</h2></div>
        <div class="rangee defile">
          {#each aReprendre.slice(0, 6) as p (p.film.id)}
            <AfficheFilm
              film={p.film} href={lienReprise(p)} progression={p.duree ? p.position / p.duree : null}
              sousTitre={arrete(p)}
            />
          {/each}
        </div>
      </section>
    {/if}

    <!-- Ajoutés récemment -->
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
    padding: var(--e-7); border-radius: var(--r-l); background: var(--s1); border: 1px solid var(--bord);
  }
  .hero.sans-seance { grid-template-columns: 1fr; padding: var(--e-8) var(--e-7); }
  .hero.chargement { align-items: start; }
  .lignes { display: grid; gap: 14px; }
  .affiche-hero { filter: drop-shadow(0 0 60px color-mix(in srgb, var(--lampe) 30%, transparent)); }
  .affiche-hero :global(.affiche) { box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 90px -10px rgba(244, 168, 91, 0.5); }
  .contenu { display: grid; gap: var(--e-3); min-width: 0; justify-items: start; }
  .puces { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .compte { font-weight: 600; color: var(--lampe); font-size: 16px; }
  h2 { font: 400 clamp(2.25rem, 5vw, 3.375rem) / 1 var(--titre); letter-spacing: -0.01em; text-wrap: balance; }
  .resume { color: var(--doux); max-width: 60ch; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sans-seance .resume { display: block; }
  .qui { display: flex; align-items: center; gap: 14px; color: var(--doux); margin: 6px 0 4px; }
  .boutons { display: flex; gap: var(--e-3); flex-wrap: wrap; align-items: center; }
  .aide-hero { color: var(--discret); font-size: 14px; }

  .bloc { display: grid; gap: var(--e-5); }
  .tete-bloc { display: flex; align-items: baseline; justify-content: space-between; gap: var(--e-4); }
  .voir-tout { color: var(--lampe); text-decoration: none; font-weight: 600; font-size: 15px; border-radius: var(--r-s); }
  @media (hover: hover) { .voir-tout:hover { color: var(--lampe-vive); text-decoration: underline; text-underline-offset: 4px; } }
  .rangee { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 28px 20px; }
  .rangee > :global(:nth-child(n + 7)) { display: none; }

  .alerte { display: flex; align-items: center; gap: 8px; color: var(--alerte); font-size: 14px; }
  .lien-bouton { background: none; border: 0; padding: 0 4px; color: var(--lampe); font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; min-height: 24px; }

  @media (max-width: 640px) {
    .accueil { gap: var(--e-6); }
    .hero { grid-template-columns: 1fr; padding: var(--e-5); gap: var(--e-4); }
    .hero.sans-seance { padding: var(--e-6) var(--e-5); }
    .affiche-hero { width: 120px; }
    .rangee.defile {
      display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x proximity; margin: 0 calc(var(--gouttiere) * -1); padding: 4px var(--gouttiere) 8px;
      scrollbar-width: none;
    }
    .rangee.defile::-webkit-scrollbar { display: none; }
    .rangee.defile > :global(*) { flex: none; width: 112px; scroll-snap-align: start; display: block !important; }
    .boutons :global(.bouton) { flex: 1 1 auto; }
  }
</style>
