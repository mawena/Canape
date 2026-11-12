<script lang="ts">
  // Une vignette caméra : états parle / micro coupé / caméra coupée / connexion faible / connexion en cours.
  import MicOff from '@lucide/svelte/icons/mic-off';
  import VideoOff from '@lucide/svelte/icons/video-off';
  import WifiLow from '@lucide/svelte/icons/wifi-low';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import { COINS, type Coin } from './prefs.ts';
  import type { PersonneSalle } from './salle.svelte.ts';

  interface Props {
    personne: PersonneSalle;
    avecNom: boolean;
    grande: boolean;
    petite?: boolean;
    surPlacer: (coin: Coin) => void;
    surRangee: () => void;
    surMasquer: () => void;
    surGrande: () => void;
    surVolume?: (v: number) => void;
    enRangee: boolean;
  }
  let { personne, avecNom, grande, petite = false, surPlacer, surRangee, surMasquer, surGrande, surVolume, enRangee }: Props = $props();

  let video: HTMLVideoElement | undefined = $state();
  let menu = $state(false);

  $effect(() => {
    if (!video) return;
    if (video.srcObject !== personne.flux) video.srcObject = personne.flux;
    if (personne.flux) void video.play().catch(() => {});
  });

  const connexion = $derived(!personne.soi && (personne.pair === 'new' || personne.pair === 'connecting'));
  const sansImage = $derived(!personne.camera || personne.imagePerdue || !personne.flux);
  const couleur = $derived(personne.utilisateur.couleur ?? '#ffb347');
  const nom = $derived(personne.soi ? `${personne.utilisateur.prenom} (moi)` : personne.utilisateur.prenom);
</script>

<div
  class="vignette" class:parle={personne.parle} class:petite class:grande class:rangee={enRangee} class:sans-image={sansImage}
  data-test="vignette" data-cid={personne.cid} data-parle={personne.parle} data-moi={personne.soi} data-pair={personne.pair}
  role="group" aria-label={personne.parle ? `${personne.utilisateur.prenom} parle` : nom}
  ondblclick={surGrande}
>
  <video bind:this={video} autoplay playsinline muted class:miroir={personne.soi}></video>
  {#if sansImage}
    <span class="initiale" style:background={couleur} aria-hidden="true">{personne.utilisateur.prenom.slice(0, 1).toUpperCase()}</span>
  {/if}
  {#if connexion}<span class="anneau" aria-hidden="true"></span>{/if}
  {#if personne.faible && !personne.imagePerdue}
    <span class="puce"><WifiLow size={14} aria-hidden="true" /> Connexion faible</span>
  {/if}
  {#if personne.imagePerdue}<span class="puce">Connexion perdue…</span>{/if}
  {#if avecNom}
    <span class="pied">
      <span class="nom">{nom}</span>
      {#if !personne.micro}<MicOff size={14} class="rouge" aria-label="Micro coupé" />{/if}
      {#if !personne.camera}<VideoOff size={14} aria-label="Caméra coupée" />{/if}
    </span>
  {/if}
  <button type="button" class="plus" aria-label="Options de la vignette de {personne.utilisateur.prenom}" aria-expanded={menu}
    onclick={() => (menu = !menu)} data-test="menu-vignette"><Ellipsis size={16} /></button>
  {#if menu}
    <div class="menu" role="menu" tabindex="-1" onmouseleave={() => (menu = false)}>
      {#each COINS as c (c.coin)}
        <button type="button" role="menuitem" onclick={() => { surPlacer(c.coin); menu = false; }}>Placer {c.libelle}</button>
      {/each}
      <button type="button" role="menuitem" onclick={() => { surRangee(); menu = false; }}>{enRangee ? 'Remettre sur le film' : 'Mettre en rangée sous le film'}</button>
      <button type="button" role="menuitem" onclick={() => { surGrande(); menu = false; }}>{grande ? 'Réduire' : 'Agrandir'}</button>
      <button type="button" role="menuitem" onclick={() => { surMasquer(); menu = false; }}>Masquer toutes les caméras</button>
      {#if !personne.soi && surVolume}
        <label class="vol">Volume de {personne.utilisateur.prenom}
          <input type="range" min="0" max="1" step="0.05" value={personne.volume} oninput={(e) => surVolume?.(Number(e.currentTarget.value))} />
        </label>
      {/if}
    </div>
  {/if}
</div>

<style>
  .vignette {
    position: relative; width: var(--largeur-vignette, 176px); aspect-ratio: 4 / 3; border-radius: 16px; overflow: hidden;
    background: var(--s3, #282532); border: 1px solid rgba(255, 255, 255, 0.16); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    transition: border-color 600ms, box-shadow 600ms; flex: none; touch-action: none;
  }
  .vignette.petite { width: 92px; }
  .vignette.grande { width: 288px; }
  .vignette.rangee { width: auto; height: 92px; }
  .vignette.parle { border-color: var(--ok, #5fdcae); box-shadow: 0 0 0 3px rgba(95, 220, 174, 0.3), 0 8px 24px rgba(0, 0, 0, 0.45); transition-duration: 150ms; }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  video.miroir { transform: scaleX(-1); }
  .sans-image video { visibility: hidden; }
  .initiale { position: absolute; inset: 0; margin: auto; width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; font: 700 1.5rem var(--texte-police); color: #16101c; }
  .rangee .initiale, .petite .initiale { width: 40px; height: 40px; font-size: 1.4rem; }
  .anneau { position: absolute; inset: 0; margin: auto; width: 68px; height: 68px; border-radius: 50%; border: 3px solid transparent; border-top-color: var(--lampe, #ffb347); animation: tour 1.1s linear infinite; }
  @keyframes tour { to { transform: rotate(360deg); } }
  .puce { position: absolute; top: 6px; left: 6px; display: inline-flex; gap: 4px; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 11px; background: rgba(13, 12, 18, 0.8); color: var(--alerte, #ffd166); }
  .pied { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 6px; padding: 14px 8px 5px; background: linear-gradient(transparent, rgba(0, 0, 0, 0.75)); color: #fff; font-size: 12px; font-weight: 600; }
  .parle .nom { color: var(--ok, #5fdcae); }
  .pied :global(.rouge) { color: var(--mal, #ff7b6e); }
  .nom { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .plus { position: absolute; top: 4px; right: 4px; width: 28px; height: 28px; border-radius: 50%; border: 0; background: rgba(13, 12, 18, 0.7); color: #fff; display: grid; place-items: center; opacity: 0; transition: opacity 160ms; }
  .vignette:hover .plus, .plus:focus-visible, .plus[aria-expanded='true'] { opacity: 1; }
  .menu { position: absolute; z-index: 5; top: 34px; right: 4px; display: grid; min-width: 220px; padding: 6px; border-radius: 12px; background: var(--s2, #1d1b26); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6); }
  .menu button { background: none; border: 0; color: var(--texte, #f7f3ee); text-align: left; padding: 8px 10px; border-radius: 8px; font-size: 0.9rem; }
  .menu button:hover, .menu button:focus-visible { background: var(--s3, #282532); }
  .vol { display: grid; gap: 4px; padding: 6px 10px; font-size: 0.8rem; color: var(--doux, #c0bacb); }
  @media (prefers-reduced-motion: reduce) { .anneau { animation: none; } }
</style>
