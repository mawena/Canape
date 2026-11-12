<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { CandidatTmdb, Film, Visibilite, UtilisateurPublic } from '@canape/partage';
  import { ErreurApi } from '$lib/api/client.ts';
  import {
    ajouterSousTitre, appliquerTmdb, listerComptes, modifierFilm, obtenirFilm, rechercherTmdb, retirerSousTitre, supprimerFilm, urlImage,
  } from '$lib/mediatheque/api.ts';
  import { formaterDuree, formaterTaille, libelleCanaux, nomLangue } from '$lib/mediatheque/formats.ts';
  import { Bouton, Champ, Chargement, EtatVide, Icone, Modale, toast } from '$lib/ui/index.ts';
  import Lecteur from '$lib/lecture/Lecteur.svelte';
  import Preparation from '$lib/lecture/Preparation.svelte';

  const id = $derived(page.params['id'] ?? '');
  let film: Film | null = $state(null);
  let regarderSeul = $state(false);
  let introuvable = $state(false);
  let erreur: string | null = $state(null);

  // Modification
  let edition = $state(false);
  let titre = $state('');
  let annee = $state('');
  let resume = $state('');
  let enregistrement = $state(false);

  // Partage
  let comptes: UtilisateurPublic[] = $state([]);
  let visibilite: Visibilite = $state('prive');
  let choisis: number[] = $state([]);

  // TMDB
  let requeteTmdb = $state('');
  let candidats: CandidatTmdb[] | null = $state(null);
  let rechercheTmdb = $state(false);

  // Sous-titres
  let selecteurSt: HTMLInputElement | undefined = $state();

  // Suppression
  let confirmation = $state(false);

  function adopter(f: Film): void {
    film = f;
    visibilite = f.visibilite;
    choisis = [...f.partages];
  }

  async function charger(): Promise<void> {
    try {
      adopter(await obtenirFilm(id));
      introuvable = false;
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) introuvable = true;
      else erreur = e instanceof ErreurApi ? e.message : 'Impossible de charger ce film.';
    }
  }

  $effect(() => { void id; film = null; introuvable = false; void charger(); });
  $effect(() => {
    if (film?.modifiable) listerComptes().then((l) => { comptes = l; }, () => undefined);
  });
  // Analyse en cours : on revient voir régulièrement.
  $effect(() => {
    if (film?.etat !== 'analyse') return;
    const i = setInterval(() => void charger(), 2500);
    return () => clearInterval(i);
  });

  const autres = $derived(comptes.filter((c) => c.id !== film?.proprietaireId));

  function commencerEdition(): void {
    if (!film) return;
    titre = film.titre; annee = film.annee ? String(film.annee) : ''; resume = film.resume ?? '';
    requeteTmdb = film.titre;
    candidats = null;
    edition = true;
  }

  async function enregistrer(): Promise<void> {
    if (!film) return;
    enregistrement = true;
    try {
      const n = annee.trim() === '' ? null : Number(annee);
      adopter(await modifierFilm(film.id, { titre, annee: n, resume: resume.trim() || null }));
      edition = false;
      toast.ok('Fiche enregistrée.');
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'Impossible d’enregistrer.');
    } finally { enregistrement = false; }
  }

  async function enregistrerPartage(): Promise<void> {
    if (!film) return;
    try {
      adopter(await modifierFilm(film.id, { visibilite, partages: visibilite === 'partage' ? choisis : [] }));
      toast.ok('Partage mis à jour.');
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'Impossible de changer le partage.');
    }
  }

  function basculer(idCompte: number): void {
    choisis = choisis.includes(idCompte) ? choisis.filter((x) => x !== idCompte) : [...choisis, idCompte];
  }

  async function chercherTmdb(): Promise<void> {
    if (!film) return;
    rechercheTmdb = true;
    try { candidats = await rechercherTmdb(film.id, requeteTmdb); }
    catch (e) { toast.erreur(e instanceof ErreurApi ? e.message : 'Recherche impossible.'); candidats = null; }
    finally { rechercheTmdb = false; }
  }

  async function choisirTmdb(c: CandidatTmdb): Promise<void> {
    if (!film) return;
    try { adopter(await appliquerTmdb(film.id, c.tmdbId)); candidats = null; edition = false; toast.ok(`« ${c.titre} » appliqué à la fiche.`); }
    catch (e) { toast.erreur(e instanceof ErreurApi ? e.message : 'Impossible d’appliquer cette fiche.'); }
  }

  async function envoyerSousTitres(): Promise<void> {
    if (!film || !selecteurSt?.files?.length) return;
    const f = selecteurSt.files[0]!;
    try { await ajouterSousTitre(film.id, f); adopter(await obtenirFilm(film.id)); toast.ok('Sous-titres ajoutés.'); }
    catch (e) { toast.erreur(e instanceof ErreurApi ? e.message : 'Envoi impossible.'); }
    finally { if (selecteurSt) selecteurSt.value = ''; }
  }

  async function retirerSt(sid: number): Promise<void> {
    if (!film) return;
    try { await retirerSousTitre(film.id, sid); adopter(await obtenirFilm(film.id)); }
    catch (e) { toast.erreur(e instanceof ErreurApi ? e.message : 'Suppression impossible.'); }
  }

  async function supprimer(): Promise<void> {
    if (!film) return;
    try { await supprimerFilm(film.id); toast.ok(`« ${film.titre} » est supprimé.`); await goto('/galerie'); }
    catch (e) { toast.erreur(e instanceof ErreurApi ? e.message : 'Suppression impossible.'); confirmation = false; }
  }

  const resumeTechnique = $derived.by(() => {
    const v = film?.analyse?.video;
    if (!v) return [];
    const l: string[] = [];
    if (v.largeur) l.push(`${v.largeur} × ${v.hauteur}`);
    l.push(v.codec.toUpperCase());
    if (v.profondeurBits > 8) l.push(`${v.profondeurBits} bits`);
    if (v.hdrType === 'dolby-vision') l.push(v.dvProfil ? `Dolby Vision (profil ${v.dvProfil})` : 'Dolby Vision');
    else if (v.hdrType === 'hdr10') l.push('HDR10');
    else if (v.hdrType === 'hlg') l.push('HLG');
    return l;
  });
</script>

<svelte:head><title>{film ? `${film.titre} · Canapé` : 'Film · Canapé'}</title></svelte:head>

<main>
  <p class="retour"><a href="/galerie">← Tous les films</a></p>

  {#if introuvable}
    <EtatVide titre="Ce film n’existe pas" texte="Il a été supprimé, ou tu n’y as pas accès." />
  {:else if erreur}
    <p class="erreur" role="alert">{erreur}</p>
  {:else if !film}
    <Chargement />
  {:else}
    {@const f = film}
    <div class="fond" aria-hidden="true">
      {#if f.aFond}<img src={urlImage(f, 'fond')} alt="" />{/if}
    </div>
    <article class="fiche" style:--lueur={f.couleur ?? '#3b82f6'}>
      <div class="affiche-bloc">
        <div class="affiche">
          {#if f.aAffiche}<img src={urlImage(f, 'affiche')} alt={`Affiche de ${f.titre}`} />{:else}<span>{f.titre}</span>{/if}
        </div>
      </div>

      <div class="contenu">
        <h1>{f.titre}</h1>
        <p class="sous-titre">{[f.annee, formaterDuree(f.duree), f.genres.join(', ')].filter(Boolean).join(' · ')}</p>

        {#if f.etat === 'analyse'}
          <p class="puce alerte" role="status">Analyse du film en cours…</p>
        {:else if f.etat === 'erreur'}
          <p class="puce mal" role="alert"><Icone nom="alerte" taille={16} /> {f.erreur ?? 'Ce fichier est illisible.'}</p>
        {/if}

        {#if f.resume}<p class="resume">{f.resume}</p>{/if}

        {#if f.etat === 'pret' && f.analyse}
          <ul class="puces">
            {#each resumeTechnique as p}<li class="puce">{p}</li>{/each}
            <li class="puce">{f.analyse.audio.length} piste{f.analyse.audio.length > 1 ? 's' : ''} audio</li>
            {#if f.analyse.sousTitres.length || f.sousTitresExternes?.length}
              <li class="puce">Sous-titres : {[...new Set([...f.analyse.sousTitres.map((s) => nomLangue(s.langue)), ...(f.sousTitresExternes ?? []).map((s) => nomLangue(s.langue))])].join(', ')}</li>
            {/if}
          </ul>
        {/if}

        <div class="actions">
          {#if f.etat === 'pret'}
            <Bouton href={`/seances/nouvelle?film=${f.id}`} icone="lecture">Lancer une séance</Bouton>
            <Bouton variante="secondaire" onclick={() => { regarderSeul = !regarderSeul; }}>{regarderSeul ? 'Fermer le lecteur' : 'Regarder seul'}</Bouton>
          {/if}
          {#if f.modifiable}
            <Bouton variante="secondaire" icone="reglages" onclick={commencerEdition}>Modifier la fiche</Bouton>
            <Bouton variante="discret" icone="supprimer" onclick={() => { confirmation = true; }}>Supprimer</Bouton>
          {/if}
        </div>

        {#if regarderSeul && f.etat === 'pret'}
          <div class="section" data-test="lecteur-seul"><Lecteur filmId={f.id} /></div>
        {/if}

        {#if f.etat === 'pret' && f.modifiable}
          <Preparation filmId={f.id} />
        {/if}

        {#if f.etat === 'pret' && f.analyse}
          <details class="section" open>
            <summary>Pistes et sous-titres</summary>
            <h3>Audio</h3>
            <ul class="liste">
              {#each f.analyse.audio as a (a.index)}
                <li>{nomLangue(a.langue)}{a.titre ? ` — ${a.titre}` : ''} <span class="discret">· {a.codec.toUpperCase()} {libelleCanaux(a.canaux)}{a.parDefaut ? ' · par défaut' : ''}</span></li>
              {:else}
                <li class="discret">Aucune piste audio.</li>
              {/each}
            </ul>
            <h3>Sous-titres</h3>
            <ul class="liste">
              {#each f.analyse.sousTitres as s (s.index)}
                <li>{nomLangue(s.langue)}{s.titre ? ` — ${s.titre}` : ''}
                  <span class="discret">· {s.force ? 'forcés · ' : ''}{s.sdh ? 'malentendants · ' : ''}{s.texte ? 'texte' : 'image (non affichable)'}</span></li>
              {/each}
              {#each f.sousTitresExternes ?? [] as s (s.id)}
                <li>{s.libelle} <span class="discret">· ajouté</span>
                  {#if f.modifiable}<button class="lien" type="button" onclick={() => retirerSt(s.id)} aria-label={`Retirer les sous-titres ${s.libelle}`}>retirer</button>{/if}</li>
              {/each}
              {#if !f.analyse.sousTitres.length && !f.sousTitresExternes?.length}<li class="discret">Aucun sous-titre.</li>{/if}
            </ul>
            {#if f.modifiable}
              <p><Bouton variante="secondaire" taille="s" icone="sous-titres" onclick={() => selecteurSt?.click()}>Ajouter des sous-titres (.srt, .vtt)</Bouton></p>
              <input bind:this={selecteurSt} type="file" accept=".srt,.vtt" hidden onchange={envoyerSousTitres} />
            {/if}
          </details>

          <details class="section">
            <summary>Détails techniques</summary>
            <dl>
              <dt>Fichier</dt><dd>{f.nomOrigine} · {formaterTaille(f.taille)}</dd>
              <dt>Conteneur</dt><dd>{f.analyse.conteneur}</dd>
              {#if f.analyse.video}<dt>Image</dt><dd>{resumeTechnique.join(' · ')}{f.analyse.video.fps ? ` · ${f.analyse.video.fps} images/s` : ''}</dd>{/if}
              <dt>Ajouté par</dt><dd>{f.proprietairePrenom}</dd>
            </dl>
          </details>
        {/if}

        {#if f.modifiable}
          <details class="section">
            <summary>Partage</summary>
            <fieldset>
              <legend class="vh">Qui peut voir ce film</legend>
              {#each [['prive', 'Personne d’autre'], ['partage', 'Certaines personnes'], ['tous', 'Tout le monde']] as [v, l]}
                <label class="radio"><input type="radio" name="visibilite" value={v} bind:group={visibilite} /> {l}</label>
              {/each}
            </fieldset>
            {#if visibilite === 'partage'}
              <ul class="liste comptes">
                {#each autres as c (c.id)}
                  <li><label class="radio"><input type="checkbox" checked={choisis.includes(c.id)} onchange={() => basculer(c.id)} /> {c.prenom}</label></li>
                {:else}
                  <li class="discret">Il n’y a pas d’autre compte pour l’instant.</li>
                {/each}
              </ul>
            {/if}
            <p><Bouton variante="secondaire" onclick={enregistrerPartage}>Enregistrer le partage</Bouton></p>
          </details>
        {/if}
      </div>
    </article>

    <Modale bind:ouverte={edition} titre="Modifier la fiche">
      <form class="formulaire" onsubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
        <Champ libelle="Titre" bind:value={titre} required maxlength={300} />
        <Champ libelle="Année" bind:value={annee} inputmode="numeric" pattern="[0-9]{'{4}'}" placeholder="2024" />
        <label class="zone"><span>Résumé</span><textarea bind:value={resume} rows="5" maxlength="5000"></textarea></label>
        <div class="tmdb">
          <p class="discret">Retrouver la fiche sur TMDB (affiche, résumé, genres)</p>
          <div class="rangee">
            <input class="recherche" bind:value={requeteTmdb} aria-label="Titre à chercher sur TMDB" />
            <Bouton variante="secondaire" chargement={rechercheTmdb} onclick={chercherTmdb}>Chercher</Bouton>
          </div>
          {#if candidats}
            <ul class="candidats">
              {#each candidats as c (c.tmdbId)}
                <li><button type="button" onclick={() => choisirTmdb(c)}>
                  <strong>{c.titre}</strong> <span class="discret">{c.annee ?? ''}</span>
                  {#if c.resume}<small>{c.resume.slice(0, 110)}{c.resume.length > 110 ? '…' : ''}</small>{/if}
                </button></li>
              {:else}<li class="discret">Aucun résultat.</li>{/each}
            </ul>
          {/if}
        </div>
        <div class="boutons">
          <Bouton variante="discret" onclick={() => { edition = false; }}>Annuler</Bouton>
          <Bouton type="submit" chargement={enregistrement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>

    <Modale bind:ouverte={confirmation} titre={`Supprimer « ${f.titre} » ?`}>
      <p>Le fichier et la fiche seront effacés pour de bon. Les séances prévues avec ce film seront annulées.</p>
      {#snippet pied()}
        <Bouton variante="discret" onclick={() => { confirmation = false; }}>Garder</Bouton>
        <Bouton variante="danger" icone="supprimer" onclick={supprimer}>Supprimer</Bouton>
      {/snippet}
    </Modale>
  {/if}
</main>

<style>
  main { position: relative; max-width: 1100px; margin: 0 auto; padding: 0 0 64px; }
  .retour a { color: var(--doux); text-decoration: none; display: inline-flex; align-items: center; min-height: 44px; font-weight: 600; }
  .retour a:hover { color: var(--texte); }
  .fond { position: absolute; top: -44px; left: 50%; width: 100vw; transform: translateX(-50%); height: 520px; overflow: hidden; z-index: -1; mask-image: linear-gradient(#000, transparent); -webkit-mask-image: linear-gradient(#000, transparent); opacity: 0.4; }
  .fond img { width: 100%; height: 100%; object-fit: cover; filter: blur(28px) saturate(1.3); transform: scale(1.15); }
  .fiche { display: grid; gap: 28px; margin-top: 12px; }
  @media (min-width: 760px) { .fiche { grid-template-columns: 280px minmax(0, 1fr); } }
  .affiche-bloc { display: grid; justify-items: center; align-content: start; }
  .affiche { width: min(280px, 60vw); aspect-ratio: 2 / 3; border-radius: var(--r-l); overflow: hidden; background: var(--s2); box-shadow: 0 30px 70px color-mix(in srgb, var(--lueur) 40%, transparent), 0 8px 24px rgba(6, 5, 10, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.07); display: grid; place-items: end start; }
  .affiche img { width: 100%; height: 100%; object-fit: cover; }
  .affiche span { padding: 16px; font-family: var(--titre, 'Instrument Serif', Georgia, serif); font-size: 1.6rem; }
  h1 { font-family: var(--titre, 'Instrument Serif', Georgia, serif); font-size: clamp(2rem, 5vw, 3rem); line-height: 1.05; margin: 0; font-weight: 400; }
  .sous-titre { color: var(--doux, #c0bacb); margin: 6px 0 14px; }
  .resume { max-width: 65ch; color: var(--texte, #f7f3ee); line-height: 1.55; }
  .puces { list-style: none; padding: 0; margin: 14px 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .puce { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 12px; border-radius: 999px; background: var(--s2); border: 1px solid var(--bord); font-size: 0.8125rem; font-weight: 600; color: var(--doux); margin: 0; }
  .puce.alerte { color: var(--alerte, #ffd166); }
  .puce.mal { color: var(--mal, #ff7b6e); }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 24px 0; }
  .section { border-top: 1px solid var(--bord, #2f2c3b); padding: 14px 0; }
  .section summary { cursor: pointer; font-weight: 650; min-height: 44px; display: flex; align-items: center; }
  .section h3 { font-family: inherit; font-size: 0.9rem; font-weight: 650; color: var(--doux); margin: 14px 0 6px; }
  .liste { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
  .discret { color: var(--discret, #9f99ad); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; }
  dt { color: var(--discret, #9f99ad); } dd { margin: 0; overflow-wrap: anywhere; }
  .lien { background: none; border: 0; color: var(--lampe, #1f5ce0); text-decoration: underline; padding: 0 4px; }
  fieldset { border: 0; padding: 0; margin: 12px 0; display: grid; gap: 8px; }
  .radio { display: inline-flex; gap: 8px; align-items: center; }
  .comptes { margin: 8px 0 12px 4px; }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .erreur { color: var(--mal, #ff7b6e); }
  .formulaire { display: grid; gap: 14px; }
  .zone { display: grid; gap: 6px; font-size: 0.85rem; color: var(--doux, #c0bacb); }
  textarea, .recherche { background: var(--s2, #1d1b26); border: 1px solid var(--bord-champ, #7d7790); border-radius: var(--r-m); padding: 12px 14px; color: var(--texte); font: inherit; width: 100%; }
  .rangee { display: flex; gap: 8px; }
  .candidats { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 6px; max-height: 220px; overflow: auto; }
  .candidats button { width: 100%; text-align: left; background: var(--s1, #15141c); border: 1px solid var(--bord, #2f2c3b); border-radius: 10px; padding: 8px 10px; display: grid; gap: 2px; }
  .candidats button:hover { border-color: var(--lampe, #1f5ce0); }
  .candidats small { color: var(--discret, #9f99ad); }
  .boutons { display: flex; justify-content: flex-end; gap: 8px; }
</style>
