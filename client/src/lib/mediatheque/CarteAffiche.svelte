<script lang="ts">
  import type { Film } from '@canape/partage';
  import { Icone } from '$lib/ui/index.ts';
  import { urlImage } from './api.ts';
  import { formaterDuree, teinteTitre } from './formats.ts';

  interface Props {
    film: Film;
    /** Adresse de la fiche (défaut : /galerie/<id>). */
    href?: string;
  }
  let { film, href = `/galerie/${film.id}` }: Props = $props();

  const teinte = $derived(teinteTitre(film.titre));
  const details = $derived([film.annee ? String(film.annee) : '', formaterDuree(film.duree)].filter(Boolean).join(' · '));
  const etat = $derived(film.etat === 'pret' ? 'prêt' : film.etat === 'erreur' ? 'illisible' : 'analyse en cours');
  const libelle = $derived(`${film.titre}${film.annee ? `, ${film.annee}` : ''}${film.duree ? `, ${formaterDuree(film.duree)}` : ''}, ${etat}`);
  const lueur = $derived(film.couleur ?? '#3b82f6');
</script>

<a class="carte" {href} aria-label={libelle} style:--lueur={lueur}>
  <div class="affiche" class:sans={!film.aAffiche} style:--teinte={teinte}>
    {#if film.aAffiche}
      <img src={urlImage(film, 'affiche')} alt="" loading="lazy" />
    {:else}
      <span class="titre-genere">{film.titre}</span>
      {#if film.annee}<span class="annee-generee">{film.annee}</span>{/if}
    {/if}
    <span class="pied"></span>
    <span class="badges" data-theme="sombre">
      {#if film.etat === 'analyse'}<span class="puce alerte">Analyse…</span>{/if}
      {#if film.etat === 'erreur'}<span class="puce mal"><Icone nom="alerte" taille={14} />Illisible</span>{/if}
      {#if film.etat === 'pret' && film.visibilite !== 'prive'}<span class="puce rose"><Icone nom="utilisateurs" taille={14} />Partagé</span>{/if}
    </span>
  </div>
  <p class="titre">{film.titre}</p>
  <p class="details">{details}{#if !film.modifiable} · {film.proprietairePrenom}{/if}</p>
</a>

<style>
  .carte { display: block; color: inherit; text-decoration: none; border-radius: var(--r-affiche); }
  .carte:focus-visible { outline: 3px solid var(--lampe, #1f5ce0); outline-offset: 3px; }
  .affiche {
    position: relative; aspect-ratio: 2 / 3; border-radius: var(--r-affiche); overflow: hidden; background: var(--s2);
    box-shadow: var(--ombre-2), 0 0 0 1px rgba(255, 255, 255, 0.06); transition: transform var(--d-2) var(--ease), box-shadow var(--d-2) var(--ease);
  }
  .carte:hover .affiche, .carte:focus-visible .affiche { transform: translateY(-4px); box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5), 0 0 44px -8px var(--lueur), 0 0 0 1px rgba(255, 255, 255, 0.1); }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sans { background: linear-gradient(160deg, hsl(var(--teinte) 38% 30%), hsl(var(--teinte) 38% 12%)); display: flex; flex-direction: column; justify-content: flex-end; padding: 14px; gap: 4px; }
  .titre-genere { font-family: var(--titre, 'Instrument Serif', Georgia, serif); font-size: 1.5rem; line-height: 1.1; color: #fff; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; position: relative; z-index: 1; }
  .annee-generee { font-size: 0.75rem; color: #fff; opacity: 0.85; position: relative; z-index: 1; }
  .pied { position: absolute; inset: auto 0 0 0; height: 40%; background: linear-gradient(transparent, rgba(0, 0, 0, 0.55)); pointer-events: none; }
  .badges { position: absolute; top: 8px; left: 8px; display: flex; gap: 4px; flex-wrap: wrap; z-index: 2; }
  .puce { display: inline-flex; align-items: center; gap: 4px; background: rgba(13, 12, 18, 0.8); backdrop-filter: blur(8px); border-radius: 999px; padding: 4px 10px; font-size: 0.75rem; font-weight: 600; }
  .alerte { color: var(--alerte, #ffd166); }
  .mal { color: var(--mal, #ff7b6e); }
  .rose { color: var(--rose, #ff8fb4); }
  .titre { margin: 10px 0 2px; font-weight: 650; font-size: 0.95rem; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .details { margin: 0; font-size: 0.875rem; color: var(--discret, #9f99ad); }
  @media (prefers-reduced-motion: reduce) { .affiche { transition: none; } .carte:hover .affiche { transform: none; } }
</style>
