<script lang="ts">
  /**
   * <AfficheFilm film={film} href="/galerie/…" progression={0.4} sousTitre="Arrêté à 0 h 52 · avec Léa" />
   * Carte d'affiche 2:3 (rayon 10, ombre niveau 2) ; au survol : monte de 4 px + « lueur » colorée (`couleur` `#rrggbb`, repli lampe
   * ou teinte du titre). Sans image : dégradé dérivé du titre + titre en Instrument Serif. Toute la carte est un lien (`<a>`) si `href`.
   * Sous l'affiche : titre (2 lignes) et « année · durée ».
   * - `film` : un `Film` de `@canape/partage` (ou `{ id, titre, annee, duree, etat, aAffiche, visibilite? }`) ; sert de valeurs par défaut.
   * - `titre`, `annee`, `dureeSecondes`, `imageSrc` (URL ; `/api/films/<id>/affiche` si `film.aAffiche`), `couleur`, `etat`
   *   (`pret` | `analyse` | `erreur`), `preparation` (0–1, affiche « Préparation 62 % »), `partage`, `nouveau`.
   * - `progression` : 0–1, barre de reprise (5 px lampe au pied). `sousTitre` : remplace « année · durée ».
   * - `taille` : `normal` ou `petit` (rangées défilantes du téléphone). `selectionnable`/`selectionne`/`surSelection` : case en coin.
   */
  import { couleurValide, formaterDuree, teinteTitre } from './format.ts';
  import Badge from './Badge.svelte';
  import Icone from './Icone.svelte';

  interface FilmLike {
    id: string;
    titre: string;
    annee: number | null;
    duree: number | null;
    etat?: 'analyse' | 'pret' | 'erreur';
    aAffiche?: boolean;
    visibilite?: string;
    proprietairePrenom?: string;
    couleur?: string | null;
    versionImages?: number;
  }
  interface Props {
    film?: FilmLike;
    titre?: string;
    annee?: number | null;
    dureeSecondes?: number | null;
    href?: string;
    imageSrc?: string | null;
    couleur?: string | null;
    etat?: 'analyse' | 'pret' | 'erreur';
    preparation?: number | null;
    partage?: boolean;
    nouveau?: boolean;
    progression?: number | null;
    sousTitre?: string;
    taille?: 'normal' | 'petit';
    selectionnable?: boolean;
    selectionne?: boolean;
    surSelection?: (selectionne: boolean) => void;
    surClic?: (e: MouseEvent) => void;
    /** Masque titre et détail sous l'affiche (déjà écrits à côté, ex. carte « Ce soir »). */
    sansLegende?: boolean;
  }
  let {
    film, titre, annee, dureeSecondes, href, imageSrc, couleur = null, etat, preparation = null, partage = false,
    nouveau = false, progression = null, sousTitre, taille = 'normal', selectionnable = false, selectionne = false, surSelection, surClic, sansLegende = false,
  }: Props = $props();

  const t = $derived(titre ?? film?.titre ?? '');
  const a = $derived(annee !== undefined ? annee : (film?.annee ?? null));
  const d = $derived(dureeSecondes !== undefined ? dureeSecondes : (film?.duree ?? null));
  const e = $derived(etat ?? film?.etat ?? 'pret');
  const src = $derived(imageSrc !== undefined ? imageSrc : film?.aAffiche ? `/api/films/${film.id}/affiche?v=${film.versionImages ?? 0}` : null);
  const estPartage = $derived(partage || film?.visibilite === 'partage' || film?.visibilite === 'tous');
  let imageEnErreur = $state(false);
  const avecImage = $derived(!!src && !imageEnErreur);
  const teinte = $derived(teinteTitre(t));
  // Couleur dominante calculée par la médiathèque (`film.couleur`), sauf couleur donnée explicitement.
  const lueur = $derived(couleurValide(couleur ?? film?.couleur ?? null) ?? (avecImage ? '#3b82f6' : `hsl(${teinte} 60% 55%)`));
  const detail = $derived([a, d ? formaterDuree(d) : ''].filter(Boolean).join(' · '));
  const pctPrep = $derived(preparation === null ? null : Math.round(preparation * 100));
  const nomEtat = $derived(e === 'pret' ? 'prêt' : e === 'analyse' ? 'préparation en cours' : 'illisible');
  const etiquette = $derived([t, a, d ? formaterDuree(d) : '', nomEtat].filter(Boolean).join(', '));
  const pct = $derived(progression === null ? null : Math.round(Math.min(1, Math.max(0, progression)) * 100));
</script>

{#snippet visuel()}
  <span class="affiche" class:sans={!avecImage} style:--h1="hsl({teinte} 38% 30%)" style:--h2="hsl({teinte} 38% 12%)">
    {#if avecImage}
      <img src={src} alt="" loading="lazy" decoding="async" onerror={() => (imageEnErreur = true)} />
    {:else}
      <span class="titre-affiche" lang="fr">{t}</span>
      {#if a}<span class="annee-affiche">{a}</span>{/if}
    {/if}
    <span class="badges">
      {#if e === 'analyse'}<Badge ton="alerte" surImage icone="horloge">{pctPrep === null ? 'Préparation' : `Préparation ${pctPrep} %`}</Badge>
      {:else if e === 'erreur'}<Badge ton="mal" surImage icone="alerte">Illisible</Badge>
      {:else if nouveau}<Badge ton="lampe" surImage>Nouveau</Badge>{/if}
      {#if estPartage && e === 'pret' && !nouveau}<Badge ton="rose" surImage icone="utilisateurs">Partagé</Badge>{/if}
    </span>
    {#if pct !== null}<span class="progres" aria-hidden="true"><i style:width="{pct}%"></i></span>{/if}
  </span>
{/snippet}

<div class="carte-film {taille}" style:--lueur={lueur}>
  {#if href}
    <a {href} class="lien" aria-label={etiquette} onclick={surClic}>
      {@render visuel()}
      {#if !sansLegende}
      <span class="textes">
        <span class="nom">{t}</span>
        {#if sousTitre || detail}<span class="detail">{sousTitre ?? detail}</span>{/if}
      </span>
      {/if}
    </a>
  {:else}
    <div class="lien" role="group" aria-label={etiquette}>
      {@render visuel()}
      {#if !sansLegende}
      <span class="textes">
        <span class="nom">{t}</span>
        {#if sousTitre || detail}<span class="detail">{sousTitre ?? detail}</span>{/if}
      </span>
      {/if}
    </div>
  {/if}
  {#if selectionnable}
    <label class="case">
      <input type="checkbox" checked={selectionne} onchange={(ev) => surSelection?.(ev.currentTarget.checked)} />
      <span class="vh">Sélectionner {t}</span>
      <span class="coche" aria-hidden="true"><Icone nom="verifier" taille={16} /></span>
    </label>
  {/if}
</div>

<style>
  .carte-film { position: relative; min-width: 0; }
  .lien { display: grid; gap: 10px; color: inherit; text-decoration: none; min-width: 0; border-radius: var(--r-affiche); }
  .lien:focus-visible { outline: none; }
  .lien:focus-visible .affiche { outline: 3px solid var(--lampe-vive); outline-offset: 3px; }
  .affiche {
    position: relative; display: block; aspect-ratio: 2 / 3; border-radius: var(--r-affiche); overflow: hidden; isolation: isolate;
    background: var(--s2); box-shadow: var(--ombre-2), 0 0 0 1px rgba(255, 255, 255, 0.06);
    transition: transform var(--d-2) var(--ease), box-shadow var(--d-2) var(--ease);
  }
  @media (hover: hover) {
    .lien:hover .affiche { transform: translateY(-4px); box-shadow: 0 18px 36px rgba(0, 0, 0, 0.5), 0 0 40px -6px var(--lueur); }
  }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .affiche.sans { background: linear-gradient(160deg, var(--h1), var(--h2)); }
  .affiche.sans::before { content: ''; position: absolute; inset: 0; background: radial-gradient(120% 70% at 50% 100%, rgba(0, 0, 0, 0.55), transparent 70%); }
  .titre-affiche {
    position: absolute; left: 12px; right: 12px; bottom: 34px; z-index: 1; color: #fff;
    font: 400 24px / 1 var(--titre); text-shadow: 0 2px 16px rgba(0, 0, 0, 0.45);
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere;
  }
  .annee-affiche { position: absolute; left: 12px; bottom: 12px; z-index: 1; color: rgba(255, 255, 255, 0.85); font: 500 12px / 1 var(--texte-police); }
  .petit .titre-affiche { font-size: 19px; bottom: 28px; left: 9px; right: 9px; }
  .badges { position: absolute; top: 8px; left: 8px; z-index: 2; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .progres { position: absolute; left: 0; right: 0; bottom: 0; height: 5px; background: rgba(0, 0, 0, 0.5); z-index: 2; }
  .progres i { display: block; height: 100%; background: var(--lampe); }
  .textes { display: grid; gap: 2px; min-width: 0; }
  .nom { font: 650 15px / 1.25 var(--texte-police); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .detail { color: var(--discret); font-size: 14px; line-height: 20px; }
  .petit .nom { font-size: 14px; }
  .petit .detail { font-size: 13px; }
  .case { position: absolute; top: 8px; right: 8px; z-index: 3; width: 28px; height: 28px; cursor: pointer; }
  .case input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
  .coche { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: rgba(13, 12, 18, 0.8); border: 2px solid #fff; color: transparent; }
  .case input:checked + .vh + .coche { background: var(--lampe); border-color: var(--lampe); color: var(--lampe-sur); }
  .case input:focus-visible + .vh + .coche { outline: 3px solid var(--lampe-vive); outline-offset: 3px; }
</style>
