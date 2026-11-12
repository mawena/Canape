<script lang="ts">
  import type { EtatLectureAdmin, Preparation } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { formatOctets, formatPourcent, formatVitesse } from '$lib/lecture/formats.ts';
  import { BarreProgression, Bouton, Carte, Chargement, EtatVide, toast } from '$lib/ui/index.ts';

  let etat = $state<EtatLectureAdmin | null>(null);
  let echec = $state<string | null>(null);

  async function charger(): Promise<void> {
    try {
      etat = await api.get<EtatLectureAdmin>('/api/admin/lecture');
      echec = null;
    } catch (e) {
      echec = e instanceof ErreurApi ? e.message : 'Impossible de lire l’état des conversions.';
    }
  }

  $effect(() => {
    void charger();
    const minuteur = setInterval(() => void charger(), 3000);
    return () => clearInterval(minuteur);
  });

  async function annuler(p: Preparation): Promise<void> {
    try {
      await api.supprimer(`/api/films/${encodeURIComponent(p.filmId)}/preparations/${p.pisteAudio < 0 ? 'sans' : p.pisteAudio}`);
      toast.ok('Préparation retirée.');
      await charger();
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'La suppression a échoué.');
    }
  }

  async function relancer(p: Preparation): Promise<void> {
    try {
      await api.post(`/api/films/${encodeURIComponent(p.filmId)}/preparations`, { pisteAudio: p.pisteAudio });
      await charger();
    } catch (e) {
      toast.erreur(e instanceof ErreurApi ? e.message : 'La préparation n’a pas pu repartir.');
    }
  }

  const TEXTE_ETAT = { attente: 'En attente', encours: 'En cours', prete: 'Prête', erreur: 'Échec' } as const;
  const charge = $derived(etat ? etat.charge.cpu1min / Math.max(1, etat.charge.coeurs) : 0);
  const labelCharge = $derived(etat ? `${new Intl.NumberFormat('fr', { maximumFractionDigits: 1 }).format(etat.charge.cpu1min)} sur ${etat.charge.coeurs} cœurs` : '');
  const aTraiter = $derived(etat ? etat.preparations.filter((p) => p.etat !== 'prete') : []);
  const pretes = $derived(etat ? etat.preparations.filter((p) => p.etat === 'prete') : []);
  const nomPiste = (n: number) => (n < 0 ? 'sans son' : `piste ${n}`);
</script>

<svelte:head><title>Conversions · Canapé</title></svelte:head>

<h1>Conversions</h1>
{#if echec}
  <p class="erreur" role="alert">{echec}</p>
{:else if !etat}
  <Chargement />
{:else}
  <Carte titre="Pendant la lecture">
    {#if etat.conversionsALaVolee.length === 0}
      <EtatVide titre="Rien ne se convertit en ce moment" texte="Les films qui ne se lisent pas directement sont convertis ici dès que quelqu’un les regarde." icone="film" />
    {:else}
      <ul class="liste">
        {#each etat.conversionsALaVolee as c (`${c.filmId}:${c.pisteAudio}`)}
          <li>
            <div class="ligne">
              <strong>{c.titre}</strong>
              <span class="doux">{nomPiste(c.pisteAudio)} · {c.spectateurs} {c.spectateurs > 1 ? 'spectateurs' : 'spectateur'}</span>
            </div>
            <div class="ligne doux">
              <span>{c.mode === 'copie' ? 'Son converti, image conservée' : `Image convertie${c.preset ? ` (${c.preset})` : ''}`}</span>
              <span class:lent={c.vitesse !== null && c.vitesse < 1}>Vitesse : {formatVitesse(c.vitesse)}{#if c.vitesse !== null && c.vitesse < 1} · trop lent pour suivre{/if}</span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </Carte>

  <Carte titre="Préparations à l’avance">
    {#if etat.preparations.length === 0}
      <EtatVide titre="Aucune préparation" texte="Quand un film est lourd, le serveur le prépare à l’avance quand il est calme." icone="film" />
    {:else}
      <ul class="liste">
        {#each aTraiter as p (`${p.filmId}:${p.pisteAudio}`)}
          <li>
            <div class="ligne">
              <strong>{p.titre ?? p.filmId}</strong>
              <span class="doux">{nomPiste(p.pisteAudio)} · {TEXTE_ETAT[p.etat]}{#if p.etat === 'encours'} · {formatPourcent(p.progression)}{/if}</span>
            </div>
            {#if p.etat === 'encours'}<BarreProgression valeur={p.progression} libelle={`Préparation de ${p.titre ?? p.filmId}`} />{/if}
            {#if p.erreur}<p class="erreur">{p.erreur}</p>{/if}
            <div class="actions">
              {#if p.etat === 'erreur'}<Bouton taille="s" onclick={() => relancer(p)}>Réessayer</Bouton>{/if}
              <Bouton taille="s" variante="secondaire" onclick={() => annuler(p)}>{p.etat === 'erreur' ? 'Oublier' : 'Annuler'}</Bouton>
            </div>
          </li>
        {/each}
        {#each pretes as p (`${p.filmId}:${p.pisteAudio}`)}
          <li>
            <div class="ligne">
              <strong>{p.titre ?? p.filmId}</strong>
              <span class="doux">{nomPiste(p.pisteAudio)} · prête{#if p.taille} · {formatOctets(p.taille)}{/if}</span>
            </div>
            <div class="actions"><Bouton taille="s" variante="secondaire" onclick={() => annuler(p)}>Supprimer la préparation</Bouton></div>
          </li>
        {/each}
      </ul>
    {/if}
  </Carte>

  <Carte titre="Le serveur">
    <p>Charge : {labelCharge}</p>
    <BarreProgression valeur={Math.min(1, charge)} libelle="Charge du processeur" />
    <p>Cache de lecture : {formatOctets(etat.cache.octets)} sur {formatOctets(etat.cache.max)}</p>
    <BarreProgression valeur={etat.cache.max > 0 ? etat.cache.octets / etat.cache.max : 0} libelle="Cache de lecture utilisé" />
  </Carte>
{/if}

<style>
  .liste { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--espace-4); }
  li { display: grid; gap: var(--espace-2); }
  .ligne { display: flex; justify-content: space-between; gap: var(--espace-3); flex-wrap: wrap; }
  .actions { display: flex; gap: var(--espace-2); }
  .doux { color: var(--doux); }
  .erreur { color: var(--mal); margin: 0; }
  .lent { color: var(--alerte); }
  p { margin: 0; }
</style>
