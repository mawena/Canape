<script lang="ts">
  import { onMount } from 'svelte';
  import type { ListeSeances, NoteSeance, ProgressionFilm, Seance, Souvenir } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import {
    Badge, BarreProgression, Bouton, EnTetePage, EtatVide, LigneListe, Liste, MiniAffiche, Squelette,
    formaterDuree, formaterJourCourt, formaterMois, listerNoms, toast,
  } from '$lib/ui/index.ts';
  import { autresPersonnes } from '$lib/interface/accueil.ts';
  import { liens } from '$lib/interface/liens.ts';
  import { session } from '$lib/interface/session.svelte.ts';
  import SelecteurNote from '$lib/seance/SelecteurNote.svelte';
  import { emojiNote, libelleNote, maNote, notesDesAutres, phraseTemps, presents } from '$lib/seance/souvenir.ts';

  let entrees: ProgressionFilm[] = $state([]);
  let seances: Seance[] = $state([]);
  let etat: 'chargement' | 'ok' | 'erreur' = $state('chargement');
  let message = $state('');

  async function charger(): Promise<void> {
    etat = 'chargement';
    try {
      const [h, s] = await Promise.allSettled([api.get<ProgressionFilm[]>('/api/historique'), api.get<ListeSeances>('/api/seances')]);
      if (h.status === 'rejected') throw h.reason;
      entrees = Array.isArray(h.value) ? h.value : [];
      // Les séances servent à dire « vu avec … » ; si elles manquent, on s'en passe.
      seances = s.status === 'fulfilled' ? [...s.value.enCours, ...s.value.aVenir, ...s.value.recentes] : [];
      etat = 'ok';
    } catch (e) {
      message = e instanceof ErreurApi ? e.message : 'Impossible de charger l’historique.';
      etat = 'erreur';
    }
  }
  onMount(() => void charger());

  const seanceParId = $derived(new Map(seances.map((s) => [s.id, s])));
  const groupes = $derived.by(() => {
    const tries = [...entrees].sort((a, b) => new Date(b.vuLe).getTime() - new Date(a.vuLe).getTime());
    const map = new Map<string, ProgressionFilm[]>();
    for (const e of tries) {
      const cle = formaterMois(e.vuLe);
      map.set(cle, [...(map.get(cle) ?? []), e]);
    }
    return [...map.entries()].map(([mois, lignes]) => ({ mois: mois.charAt(0).toUpperCase() + mois.slice(1), lignes }));
  });

  function avec(p: ProgressionFilm): string {
    if (p.souvenir) {
      const noms = presents(p.souvenir).filter((x) => x.utilisateur.id !== session.utilisateur?.id).map((x) => x.utilisateur.prenom);
      return noms.length ? `Vu avec ${listerNoms(noms)}` : 'Vu seul';
    }
    const s = p.seanceId ? seanceParId.get(p.seanceId) : undefined;
    const moi = session.utilisateur;
    if (!s || !moi) return 'Vu seul';
    const noms = autresPersonnes(s, moi.id).map((x) => x.prenom);
    return noms.length ? `Vu avec ${listerNoms(noms)}` : 'Vu seul';
  }
  /** Noter (ou changer sa note) après coup ; la même note une seconde fois l'efface. */
  async function noter(p: ProgressionFilm, note: NoteSeance): Promise<void> {
    const s = p.souvenir;
    if (!s) return;
    const actuelle = maNote(s, session.utilisateur?.id);
    try {
      const neuf = await api.put<Souvenir>(`/api/seances/${encodeURIComponent(s.seanceId)}/note`, { note: actuelle === note ? null : note });
      entrees = entrees.map((e) => (e.souvenir?.seanceId === s.seanceId ? { ...e, souvenir: neuf } : e));
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'Ta note n’a pas pu être enregistrée.');
    }
  }
  function regarde(p: ProgressionFilm): string {
    return p.termine ? `${formaterDuree(p.duree ?? p.position)} regardées` : `${formaterDuree(p.position)} regardées`;
  }
</script>

<svelte:head><title>Historique · Canapé</title></svelte:head>

<div class="page">
  <EnTetePage titre="Historique" description="Les films que tu as regardés, seul ou à plusieurs." />

  {#if etat === 'chargement'}
    <div class="squelettes" aria-busy="true" aria-label="Chargement de l’historique">
      {#each [0, 1, 2, 3] as i (i)}
        <div class="sq-ligne"><Squelette hauteur="72px" largeur="48px" /><div class="sq-textes"><Squelette largeur="40%" /><Squelette largeur="25%" hauteur="12px" /></div></div>
      {/each}
    </div>
  {:else if etat === 'erreur'}
    <EtatVide icone="alerte" titre="L’historique ne s’affiche pas." texte={message}>
      {#snippet actions()}<Bouton icone="actualiser" onclick={charger}>Réessayer</Bouton>{/snippet}
    </EtatVide>
  {:else if entrees.length === 0}
    <EtatVide icone="historique" titre="Rien de vu ensemble pour l’instant." texte="La première séance se lance depuis un film.">
      {#snippet actions()}<Bouton icone="plus" href={liens.nouvelleSeance()}>Lancer une séance</Bouton>{/snippet}
    </EtatVide>
  {:else}
    {#each groupes as g (g.mois)}
      <section class="mois" aria-labelledby="m-{g.mois}">
        <h2 id="m-{g.mois}" class="t-titre3 sous-titre">{g.mois}</h2>
        <Liste libelle={g.mois}>
          {#each g.lignes as p (`${p.film.id}-${p.vuLe}`)}
            <LigneListe titre={p.film.titre} detail={`${avec(p)} · ${formaterJourCourt(p.vuLe)}`}>
              {#snippet debut()}<MiniAffiche film={p.film} largeur={44} />{/snippet}
              <div class="avance">
                <BarreProgression valeur={p.termine ? 1 : p.duree ? p.position / p.duree : null} libelle="Progression de {p.film.titre}" fine ton={p.termine ? 'ok' : 'lampe'} />
                <span class="tn regarde">{regarde(p)}</span>
                {#if p.termine}<Badge ton="ok" icone="verifier">Terminé</Badge>{/if}
              </div>
              {#if p.souvenir}
                <div class="souvenir" data-test="souvenir" data-seance={p.souvenir.seanceId}>
                  <p class="temps" data-test="souvenir-temps">{phraseTemps(p.souvenir)}</p>
                  {#each notesDesAutres(p.souvenir, session.utilisateur?.id) as n (n.prenom)}
                    <span class="note-autre" data-test="souvenir-note">{n.prenom} <span aria-hidden="true">{emojiNote(n.note)}</span><span class="sr">: {libelleNote(n.note)}</span></span>
                  {/each}
                  <SelecteurNote compact libelle="Ta note pour {p.film.titre}" note={maNote(p.souvenir, session.utilisateur?.id)} surChoisir={(n) => void noter(p, n)} />
                </div>
              {/if}
              <!-- Sur téléphone, « Revoir » passe sous la ligne au lieu de serrer le souvenir sur le côté. -->
              <div class="revoir-tel"><Bouton variante="secondaire" taille="s" icone="reculer" href={liens.nouvelleSeance(p.film.id)} aria-label="Revoir {p.film.titre}">Revoir</Bouton></div>
              {#snippet fin()}<span class="revoir-large"><Bouton variante="secondaire" taille="s" icone="reculer" href={liens.nouvelleSeance(p.film.id)} aria-label="Revoir {p.film.titre}">Revoir</Bouton></span>{/snippet}
            </LigneListe>
          {/each}
        </Liste>
      </section>
    {/each}
  {/if}
</div>

<style>
  .page { display: grid; gap: var(--e-7); }
  .mois { display: grid; gap: var(--e-3); }
  .sous-titre { color: var(--doux); font-weight: 600; font-size: 15px; }
  .avance { display: flex; align-items: center; gap: var(--e-3); margin-top: 6px; max-width: 420px; }
  .avance :global(.barre) { flex: 1; min-width: 80px; }
  .regarde { color: var(--discret); font-size: 13px; white-space: nowrap; }
  .souvenir { min-width: 0; display: flex; align-items: center; gap: var(--e-2) var(--e-3); flex-wrap: wrap; margin-top: 10px; }
  .souvenir .temps { margin: 0; font-weight: 600; font-size: 13px; color: var(--doux); }
  .note-autre { padding: 4px 10px; border-radius: var(--r-pill); background: var(--s2); font-size: 13px; color: var(--doux); white-space: nowrap; }
  .souvenir :global(.notes) { justify-content: flex-start; gap: var(--e-2); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .squelettes { display: grid; gap: var(--e-4); }
  .sq-ligne { display: flex; gap: var(--e-4); align-items: center; }
  .sq-textes { display: grid; gap: 10px; flex: 1; }
  .revoir-large { display: contents; }
  .revoir-tel { display: none; }
  @media (max-width: 640px) {
    .revoir-large { display: none; }
    .revoir-tel { display: flex; margin-top: 10px; }
    .souvenir .temps { flex-basis: 100%; }
    .avance :global(.badge) { display: none; }
  }
</style>
