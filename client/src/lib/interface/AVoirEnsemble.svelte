<script lang="ts">
  /**
   * « À voir ensemble » (phase 23) : les films de la galerie que des personnes ont envie de voir, ceux voulus par plusieurs en tête.
   * Chaque film : qui en a envie, « Lancer une séance » (page de création pré-remplie avec le film et les intéressés) et ma bascule d'envie.
   * Sans envie : un état vide qui invite à marquer des films depuis la galerie.
   */
  import type { EtatEnvie, FilmAVoir, UtilisateurEnvie } from '@canape/partage';
  import { Badge, Bouton, EtatVide, MiniAffiche, PileAvatars } from '$lib/ui/index.ts';
  import BoutonEnvie from '$lib/mediatheque/BoutonEnvie.svelte';
  import { liens } from '$lib/interface/liens.ts';
  import { autresEnvieux, estPlebiscite, phraseEnvies, trierEnvies } from '$lib/interface/envies.ts';

  interface Props { envies: FilmAVoir[]; moi: UtilisateurEnvie; surChangement: (e: EtatEnvie) => void }
  let { envies, moi, surChangement }: Props = $props();

  const films = $derived(trierEnvies(envies));
</script>

<section class="bloc" aria-labelledby="titre-a-voir" data-test="a-voir-ensemble">
  <div class="tete">
    <h2 id="titre-a-voir" class="t-titre2">À voir ensemble</h2>
    <a class="voir-tout" href={liens.galerie}>Choisir dans la galerie</a>
  </div>

  {#if films.length === 0}
    <div data-test="a-voir-vide">
      <EtatVide icone="coeur" titre="Aucune envie pour l’instant." texte="Sur la fiche d’un film, touche « J’ai envie de le voir » : il apparaît ici, avec les films que les autres ont envie de voir.">
        {#snippet actions()}<Bouton variante="secondaire" icone="film" href={liens.galerie}>Ouvrir la galerie</Bouton>{/snippet}
      </EtatVide>
    </div>
  {:else}
    <ul class="liste">
      {#each films as item (item.film.id)}
        {@const autres = autresEnvieux(item, moi.id)}
        <li class="carte" class:plebiscite={estPlebiscite(item)} data-test="a-voir-film" data-film={item.film.id} data-envieux={item.personnes.length}>
          <a class="affiche" href={liens.film(item.film.id)} aria-label="Fiche de {item.film.titre}"><MiniAffiche film={item.film} largeur={72} /></a>
          <div class="corps">
            <p class="titre-ligne">
              <a class="nom" href={liens.film(item.film.id)}>{item.film.titre}</a>
              {#if estPlebiscite(item)}<Badge ton="rose" icone="coeur">{item.personnes.length} envies</Badge>{/if}
            </p>
            <p class="qui">
              <PileAvatars personnes={item.personnes} taille={28} max={5} />
              <span data-test="a-voir-phrase">{phraseEnvies(item, moi.id)}</span>
            </p>
            <div class="actions">
              <Bouton taille="s" icone="lecture" href={liens.nouvelleSeance(item.film.id, autres.map((p) => p.id))} data-test="a-voir-lancer" aria-label="Lancer une séance avec {item.film.titre}">Lancer une séance</Bouton>
              <BoutonEnvie compact filmId={item.film.id} actif={item.moi} {surChangement} />
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .bloc { display: grid; gap: var(--e-5); }
  .tete { display: flex; align-items: baseline; justify-content: space-between; gap: var(--e-4); }
  .voir-tout { color: var(--lampe); text-decoration: none; font-weight: 600; font-size: 15px; border-radius: var(--r-s); }
  @media (hover: hover) { .voir-tout:hover { color: var(--lampe-vive); text-decoration: underline; text-underline-offset: 4px; } }
  .liste { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--e-3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr)); }
  .carte {
    display: flex; gap: 14px; align-items: flex-start; padding: var(--e-4); border-radius: var(--r-l); background: var(--s1); border: 1px solid var(--bord);
    box-shadow: var(--ombre-1, none);
  }
  .carte.plebiscite { border-color: var(--rose); background: linear-gradient(135deg, var(--rose-fond), transparent 60%), var(--s1); }
  .affiche { flex: none; border-radius: var(--r-s); }
  .affiche:focus-visible, .nom:focus-visible { outline: 3px solid var(--lampe); outline-offset: 2px; }
  .corps { display: grid; gap: 10px; min-width: 0; flex: 1; }
  .titre-ligne { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .nom { color: var(--texte); font-weight: 650; text-decoration: none; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  @media (hover: hover) { .nom:hover { text-decoration: underline; text-underline-offset: 3px; } }
  .qui { margin: 0; display: flex; align-items: center; gap: 10px; color: var(--doux); font-size: 14px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  @media (max-width: 640px) {
    .carte { padding: var(--e-3); gap: 12px; }
    .qui { align-items: flex-start; flex-direction: column; gap: 6px; }
  }
</style>
