<script lang="ts">
  /**
   * <Lecteur filmId="abc" pisteAudio={-1} position={0} />
   *
   * Lecteur autonome minimal, pour regarder seul ou prévisualiser un film : charge le plan de lecture, branche la
   * vidéo avec `attacherLecture`, propose le choix de la piste audio et des sous-titres, et dit en une phrase
   * comment le film est lu (« Lu directement », « Son converti pour ton navigateur »…). Commandes natives du navigateur.
   *
   * Props :
   *   filmId     identifiant du film (obligatoire)
   *   pisteAudio piste audio de départ (index ffprobe) ; absent ou négatif = piste par défaut
   *   position   position de départ en secondes
   *   surFin     appelé quand le film se termine
   *
   * Changer de piste audio recharge le plan et reprend à la même position. Les sous-titres sont ceux du plan
   * (`<track>` ajoutés par `attacherLecture`), activés ici par le menu.
   */
  import { untrack } from 'svelte';
  import type { PlanDeLecture } from '@canape/partage';
  import { ErreurApi } from '../api/client.ts';
  import { Chargement, EtatVide } from '../ui/index.ts';
  import { attacherLecture, chargerPlan, EVENEMENT_ERREUR_LECTURE } from './attacher.ts';
  import { ecrirePrefs, lirePrefs } from '../seance/prefs.ts';
  import { choisirSousTitres, decrireChoix } from '../seance/sous-titres.ts';
  import { bornerDecalage, decalerPiste, lireDecalage, PAS_DECALAGE, retenirDecalage, texteDecalage } from './decalage.ts';

  interface Props {
    filmId: string;
    pisteAudio?: number;
    position?: number;
    surFin?: () => void;
  }
  let { filmId, pisteAudio = -1, position = 0, surFin }: Props = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let plan = $state<PlanDeLecture | null>(null);
  let erreur = $state<string | null>(null);
  let audioChoisi = $state(-1);
  let sousTitresChoisis = $state('');
  let decalage = $state(0);
  let reprise = $state(0);

  $effect(() => {
    audioChoisi = pisteAudio;
    reprise = position;
  });

  $effect(() => {
    const id = filmId;
    const audio = audioChoisi;
    plan = null;
    erreur = null;
    let annule = false;
    chargerPlan(id, audio).then(
      (p) => {
        if (!annule) plan = p;
      },
      (e: unknown) => {
        if (!annule) erreur = e instanceof ErreurApi && e.statut === 404 ? 'Ce film n’existe plus ou ne t’est pas partagé.' : e instanceof ErreurApi ? e.message : 'Impossible de charger le film.';
      },
    );
    return () => {
      annule = true;
    };
  });

  $effect(() => {
    const v = video;
    const p = plan;
    if (!v || !p) return;
    const detacher = attacherLecture(v, p);
    const debut = reprise;
    const aLaMetadonnee = () => {
      if (debut > 0) v.currentTime = debut;
    };
    const surErreur = (e: Event) => {
      erreur = (e as CustomEvent<{ message: string }>).detail.message;
    };
    v.addEventListener('loadedmetadata', aLaMetadonnee, { once: true });
    v.addEventListener(EVENEMENT_ERREUR_LECTURE, surErreur);
    sousTitresChoisis = choisirSousTitres(p, lirePrefs().sousTitres, untrack(() => audioChoisi)) ?? '';
    return () => {
      v.removeEventListener(EVENEMENT_ERREUR_LECTURE, surErreur);
      detacher();
    };
  });

  $effect(() => {
    const v = video;
    if (!v || !plan) return;
    for (const piste of Array.from(v.querySelectorAll('track'))) piste.track.mode = piste.id === sousTitresChoisis ? 'showing' : 'disabled';
    decalage = lireDecalage(filmId, sousTitresChoisis);
  });

  $effect(() => {
    const el = Array.from(video?.querySelectorAll('track') ?? []).find((t) => t.id === sousTitresChoisis);
    if (el && plan) decalerPiste(el, decalage);
  });

  /** `pas` positif = sous-titres plus tard ; `null` = remise à zéro. Retenu pour ce film et cette piste. */
  function decaler(pas: number | null): void {
    if (!sousTitresChoisis) return;
    decalage = pas === null ? 0 : bornerDecalage(decalage + pas);
    retenirDecalage(filmId, sousTitresChoisis, decalage);
  }

  /** Même choix que dans les séances : l'appareil le retient pour les films suivants. */
  function retenirSousTitres(): void {
    const prefs = lirePrefs();
    ecrirePrefs({ ...prefs, sousTitres: decrireChoix(plan, sousTitresChoisis || null) });
  }

  function changerAudio(index: number): void {
    reprise = video?.currentTime ?? 0;
    audioChoisi = index;
  }

  const audioCourant = $derived(plan?.pistesAudio.find((p) => p.parDefaut)?.index);
</script>

<div class="lecteur" data-theme="sombre">
  {#if erreur}
    <EtatVide titre="Ce film ne se lit pas" texte={erreur} icone="alerte" />
  {:else if !plan}
    <Chargement texte="Préparation de la lecture…" />
  {:else}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} controls playsinline preload="metadata" onended={() => surFin?.()}></video>
    <div class="barre">
      <span class="raison" aria-live="polite">{plan.raison}</span>
      {#if plan.pistesAudio.length > 1}
        <label>Langue
          <select value={audioChoisi >= 0 ? audioChoisi : audioCourant} onchange={(e) => changerAudio(Number(e.currentTarget.value))}>
            {#each plan.pistesAudio as p (p.index)}<option value={p.index}>{p.libelle}</option>{/each}
          </select>
        </label>
      {/if}
      {#if plan.sousTitres.length > 0}
        <label>Sous-titres
          <select bind:value={sousTitresChoisis} onchange={retenirSousTitres}>
            <option value="">Aucun</option>
            {#each plan.sousTitres as s (s.cle)}<option value={s.cle}>{s.libelle}</option>{/each}
          </select>
        </label>
      {/if}
      {#if sousTitresChoisis}
        <span class="decalage" role="group" aria-label="Décalage des sous-titres">
          <button type="button" onclick={() => decaler(-PAS_DECALAGE)} aria-label="Sous-titres 0,5 seconde plus tôt" data-test="st-plus-tot">Plus tôt</button>
          <output aria-live="polite" data-test="st-decalage">{texteDecalage(decalage)}</output>
          <button type="button" onclick={() => decaler(PAS_DECALAGE)} aria-label="Sous-titres 0,5 seconde plus tard" data-test="st-plus-tard">Plus tard</button>
          {#if decalage !== 0}<button type="button" onclick={() => decaler(null)} data-test="st-decalage-zero">Remettre à zéro</button>{/if}
        </span>
      {/if}
      {#if plan.sousTitresImage?.length}
        <span class="doux">Ces sous-titres sont des images : ils ne peuvent pas s’afficher ici.</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .lecteur { display: grid; gap: var(--espace-3); padding: var(--e-3); border-radius: var(--r-l); background: var(--fond); }
  video { width: 100%; max-height: 80vh; background: #000; border-radius: var(--rayon); }
  .barre { display: flex; flex-wrap: wrap; gap: var(--espace-4); align-items: center; color: var(--doux); font-size: 0.9rem; }
  .raison { margin-right: auto; }
  label { display: inline-flex; gap: var(--espace-2); align-items: center; }
  .decalage { display: inline-flex; gap: var(--espace-2); align-items: center; }
  .decalage output { min-width: 4.5em; text-align: center; font-variant-numeric: tabular-nums; color: var(--creme); }
  .decalage button { background: var(--fond-3); color: var(--creme); border: 1px solid var(--bordure); border-radius: var(--rayon-s); padding: var(--espace-1) var(--espace-2); font: inherit; }
  select { background: var(--fond-3); color: var(--creme); border: 1px solid var(--bordure); border-radius: var(--rayon-s); padding: var(--espace-1) var(--espace-2); }
</style>
