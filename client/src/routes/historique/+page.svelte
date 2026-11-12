<script lang="ts">
  import { onMount } from 'svelte';
  import type { ListeSeances, ProgressionFilm, Seance } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import {
    Badge, BarreProgression, Bouton, EnTetePage, EtatVide, LigneListe, Liste, MiniAffiche, Squelette,
    formaterDuree, formaterJourCourt, formaterMois, listerNoms,
  } from '$lib/ui/index.ts';
  import { autresPersonnes } from '$lib/interface/accueil.ts';
  import { liens } from '$lib/interface/liens.ts';
  import { session } from '$lib/interface/session.svelte.ts';

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
    const s = p.seanceId ? seanceParId.get(p.seanceId) : undefined;
    const moi = session.utilisateur;
    if (!s || !moi) return 'Vu seul';
    const noms = autresPersonnes(s, moi.id).map((x) => x.prenom);
    return noms.length ? `Vu avec ${listerNoms(noms)}` : 'Vu seul';
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
              {#snippet fin()}<Bouton variante="secondaire" taille="s" icone="reculer" href={liens.nouvelleSeance(p.film.id)} aria-label="Revoir {p.film.titre}">Revoir</Bouton>{/snippet}
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
  .squelettes { display: grid; gap: var(--e-4); }
  .sq-ligne { display: flex; gap: var(--e-4); align-items: center; }
  .sq-textes { display: grid; gap: 10px; flex: 1; }
  @media (max-width: 640px) {
    .avance :global(.badge) { display: none; }
  }
</style>
