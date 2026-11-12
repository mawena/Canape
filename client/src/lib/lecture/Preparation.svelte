<script lang="ts">
  /**
   * <Preparation filmId="abc" pisteAudio={1} />
   *
   * Section « Préparation » de la fiche d'un film : « Préparer ce film pour qu'il se lance plus vite », avec l'état
   * (en attente, en cours avec progression, prête, erreur), un bouton pour la lancer et un autre pour l'annuler ou
   * supprimer la version préparée. Se met à jour toute seule (toutes les 3 s) tant qu'une préparation est active.
   *
   * Props :
   *   filmId     identifiant du film (obligatoire)
   *   pisteAudio piste audio à préparer (index ffprobe) ; absent ou négatif = piste par défaut
   *   surChange  appelé à chaque changement d'état (ex. pour recharger le plan de lecture)
   *
   * À n'afficher que pour le propriétaire du film et les admins (les routes répondent 404 aux autres).
   * Utilise `GET|POST|DELETE /api/films/:id/preparations[/:audio]` et `GET /api/films/:id/lecture`.
   */
  import type { Preparation as LignePreparation } from '@canape/partage';
  import { api, ErreurApi } from '../api/client.ts';
  import { Bouton, BarreProgression, Chargement, toast } from '../ui/index.ts';
  import { chargerPlan } from './attacher.ts';
  import { formatPourcent, TEXTE_ETAT } from './formats.ts';

  interface Props {
    filmId: string;
    pisteAudio?: number;
    surChange?: (etat: LignePreparation | null) => void;
  }
  let { filmId, pisteAudio = -1, surChange }: Props = $props();

  let charge = $state(false);
  let echec = $state<string | null>(null);
  let ligne = $state<LignePreparation | null>(null);
  let inutile = $state(false);
  let occupe = $state(false);

  const actif = $derived(ligne?.etat === 'attente' || ligne?.etat === 'encours');

  async function rafraichir(): Promise<void> {
    try {
      const [lignes, plan] = await Promise.all([
        api.get<LignePreparation[]>(`/api/films/${encodeURIComponent(filmId)}/preparations`),
        chargerPlan(filmId, pisteAudio),
      ]);
      const piste = plan.pistesAudio.find((p) => p.parDefaut)?.index ?? plan.pistesAudio[0]?.index ?? -1;
      const cible = pisteAudio >= 0 ? pisteAudio : piste;
      const nouvelle = lignes.find((l) => l.pisteAudio === cible) ?? null;
      if (nouvelle?.etat !== ligne?.etat) surChange?.(nouvelle);
      ligne = nouvelle;
      inutile = !nouvelle && plan.mode === 'direct';
      echec = null;
    } catch (e) {
      echec = e instanceof ErreurApi ? e.message : 'Impossible de lire l’état de la préparation.';
    } finally {
      charge = true;
    }
  }

  $effect(() => {
    void filmId;
    void pisteAudio;
    void rafraichir();
  });

  $effect(() => {
    if (!actif) return;
    const minuteur = setInterval(() => void rafraichir(), 3000);
    return () => clearInterval(minuteur);
  });

  async function lancer(): Promise<void> {
    occupe = true;
    try {
      await api.post(`/api/films/${encodeURIComponent(filmId)}/preparations`, pisteAudio >= 0 ? { pisteAudio } : {});
      await rafraichir();
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'La préparation n’a pas pu démarrer.');
    } finally {
      occupe = false;
    }
  }

  async function retirer(): Promise<void> {
    if (!ligne) return;
    occupe = true;
    try {
      await api.supprimer(`/api/films/${encodeURIComponent(filmId)}/preparations/${ligne.pisteAudio < 0 ? 'sans' : ligne.pisteAudio}`);
      toast.ok(ligne.etat === 'prete' ? 'Version préparée supprimée.' : 'Préparation annulée.');
      await rafraichir();
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'La suppression a échoué.');
    } finally {
      occupe = false;
    }
  }
</script>

<section class="preparation" aria-labelledby="titre-preparation-{filmId}">
  <h3 id="titre-preparation-{filmId}">Préparation</h3>
  {#if !charge}
    <Chargement texte="Lecture de l’état…" />
  {:else if echec}
    <p class="erreur" role="alert">{echec}</p>
  {:else if inutile}
    <p class="doux">Ce film se lit directement dans ton navigateur : rien à préparer.</p>
  {:else if !ligne}
    <p class="doux">Ce film est lourd : le serveur le convertit pendant que tu regardes. Prépare-le à l’avance pour qu’il se lance plus vite.</p>
    <div class="actions"><Bouton icone="film" chargement={occupe} onclick={lancer}>Préparer ce film pour qu’il se lance plus vite</Bouton></div>
  {:else}
    <p class:ok={ligne.etat === 'prete'} class:erreur={ligne.etat === 'erreur'}>{TEXTE_ETAT[ligne.etat]}{#if ligne.etat === 'encours'} : {formatPourcent(ligne.progression)}{/if}</p>
    {#if ligne.etat === 'encours'}<BarreProgression valeur={ligne.progression} libelle="Progression de la préparation" />{/if}
    {#if ligne.etat === 'attente'}<BarreProgression valeur={null} libelle="En attente" />{/if}
    {#if ligne.erreur}<p class="doux">{ligne.erreur}</p>{/if}
    <div class="actions">
      {#if ligne.etat === 'erreur'}<Bouton chargement={occupe} onclick={lancer}>Réessayer</Bouton>{/if}
      <Bouton variante="secondaire" chargement={occupe} onclick={retirer}>
        {ligne.etat === 'prete' ? 'Supprimer la préparation' : ligne.etat === 'erreur' ? 'Oublier' : 'Annuler la préparation'}
      </Bouton>
    </div>
  {/if}
</section>

<style>
  .preparation { display: grid; gap: var(--espace-3); }
  h3 { font-size: 1.1rem; margin: 0; }
  p { margin: 0; }
  .doux { color: var(--doux); }
  .ok { color: var(--ok); }
  .erreur { color: var(--mal); }
  .actions { display: flex; gap: var(--espace-3); flex-wrap: wrap; }
</style>
