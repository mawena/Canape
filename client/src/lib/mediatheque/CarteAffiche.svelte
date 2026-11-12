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
  const lueur = $derived(film.couleur ?? '#f4a85b');
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
    <span class="badges">
      {#if film.etat === 'analyse'}<span class="puce alerte">Analyse…</span>{/if}
      {#if film.etat === 'erreur'}<span class="puce mal"><Icone nom="alerte" taille={14} />Illisible</span>{/if}
      {#if film.etat === 'pret' && film.visibilite !== 'prive'}<span class="puce rose"><Icone nom="utilisateurs" taille={14} />Partagé</span>{/if}
    </span>
  </div>
  <p class="titre">{film.titre}</p>
  <p class="details">{details}{#if !film.modifiable} · {film.proprietairePrenom}{/if}</p>
</a>

<style>
  .carte { display: block; color: inherit; text-decoration: none; border-radius: 10px; }
  .carte:focus-visible { outline: 3px solid var(--lampe, #f4a85b); outline-offset: 3px; }
  .affiche {
    position: relative; aspect-ratio: 2 / 3; border-radius: 10px; overflow: hidden; background: var(--s2, #262031);
    box-shadow: 0 6px 18px rgba(8, 6, 12, 0.5); transition: transform 160ms ease, box-shadow 160ms ease;
  }
  .carte:hover .affiche, .carte:focus-visible .affiche { transform: translateY(-4px); box-shadow: 0 10px 30px color-mix(in srgb, var(--lueur) 40%, transparent), 0 6px 18px rgba(8, 6, 12, 0.5); }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sans { background: linear-gradient(160deg, hsl(var(--teinte) 38% 30%), hsl(var(--teinte) 38% 12%)); display: flex; flex-direction: column; justify-content: flex-end; padding: 14px; gap: 4px; }
  .titre-genere { font-family: var(--titre, 'Instrument Serif', Georgia, serif); font-size: 1.5rem; line-height: 1.1; color: #fff; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; position: relative; z-index: 1; }
  .annee-generee { font-size: 0.75rem; color: #fff; opacity: 0.85; position: relative; z-index: 1; }
  .pied { position: absolute; inset: auto 0 0 0; height: 40%; background: linear-gradient(transparent, rgba(0, 0, 0, 0.55)); pointer-events: none; }
  .badges { position: absolute; top: 8px; left: 8px; display: flex; gap: 4px; flex-wrap: wrap; z-index: 2; }
  .puce { display: inline-flex; align-items: center; gap: 4px; background: rgba(20, 17, 26, 0.8); border-radius: 999px; padding: 3px 9px; font-size: 0.75rem; }
  .alerte { color: var(--alerte, #ffd166); }
  .mal { color: var(--mal, #ff7f70); }
  .rose { color: var(--rose, #e892b0); }
  .titre { margin: 10px 0 2px; font-weight: 600; font-size: 0.95rem; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .details { margin: 0; font-size: 0.875rem; color: var(--discret, #9a90a7); }
  @media (prefers-reduced-motion: reduce) { .affiche { transition: none; } .carte:hover .affiche { transform: none; } }
</style>
