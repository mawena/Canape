<script lang="ts">
  /**
   * <PanneauTelechargements />
   * Liste des torrents en cours et finis, à côté du panneau des envois. Sur téléphone : feuille du bas repliable.
   * Le suivi (rafraîchissement) est dans `telechargements.svelte.ts`.
   */
  import type { Telechargement } from '@canape/partage';
  import { BarreProgression, Bouton, Icone, Modale, toast } from '$lib/ui/index.ts';
  import { telechargements } from './telechargements.svelte.ts';
  import ModaleChoixFichiers from './ModaleChoixFichiers.svelte';
  import Lock from '@lucide/svelte/icons/lock';
  import { AIDE_PRIVE, TEXTE_ARRET_PARTAGE, detailChiffres, detailPartage, estEnPartage, estFini, estPrive, fichiersModifiables, libelleEtat, messageTrackerAffiche, nomAffiche, repartir, resumePanneau } from './logique.ts';
  import { raccourcirNom } from '../formats.ts';

  const liste = $derived(telechargements.liste);
  let replie = $state(true);
  let aChoisir: Telechargement | null = $state(null);
  let choixOuvert = $state(false);
  let aAnnuler: Telechargement | null = $state(null);
  let annulerOuvert = $state(false);
  let occupes = $state(new Set<string>());

  const nbEnCours = $derived(telechargements.nbEnCours);
  const groupes = $derived(repartir(liste));
  const resume = $derived(resumePanneau(nbEnCours, groupes.enPartage.length));
  let aides = $state(new Set<string>());
  const basculerAide = (id: string): void => { const n = new Set(aides); if (!n.delete(id)) n.add(id); aides = n; };
  let aArreter: Telechargement | null = $state(null);
  let arretOuvert = $state(false);

  async function agir(t: Telechargement, action: () => Promise<void>): Promise<void> {
    if (occupes.has(t.id)) return;
    occupes = new Set(occupes).add(t.id);
    try { await action(); } catch (e) { toast.erreur(e instanceof Error ? e.message : 'L’action a échoué.'); }
    finally { const s = new Set(occupes); s.delete(t.id); occupes = s; }
  }

  function demanderAnnulation(t: Telechargement): void {
    // Ligne finie : on la retire tout de suite ; en cours : confirmation (les données partielles sont effacées).
    if (estFini(t)) void agir(t, () => telechargements.retirer(t.id));
    else { aAnnuler = t; annulerOuvert = true; }
  }

  const ton = (t: Telechargement): 'lampe' | 'doux' | 'ok' | 'mal' => (t.etat === 'pause' ? 'doux' : t.etat === 'termine' ? 'ok' : t.etat === 'erreur' ? 'mal' : 'lampe');
  const indetermine = (t: Telechargement) => t.octetsTotal === null || t.etat === 'metadonnees';
</script>

{#if liste.length}
  <section class="panneau" class:replie aria-label="Téléchargements" data-test="telechargements">
    <button class="entete" type="button" aria-expanded={!replie} aria-controls="liste-telechargements" onclick={() => (replie = !replie)}>
      <span class="poignee" aria-hidden="true"></span>
      <Icone nom="telecharger" taille={18} />
      <span class="titre">{resume}</span>
      <span class="chevron" aria-hidden="true"><Icone nom="chevron-bas" taille={16} /></span>
    </button>
    <div id="liste-telechargements">
      <ul data-test="telechargements-en-cours">
        {#each groupes.enCours as t (t.id)}{@render ligneTorrent(t)}{/each}
      </ul>
      {#if groupes.enPartage.length}
        <h3 class="sous-titre" data-test="section-partage">Partagés</h3>
        <ul data-test="telechargements-en-partage">
          {#each groupes.enPartage as t (t.id)}{@render ligneTorrent(t)}{/each}
        </ul>
      {/if}
    </div>
    <p class="vh" role="status" aria-live="polite">{telechargements.annonce}</p>
  </section>
{/if}

{#snippet ligneTorrent(t: Telechargement)}
  {@const attente = telechargements.attentePlace(t)}
  {@const partage = estEnPartage(t)}
  {@const message = messageTrackerAffiche(t)}
  <li class="ligne" class:erreur={t.etat === 'erreur'} class:fini={t.etat === 'termine'} class:partage data-test="telechargement" data-etat={t.etat} data-partage={partage ? 'oui' : 'non'} data-prive={estPrive(t) ? 'oui' : 'non'}>
    <div class="haut">
      <span class="icone" aria-hidden="true">
        <Icone nom={partage ? 'partager' : t.etat === 'termine' ? 'verifier' : t.etat === 'erreur' ? 'alerte' : t.etat === 'pause' ? 'pause' : 'telecharger'} />
      </span>
      <span class="nom" title={t.nom ?? ''}>{t.nom ? raccourcirNom(nomAffiche(t)) : nomAffiche(t)}</span>
      <span class="actions">
        {#if t.etat === 'telechargement' || t.etat === 'metadonnees'}
          <Bouton variante="discret" taille="s" icone="pause" aria-label={`Mettre en pause ${nomAffiche(t)}`} data-test="pause-torrent"
            disabled={occupes.has(t.id)} onclick={() => agir(t, () => telechargements.pause(t.id))} />
        {:else if t.etat === 'pause'}
          <Bouton variante="secondaire" taille="s" icone="lecture" aria-label={`Reprendre ${nomAffiche(t)}`} data-test="reprendre-torrent"
            disabled={occupes.has(t.id)} onclick={() => agir(t, () => telechargements.reprendre(t.id))}>Reprendre</Bouton>
        {/if}
        {#if t.fichiers.length > 0 && fichiersModifiables(t)}
          <Bouton variante="discret" taille="s" icone="crayon" aria-label={`Choisir les fichiers de ${nomAffiche(t)}`} data-test="choisir-fichiers"
            onclick={() => { aChoisir = t; choixOuvert = true; }}>Fichiers</Bouton>
        {/if}
        {#if t.etat === 'termine' && t.filmIds.length}
          <Bouton variante="secondaire" taille="s" href={t.filmIds.length === 1 ? `/galerie/${t.filmIds[0]}` : '/galerie'} data-test="voir-film">
            {t.filmIds.length === 1 ? 'Voir le film' : 'Voir la galerie'}
          </Bouton>
        {/if}
        {#if t.etat !== 'import' && !partage}
          <Bouton variante="discret" taille="s" icone="fermer" data-test="annuler-torrent" disabled={occupes.has(t.id)}
            aria-label={estFini(t) ? `Retirer ${nomAffiche(t)} de la liste` : `Annuler le téléchargement de ${nomAffiche(t)}`}
            onclick={() => demanderAnnulation(t)} />
        {/if}
      </span>
    </div>
    {#if t.etat !== 'erreur' && t.etat !== 'annule' && !partage}
      <div data-test="progression-torrent">
        <BarreProgression valeur={indetermine(t) ? null : t.progression} ton={ton(t)} fine libelle={`Progression de ${nomAffiche(t)}`} />
      </div>
    {/if}
    <p class="etat" class:alerte={t.etat === 'erreur'}>
      {#if partage}
        <strong data-test="detail-partage">{detailPartage(t)}</strong>
      {:else}
        <strong class:attente={attente || (t.etat === 'metadonnees' && telechargements.metaLongue(t))}>{libelleEtat(t, attente, telechargements.metaLongue(t))}</strong>
        {#if t.etat === 'telechargement' || t.etat === 'pause'}
          <span class="chiffres tn">{detailChiffres(t, attente)}</span>
        {:else if t.etat === 'metadonnees' && t.pairs > 0}
          <span class="chiffres tn">{detailChiffres(t)}</span>
        {/if}
      {/if}
      {#if estPrive(t)}
        <button type="button" class="prive" data-test="pastille-prive" aria-expanded={aides.has(t.id)} aria-controls={`aide-prive-${t.id}`}
          title={AIDE_PRIVE} onclick={() => basculerAide(t.id)}>
          <Lock size={13} strokeWidth={2} aria-hidden="true" />Privé
        </button>
      {/if}
    </p>
    {#if aides.has(t.id)}
      <p class="aide" id={`aide-prive-${t.id}`} data-test="aide-prive">{AIDE_PRIVE}</p>
    {/if}
    {#if message}
      <p class="tracker" class:mal={t.etat === 'erreur'} data-test="message-tracker"><Icone nom="info" taille={15} /><span>{message}</span></p>
    {/if}
    {#if partage}
      <div class="arret">
        <Bouton variante="secondaire" taille="s" data-test="arreter-partage" disabled={occupes.has(t.id)} aria-label={`Arrêter de partager ${nomAffiche(t)}`}
          onclick={() => { aArreter = t; arretOuvert = true; }}>Arrêter de partager</Bouton>
      </div>
    {/if}
    {#if t.proprietairePrenom && liste.some((x) => x.proprietaireId !== t.proprietaireId)}
      <p class="proprio">Ajouté par {t.proprietairePrenom}</p>
    {/if}
  </li>
{/snippet}

<ModaleChoixFichiers bind:ouverte={choixOuvert} telechargement={aChoisir ? (liste.find((x) => x.id === aChoisir!.id) ?? aChoisir) : null} />

<Modale bind:ouverte={arretOuvert} titre="Arrêter de partager ?">
  <p>{TEXTE_ARRET_PARTAGE}</p>
  {#snippet pied()}
    <Bouton variante="discret" onclick={() => (arretOuvert = false)}>Continuer</Bouton>
    <Bouton variante="primaire" data-test="confirmer-arret-partage" onclick={() => { const t = aArreter; arretOuvert = false; if (t) void agir(t, () => telechargements.retirer(t.id)); }}>Arrêter de partager</Bouton>
  {/snippet}
</Modale>

<Modale bind:ouverte={annulerOuvert} titre="Annuler ce téléchargement ?" dangereuse>
  <p>« {aAnnuler ? nomAffiche(aAnnuler) : ''} » sera arrêté et ce qui a déjà été téléchargé sera effacé. Les films déjà ajoutés à ta galerie restent.</p>
  {#snippet pied()}
    <Bouton variante="discret" onclick={() => (annulerOuvert = false)}>Garder</Bouton>
    <Bouton variante="danger" confirme onclick={() => { const t = aAnnuler; annulerOuvert = false; if (t) void agir(t, () => telechargements.retirer(t.id)); }}>Annuler le téléchargement</Bouton>
  {/snippet}
</Modale>

<style>
  .panneau { background: var(--s1); border: 1px solid var(--bord); border-radius: var(--r-m); padding: 4px var(--e-4); }
  .entete { display: none; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; }
  .sous-titre { margin: var(--e-2) 0 0; padding-top: var(--e-3); border-top: 1px solid var(--bord-champ); font: 600 0.875rem/1.2 var(--texte-police); color: var(--doux); }
  .partage .icone { color: var(--lampe); }
  .prive { display: inline-flex; align-items: center; gap: 5px; min-height: 24px; padding: 0 9px; border: 0; border-radius: var(--r-pill); background: var(--s2); color: var(--doux);
    font: 600 0.75rem/1 var(--texte-police); cursor: pointer; }
  .prive:hover { color: var(--texte); }
  .prive:focus-visible { outline: 2px solid var(--lampe); outline-offset: 2px; }
  .aide { margin: 0; padding: 8px 12px; border-radius: var(--r-s, 8px); background: var(--s2); color: var(--doux); font-size: 0.8125rem; line-height: 1.45; }
  .tracker { margin: 0; display: flex; align-items: flex-start; gap: 6px; padding: 7px 10px; border-radius: var(--r-s, 8px); background: var(--alerte-fond); color: var(--alerte); font-size: 0.8125rem; line-height: 1.4; }
  .tracker :global(svg) { flex: none; margin-top: 1px; }
  .tracker.mal { background: var(--mal-fond, var(--alerte-fond)); color: var(--mal); }
  .arret { display: flex; }
  .ligne { display: grid; gap: 8px; padding: var(--e-3) 0; min-width: 0; }
  #liste-telechargements, ul, .haut { min-width: 0; }
  ul, .ligne { grid-template-columns: minmax(0, 1fr); }
  .ligne + .ligne { border-top: 1px solid var(--bord); }
  .haut { display: flex; align-items: center; gap: 10px; }
  .icone { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 10px; background: var(--s2); color: var(--lampe); }
  .fini .icone { color: var(--ok); }
  .erreur .icone { color: var(--mal); }
  .nom { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
  .etat { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 0.875rem; color: var(--doux); }
  .etat strong { color: var(--texte); font-weight: 500; }
  .etat strong.attente { color: var(--alerte); }
  .alerte, .alerte strong { color: var(--mal); }
  .proprio { margin: 0; font-size: 0.8125rem; color: var(--discret); }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }

  /* Téléphone : feuille du bas, repliée par défaut (au-dessus de la barre d'onglets). */
  @media (max-width: 640px) {
    .panneau { position: fixed; left: 8px; right: 8px; bottom: calc(var(--barre-onglets) + 8px + env(safe-area-inset-bottom, 0px)); z-index: 30;
      max-height: 62vh; overflow-y: auto; padding-top: 0; box-shadow: var(--ombre-3); background: var(--fond-verre); backdrop-filter: var(--flou-verre); border-radius: var(--r-l); }
    .entete { display: flex; align-items: center; gap: 10px; position: sticky; top: 0; width: 100%; min-height: 52px; padding: 0; background: none; border: 0; color: var(--texte); text-align: left; cursor: pointer; }
    .poignee { position: absolute; top: 6px; left: 50%; width: 36px; height: 4px; margin-left: -18px; border-radius: 2px; background: var(--bord-champ); }
    .titre { flex: 1; }
    .chevron { display: grid; transform: rotate(180deg); transition: transform var(--d-2) var(--ease); }
    .replie .chevron { transform: none; }
    .replie #liste-telechargements { display: none; }
  }
</style>
