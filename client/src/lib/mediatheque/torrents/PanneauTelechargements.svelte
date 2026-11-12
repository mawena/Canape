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
  import { detailChiffres, estFini, fichiersModifiables, libelleEtat, nomAffiche } from './logique.ts';
  import { raccourcirNom } from '../formats.ts';

  const liste = $derived(telechargements.liste);
  let replie = $state(true);
  let aChoisir: Telechargement | null = $state(null);
  let choixOuvert = $state(false);
  let aAnnuler: Telechargement | null = $state(null);
  let annulerOuvert = $state(false);
  let occupes = $state(new Set<string>());

  const nbEnCours = $derived(telechargements.nbEnCours);
  const resume = $derived(nbEnCours > 0 ? `${nbEnCours} téléchargement${nbEnCours > 1 ? 's' : ''} en cours` : 'Téléchargements');

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
    <ul id="liste-telechargements">
      {#each liste as t (t.id)}
        {@const attente = telechargements.attentePlace(t)}
        {@const p = Math.round(t.progression * 100)}
        <li class="ligne" class:erreur={t.etat === 'erreur'} class:fini={t.etat === 'termine'} data-test="telechargement" data-etat={t.etat}>
          <div class="haut">
            <span class="icone" aria-hidden="true">
              <Icone nom={t.etat === 'termine' ? 'verifier' : t.etat === 'erreur' ? 'alerte' : t.etat === 'pause' ? 'pause' : 'telecharger'} />
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
              {#if t.etat !== 'import'}
                <Bouton variante="discret" taille="s" icone="fermer" data-test="annuler-torrent" disabled={occupes.has(t.id)}
                  aria-label={estFini(t) ? `Retirer ${nomAffiche(t)} de la liste` : `Annuler le téléchargement de ${nomAffiche(t)}`}
                  onclick={() => demanderAnnulation(t)} />
              {/if}
            </span>
          </div>
          {#if t.etat !== 'erreur' && t.etat !== 'annule'}
            <div data-test="progression-torrent">
              <BarreProgression valeur={indetermine(t) ? null : t.progression} ton={ton(t)} fine libelle={`Progression de ${nomAffiche(t)}`} />
            </div>
          {/if}
          <p class="etat" class:alerte={t.etat === 'erreur'}>
            <strong class:attente>{libelleEtat(t, attente)}</strong>
            {#if t.etat === 'telechargement' || t.etat === 'pause'}
              <span class="chiffres tn">{detailChiffres(t, attente)}</span>
            {:else if t.etat === 'metadonnees' && t.pairs > 0}
              <span class="chiffres tn">{detailChiffres(t)}</span>
            {/if}
          </p>
          {#if t.proprietairePrenom && liste.some((x) => x.proprietaireId !== t.proprietaireId)}
            <p class="proprio">Ajouté par {t.proprietairePrenom}</p>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="vh" role="status" aria-live="polite">{telechargements.annonce}</p>
  </section>
{/if}

<ModaleChoixFichiers bind:ouverte={choixOuvert} telechargement={aChoisir ? (liste.find((x) => x.id === aChoisir!.id) ?? aChoisir) : null} />

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
  .ligne { display: grid; gap: 8px; padding: var(--e-3) 0; }
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
    .replie ul { display: none; }
  }
</style>
