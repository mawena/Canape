<script lang="ts">
  // Sas avant d'entrer : test de la caméra et du micro (vu-mètre), choix des périphériques, casque. Le clic sur
  // « Entrer » est aussi le geste qui autorise le son et la lecture automatique.
  import { onDestroy, onMount } from 'svelte';
  import Mic from '@lucide/svelte/icons/mic';
  import MicOff from '@lucide/svelte/icons/mic-off';
  import Video from '@lucide/svelte/icons/video';
  import VideoOff from '@lucide/svelte/icons/video-off';
  import Headphones from '@lucide/svelte/icons/headphones';
  import { Bouton } from '$lib/ui/index.ts';
  import { libelleAppareil, mesurerMicro, ouvrirMedias, type RaisonSansMedias } from './medias.ts';
  import type { Salle } from './salle.svelte.ts';

  let { salle, surQuitter }: { salle: Salle; surQuitter: () => void } = $props();

  let flux: MediaStream | null = $state(null);
  let raison: RaisonSansMedias | null = $state(null);
  let microActif = $state(true);
  let cameraActive = $state(true);
  let niveau = $state(0);
  let previsualisation: HTMLVideoElement | undefined = $state();
  let ouvertureEnCours = $state(true);
  let arreterMesure: (() => void) | null = null;
  let ctx: AudioContext | null = null;
  let entre = false;

  async function ouvrir(): Promise<void> {
    ouvertureEnCours = true;
    arreterMesure?.();
    flux?.getTracks().forEach((t) => t.stop());
    const r = await ouvrirMedias({
      micro: salle.prefs.micro ?? undefined, camera: salle.prefs.camera ?? undefined, casque: salle.prefs.casque,
    });
    flux = r.flux;
    raison = r.raison;
    ouvertureEnCours = false;
    await salle.rafraichirPeripheriques();
    if (!salle.prefs.casque && salle.casqueDetecte) salle.prefs.casque = false;
    const piste = flux?.getAudioTracks()[0];
    if (piste) {
      ctx ??= new AudioContext();
      arreterMesure = mesurerMicro(ctx, piste, (n) => { niveau = microActif ? n : 0; });
    }
  }

  onMount(() => { void ouvrir(); });
  onDestroy(() => {
    arreterMesure?.();
    void ctx?.close().catch(() => {});
    if (!entre) flux?.getTracks().forEach((t) => t.stop());
  });

  $effect(() => {
    if (previsualisation) previsualisation.srcObject = flux ? new MediaStream(flux.getVideoTracks()) : null;
  });

  function basculerMicro(): void {
    microActif = !microActif;
    flux?.getAudioTracks().forEach((t) => { t.enabled = microActif; });
  }
  function basculerCamera(): void {
    cameraActive = !cameraActive;
    flux?.getVideoTracks().forEach((t) => { t.enabled = cameraActive; });
  }
  function changer(genre: 'micro' | 'camera', e: Event): void {
    salle.prefs[genre] = (e.currentTarget as HTMLSelectElement).value || null;
    salle.sauverPrefs();
    void ouvrir();
  }
  function changerCasque(e: Event): void {
    salle.prefs.casque = (e.currentTarget as HTMLInputElement).checked;
    salle.sauverPrefs();
    void ouvrir();
  }

  async function entrer(): Promise<void> {
    entre = true;
    arreterMesure?.();
    void ctx?.close().catch(() => {});
    ctx = null;
    await salle.entrer(flux);
  }

  const texteRaison: Record<RaisonSansMedias, string> = {
    insecure: 'La caméra et le micro demandent une connexion sécurisée (HTTPS). Tu peux quand même entrer et suivre le film.',
    refus: 'Caméra et micro refusés : tu suivras le film sans te montrer. Tu peux les autoriser dans les réglages du navigateur.',
    absent: 'Aucune caméra ni aucun micro trouvé : tu suivras le film sans te montrer.',
  };
</script>

<main class="sas" data-test="sas">
  <section class="carte">
    <h1>Avant d’entrer</h1>
    <p class="sous">{salle.titre}</p>

    <div class="apercu" class:sans-image={!flux || !cameraActive || !flux.getVideoTracks().length}>
      <video bind:this={previsualisation} autoplay muted playsinline aria-label="Aperçu de ta caméra"></video>
      {#if !flux?.getVideoTracks().length || !cameraActive}
        <span class="initiale" aria-hidden="true">{(salle.seance?.invites[0]?.prenom ?? '?').slice(0, 1)}</span>
      {/if}
    </div>

    <div class="boutons">
      <button type="button" class="rond" class:coupe={!microActif} disabled={!flux?.getAudioTracks().length} onclick={basculerMicro}
        aria-label={microActif ? 'Couper le micro' : 'Réactiver le micro'} data-test="sas-micro">
        {#if microActif}<Mic size={22} />{:else}<MicOff size={22} />{/if}
      </button>
      <div class="vu" role="meter" aria-label="Niveau du micro" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(niveau * 100)} data-test="sas-vumetre">
        <span style:width="{Math.round(niveau * 100)}%"></span>
      </div>
      <button type="button" class="rond" class:coupe={!cameraActive} disabled={!flux?.getVideoTracks().length} onclick={basculerCamera}
        aria-label={cameraActive ? 'Couper la caméra' : 'Réactiver la caméra'} data-test="sas-camera">
        {#if cameraActive}<Video size={22} />{:else}<VideoOff size={22} />{/if}
      </button>
    </div>

    {#if raison}<p class="info" role="status">{texteRaison[raison]}</p>{/if}

    <div class="champs">
      <label>Micro
        <select onchange={(e) => changer('micro', e)} disabled={!salle.peripheriques.micros.length}>
          <option value="">Par défaut</option>
          {#each salle.peripheriques.micros as d, i (d.deviceId)}
            <option value={d.deviceId} selected={d.deviceId === salle.prefs.micro}>{libelleAppareil(d, i)}</option>
          {/each}
        </select>
      </label>
      <label>Caméra
        <select onchange={(e) => changer('camera', e)} disabled={!salle.peripheriques.cameras.length}>
          <option value="">Par défaut</option>
          {#each salle.peripheriques.cameras as d, i (d.deviceId)}
            <option value={d.deviceId} selected={d.deviceId === salle.prefs.camera}>{libelleAppareil(d, i)}</option>
          {/each}
        </select>
      </label>
    </div>

    <label class="casque">
      <input type="checkbox" checked={salle.prefs.casque} onchange={changerCasque} data-test="sas-casque" />
      <Headphones size={18} aria-hidden="true" />
      <span>J’ai un casque{salle.casqueDetecte ? ' (détecté)' : ''}</span>
    </label>
    <p class="conseil">Un casque évite l’écho : sans casque, le film repart dans le micro.</p>

    <div class="actions">
      <Bouton variante="discret" onclick={surQuitter}>Retour</Bouton>
      <Bouton onclick={entrer} chargement={ouvertureEnCours} data-test="entrer-salle">Entrer dans la salle</Bouton>
    </div>
  </section>
</main>

<style>
  .sas { min-height: 100dvh; display: grid; place-items: center; padding: 16px; background: radial-gradient(800px 480px at 50% 0%, rgba(255, 179, 71, 0.1), transparent 70%), var(--fond, #0d0c12); color: var(--texte, #f7f3ee); }
  .carte { width: min(520px, 100%); background: var(--s1, #15141c); border-radius: var(--r-xl, 28px); padding: 28px; display: grid; gap: 16px; border: 1px solid var(--bord); box-shadow: var(--ombre-4); }
  h1 { font-family: 'Instrument Serif', var(--titre, Georgia, serif); font-size: 2rem; font-weight: 400; margin: 0; }
  .sous { margin: -8px 0 0; color: var(--doux, #c0bacb); }
  .apercu { position: relative; aspect-ratio: 4 / 3; border-radius: var(--r-l, 20px); overflow: hidden; background: var(--s3); display: grid; place-items: center; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.07); }
  .apercu video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
  .apercu.sans-image video { visibility: hidden; }
  .initiale { font-family: 'Instrument Serif', Georgia, serif; font-size: 3rem; width: 96px; height: 96px; border-radius: 50%; background: var(--lampe, #ffb347); color: #16101c; display: grid; place-items: center; }
  .boutons { display: flex; align-items: center; gap: 12px; }
  .rond { width: 48px; height: 48px; border-radius: 50%; border: 1px solid var(--bord-vif); display: grid; place-items: center; background: var(--s3); color: var(--texte, #f7f3ee); }
  .rond.coupe { background: rgba(255, 123, 110, 0.16); color: var(--mal, #ff7b6e); }
  .rond:disabled { opacity: 0.45; }
  .vu { flex: 1; height: 8px; border-radius: 4px; background: var(--s3, #282532); overflow: hidden; }
  .vu span { display: block; height: 100%; background: var(--ok, #5fdcae); transition: width 60ms linear; }
  .info { margin: 0; padding: 10px 12px; border-radius: 10px; background: rgba(255, 209, 102, 0.12); color: var(--alerte, #ffd166); font-size: 0.9rem; }
  .champs { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  label { display: grid; gap: 4px; font-size: 0.85rem; color: var(--doux, #c0bacb); }
  select { background: var(--s2, #1d1b26); border: 1px solid var(--bord-champ, #7d7790); border-radius: var(--r-m); padding: 0 10px; min-height: 44px; color: var(--texte); min-width: 0; }
  .casque { display: flex; align-items: center; gap: 8px; color: var(--texte, #f7f3ee); font-size: 0.95rem; }
  .conseil { margin: -8px 0 0; font-size: 0.85rem; color: var(--discret, #9f99ad); }
  .actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; }
  @media (max-width: 480px) { .champs { grid-template-columns: 1fr; } }
</style>
