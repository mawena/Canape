<script lang="ts">
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import VolumeX from '@lucide/svelte/icons/volume-x';
  import Mic from '@lucide/svelte/icons/mic';
  import MicOff from '@lucide/svelte/icons/mic-off';
  import Video from '@lucide/svelte/icons/video';
  import VideoOff from '@lucide/svelte/icons/video-off';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Maximize from '@lucide/svelte/icons/maximize';
  import Minimize from '@lucide/svelte/icons/minimize';
  import Captions from '@lucide/svelte/icons/captions';
  import Headphones from '@lucide/svelte/icons/headphones';
  import Coffee from '@lucide/svelte/icons/coffee';
  import Timer from '@lucide/svelte/icons/timer';
  import { EMOJIS } from '@canape/partage';
  import BarreTemps from './BarreTemps.svelte';
  import { libelleAppareil } from './medias.ts';
  import type { Salle } from './salle.svelte.ts';

  interface Props {
    salle: Salle;
    pleinEcran: boolean;
    surPleinEcran: () => void;
    /** Menu ouvert (le parent en a besoin pour ne pas masquer les commandes). */
    menu: string | null;
  }
  let { salle, pleinEcran, surPleinEcran, menu = $bindable() }: Props = $props();

  const basculer = (nom: string): void => { menu = menu === nom ? null : nom; };
  const casqueConseille = $derived(!salle.prefs.casque && !salle.casqueDetecte);
  const emojisVisibles = $derived(EMOJIS);

  function curseur(e: Event, cle: 'volFilm' | 'volVoix'): void {
    salle.prefs[cle] = Number((e.currentTarget as HTMLInputElement).value);
    salle.appliquerVolumes();
    salle.sauverPrefs();
  }
  function baisse(e: Event): void {
    salle.prefs.baisseFilm = (e.currentTarget as HTMLInputElement).checked;
    salle.sauverPrefs();
  }
</script>

<div class="commandes" data-test="commandes">
  <BarreTemps temps={salle.temps} duree={salle.duree} tampon={salle.tamponFin} surAller={(s) => salle.aller(s)} />

  <div class="rangee">
    <div class="groupe">
      <button type="button" class="lecture" onclick={() => salle.basculerLecture()} disabled={!salle.peutAgir}
        aria-label={salle.enLecture ? 'Pause' : 'Lecture'} title={salle.enLecture ? 'Pause (espace)' : 'Lecture (espace)'} data-test="lecture">
        {#if salle.enLecture}<Pause size={24} />{:else}<Play size={24} fill="currentColor" />{/if}
      </button>
      {#if !salle.enLecture && salle.peutAgir}
        <button type="button" class="texte" onclick={() => salle.lancerCompteARebours()} data-test="lancer-ensemble"><Timer size={18} aria-hidden="true" /> Lancer ensemble</button>
      {/if}
      <button type="button" class="rond" onclick={() => salle.allerRelatif(-10)} aria-label="Reculer de 10 secondes" title="Reculer de 10 s (←)" data-test="reculer"><RotateCcw size={22} /></button>
      <button type="button" class="rond" onclick={() => salle.allerRelatif(10)} aria-label="Avancer de 10 secondes" title="Avancer de 10 s (→)" data-test="avancer"><RotateCw size={22} /></button>

      <div class="menu-ancre">
        <button type="button" class="rond" onclick={() => basculer('son')} aria-label="Volumes" aria-expanded={menu === 'son'} title="Volumes" data-test="volumes">
          {#if salle.prefs.volFilm === 0}<VolumeX size={22} />{:else}<Volume2 size={22} />{/if}
        </button>
        {#if menu === 'son'}
          <div class="popover" role="dialog" aria-label="Son et appareils">
            <label>Film <input type="range" min="0" max="1" step="0.05" value={salle.prefs.volFilm} oninput={(e) => curseur(e, 'volFilm')} data-test="vol-film" /></label>
            <label>Voix <input type="range" min="0" max="1" step="0.05" value={salle.prefs.volVoix} oninput={(e) => curseur(e, 'volVoix')} data-test="vol-voix" /></label>
            {#each salle.autres as p (p.cid)}
              <label>{p.utilisateur.prenom}
                <input type="range" min="0" max="1" step="0.05" bind:value={p.volume} oninput={() => salle.appliquerVolumes()} data-test="vol-personne" />
              </label>
            {/each}
            <label class="case"><input type="checkbox" checked={salle.prefs.baisseFilm} onchange={baisse} data-test="baisse-film" /> Baisser le film quand quelqu’un parle</label>
            <label>Micro
              <select onchange={(e) => void salle.changerPeripherique('micro', e.currentTarget.value)}>
                {#each salle.peripheriques.micros as d, i (d.deviceId)}<option value={d.deviceId} selected={d.deviceId === salle.prefs.micro}>{libelleAppareil(d, i)}</option>{/each}
              </select>
            </label>
            <label>Caméra
              <select onchange={(e) => void salle.changerPeripherique('camera', e.currentTarget.value)}>
                {#each salle.peripheriques.cameras as d, i (d.deviceId)}<option value={d.deviceId} selected={d.deviceId === salle.prefs.camera}>{libelleAppareil(d, i)}</option>{/each}
              </select>
            </label>
          </div>
        {/if}
      </div>
      {#if casqueConseille}<span class="puce" title="Un casque évite l’écho"><Headphones size={14} aria-hidden="true" /> Casque conseillé</span>{/if}
    </div>

    <div class="groupe reactions" role="group" aria-label="Réactions">
      {#each emojisVisibles as e, i (e)}
        <button type="button" class="emoji" onclick={() => salle.reagir(e)} aria-label="Réagir {e}" title="{e} ({i + 1})" data-test="reaction-{i + 1}">{e}</button>
      {/each}
    </div>

    <div class="groupe">
      <div class="menu-ancre">
        <button type="button" class="rond" class:actif={salle.etat?.sousTitres != null} onclick={() => basculer('langue')} aria-label="Langue et sous-titres"
          aria-expanded={menu === 'langue'} title="Langue et sous-titres (S)" data-test="langue-st"><Captions size={22} /></button>
        {#if menu === 'langue'}
          <div class="popover" role="dialog" aria-label="Langue et sous-titres" data-test="menu-langue">
            <fieldset>
              <legend>Langue (pour tout le monde)</legend>
              {#each salle.plan?.pistesAudio ?? [] as p (p.index)}
                <label class="case"><input type="radio" name="langue" checked={salle.etat?.pisteAudio === p.index || (salle.etat?.pisteAudio == null && p.parDefaut)}
                  onchange={() => salle.changerLangue(p.index)} data-test="langue-{p.index}" /> {p.libelle}</label>
              {:else}<p class="vide">Une seule langue.</p>{/each}
            </fieldset>
            <fieldset>
              <legend>Sous-titres (pour tout le monde)</legend>
              <label class="case"><input type="radio" name="st" checked={salle.etat?.sousTitres == null} onchange={() => salle.changerSousTitres(null)} data-test="st-aucun" /> Aucun</label>
              {#each salle.plan?.sousTitres ?? [] as s (s.cle)}
                <label class="case"><input type="radio" name="st" checked={salle.etat?.sousTitres === s.cle} onchange={() => salle.changerSousTitres(s.cle)} data-test="st-{s.cle}" /> {s.libelle}</label>
              {/each}
            </fieldset>
          </div>
        {/if}
      </div>
      <button type="button" class="rond" class:coupe={!salle.moi?.micro} onclick={() => salle.basculerMicro()} disabled={!salle.microDispo}
        aria-label={salle.moi?.micro ? 'Couper le micro' : 'Réactiver le micro'} title="Micro (M)" data-test="micro">
        {#if salle.moi?.micro}<Mic size={22} />{:else}<MicOff size={22} />{/if}
      </button>
      <button type="button" class="rond" class:coupe={!salle.moi?.camera} onclick={() => salle.basculerCamera()} disabled={!salle.cameraDispo}
        aria-label={salle.moi?.camera ? 'Couper la caméra' : 'Réactiver la caméra'} title="Caméra (V)" data-test="camera">
        {#if salle.moi?.camera}<Video size={22} />{:else}<VideoOff size={22} />{/if}
      </button>
      <button type="button" class="rond" class:actif={salle.chatOuvert} onclick={() => salle.ouvrirChat(!salle.chatOuvert)} aria-label="Discussion"
        aria-pressed={salle.chatOuvert} title="Discussion (C)" data-test="bouton-chat">
        <MessageCircle size={22} />{#if salle.nonLus}<span class="pastille" aria-label="{salle.nonLus} nouveaux messages"></span>{/if}
      </button>
      <button type="button" class="rond" onclick={() => salle.jeReviens()} aria-label="Je reviens dans 5 minutes" title="Je reviens dans 5 min" data-test="je-reviens"><Coffee size={22} /></button>
      <button type="button" class="rond" onclick={surPleinEcran} aria-label={pleinEcran ? 'Quitter le plein écran' : 'Plein écran'} title="Plein écran (F)" data-test="plein-ecran">
        {#if pleinEcran}<Minimize size={22} />{:else}<Maximize size={22} />{/if}
      </button>
    </div>
  </div>
</div>

<style>
  .commandes { display: grid; gap: 4px; padding: 40px 24px 16px; background: linear-gradient(transparent, rgba(6, 5, 10, 0.9)); color: #fff; }
  .rangee { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .groupe { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  button { color: inherit; font: inherit; }
  .rond, .lecture, .emoji { position: relative; border: 0; background: transparent; display: grid; place-items: center; border-radius: 50%; transition: background 120ms; }
  .rond { width: 44px; height: 44px; }
  .rond:hover:not(:disabled), .emoji:hover { background: rgba(255, 255, 255, 0.12); }
  .rond.actif { background: var(--lampe-fond, rgba(255, 179, 71, 0.14)); color: var(--lampe, #ffb347); }
  .rond.coupe { background: rgba(255, 123, 110, 0.16); color: var(--mal, #ff7b6e); }
  .rond:disabled, .lecture:disabled { opacity: 0.4; cursor: not-allowed; }
  .lecture { width: 52px; height: 52px; background: var(--texte, #f7f3ee); color: var(--fond, #0d0c12); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); }
  .texte { display: inline-flex; gap: 6px; align-items: center; border: 0; padding: 8px 14px; border-radius: 999px; background: var(--lampe-fond, rgba(255, 179, 71, 0.14)); color: var(--lampe, #ffb347); font-weight: 600; }
  .puce { display: inline-flex; gap: 4px; align-items: center; padding: 3px 10px; border-radius: 999px; background: rgba(13, 12, 18, 0.7); font-size: 12px; color: var(--alerte, #ffd166); }
  .reactions { background: var(--fond-verre); backdrop-filter: var(--flou-verre); -webkit-backdrop-filter: var(--flou-verre); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 999px; padding: 2px 6px; gap: 0; }
  .emoji { width: 40px; height: 40px; font-size: 20px; }
  .pastille { position: absolute; top: 8px; right: 8px; width: 10px; height: 10px; border-radius: 50%; background: var(--lampe, #ffb347); }
  .menu-ancre { position: relative; }
  .popover { position: absolute; bottom: 52px; left: 0; z-index: 8; min-width: 260px; display: grid; gap: 10px; padding: 12px 14px; border-radius: 16px; background: var(--s2); border: 1px solid var(--bord-vif); box-shadow: var(--ombre-3); }
  .popover label { display: grid; gap: 4px; font-size: 0.85rem; color: var(--doux, #c0bacb); }
  .popover label.case { display: flex; gap: 8px; align-items: center; color: var(--texte, #f7f3ee); }
  .popover select { background: var(--s3, #282532); border: 1px solid var(--bord-champ, #7d7790); color: inherit; border-radius: 8px; padding: 6px; }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
  legend { font-size: 0.8rem; color: var(--discret, #9f99ad); margin-bottom: 4px; }
  .vide { margin: 0; color: var(--discret, #9f99ad); font-size: 0.85rem; }
  @media (max-width: 640px) {
    .commandes { padding: 8px 12px 12px; background: var(--s1, #15141c); }
    .rond { width: 48px; height: 48px; }
    .reactions { width: 100%; justify-content: space-between; order: 3; }
    .emoji { width: 38px; height: 38px; }
    .rangee { justify-content: center; }
    .popover { left: auto; right: 0; }
  }
</style>
