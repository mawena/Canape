// Branche une vidéo sur un plan de lecture (contrat : docs/CONCEPTION.md, « Lecture »).
//
// API (utilisée par la salle, ne pas la changer) :
//   chargerPlan(filmId, pisteAudio)  → Promise<PlanDeLecture>
//       `pisteAudio` négatif = piste par défaut (aucun `?audio=` envoyé).
//   attacherLecture(video, plan)     → () => void   (détache tout : hls.js, source, pistes de sous-titres)
// Ajouts : `moteurPour` (choix du moteur, pur), `EVENEMENT_ERREUR_LECTURE`, `reglagesHls`.
//
// Chaque `<track>` ajouté porte `id = cle` (`p<index>` / `e<id>`), `label = libelle`, `srclang` si la langue est connue,
// et démarre désactivé (`mode = 'disabled'`) : l'appelant active celui qu'il veut.
// Quand la lecture échoue pour de bon, la vidéo reçoit l'évènement `canape-erreur-lecture` (`detail.message`).
import type { PlanDeLecture } from '@canape/partage';
import type { HlsConfig } from 'hls.js';
import { api } from '../api/client.ts';

export const EVENEMENT_ERREUR_LECTURE = 'canape-erreur-lecture';

/** `GET /api/films/:id/lecture?audio=` ; une piste négative veut dire « piste par défaut ». */
export function chargerPlan(filmId: string, pisteAudio: number): Promise<PlanDeLecture> {
  const requete = pisteAudio >= 0 ? `?audio=${pisteAudio}` : '';
  return api.get<PlanDeLecture>(`/api/films/${encodeURIComponent(filmId)}/lecture${requete}`);
}

export type Moteur = 'direct' | 'hlsjs' | 'natif';

/** Lecture directe, hls.js (MediaSource présent) ou HLS natif (iPhone : pas de MediaSource). */
export function moteurPour(plan: Pick<PlanDeLecture, 'mode'>, aMediaSource: boolean): Moteur {
  if (plan.mode === 'direct') return 'direct';
  return aMediaSource ? 'hlsjs' : 'natif';
}

/**
 * Réglages hls.js pour une VOD dont les segments arrivent lentement (conversion à la volée) : délais et reprises
 * longs, tampon raisonnable, pas de mode faible latence.
 */
export function reglagesHls(): Partial<HlsConfig> {
  const reprise = { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 };
  const politique = (premierOctetMs: number, totalMs: number) => ({
    default: { maxTimeToFirstByteMs: premierOctetMs, maxLoadTimeMs: totalMs, timeoutRetry: reprise, errorRetry: reprise },
  });
  return {
    lowLatencyMode: false,
    enableWorker: true,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    backBufferLength: 30,
    maxBufferHole: 0.5,
    nudgeMaxRetry: 10,
    manifestLoadPolicy: politique(60_000, 90_000),
    playlistLoadPolicy: politique(60_000, 90_000),
    fragLoadPolicy: politique(60_000, 120_000),
  };
}

function signaler(video: HTMLVideoElement, message: string): void {
  video.dispatchEvent(new CustomEvent(EVENEMENT_ERREUR_LECTURE, { detail: { message } }));
}

function ajouterPistes(video: HTMLVideoElement, plan: PlanDeLecture): HTMLTrackElement[] {
  return plan.sousTitres.map((s) => {
    const piste = document.createElement('track');
    piste.kind = 'subtitles';
    piste.id = s.cle;
    piste.label = s.libelle;
    if (s.langue) piste.srclang = s.langue;
    piste.src = s.url;
    video.appendChild(piste);
    piste.track.mode = 'disabled';
    return piste;
  });
}

/** Branche `video` sur `plan` et rend la fonction qui détache tout proprement. */
export function attacherLecture(video: HTMLVideoElement, plan: PlanDeLecture): () => void {
  let detache = false;
  let hls: { destroy(): void } | null = null;
  const pistes = ajouterPistes(video, plan);
  const moteur = moteurPour(plan, typeof MediaSource !== 'undefined');

  if (moteur === 'hlsjs') {
    void import('hls.js')
      .then(({ default: Hls }) => {
        if (detache) return;
        if (!Hls.isSupported()) {
          video.src = plan.url;
          return;
        }
        const h = new Hls(reglagesHls());
        hls = h;
        let reprises: number[] = [];
        h.on(Hls.Events.ERROR, (_e, donnees) => {
          if (!donnees.fatal) return;
          const maintenant = Date.now();
          reprises = reprises.filter((t) => maintenant - t < 60_000);
          if (reprises.length >= 5) {
            h.destroy();
            hls = null;
            signaler(video, 'La lecture a rencontré une erreur. Recharge la page pour réessayer.');
            return;
          }
          reprises.push(maintenant);
          if (donnees.type === Hls.ErrorTypes.NETWORK_ERROR) h.startLoad();
          else if (donnees.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
          else {
            h.destroy();
            hls = null;
            signaler(video, 'La lecture a rencontré une erreur. Recharge la page pour réessayer.');
          }
        });
        h.loadSource(plan.url);
        h.attachMedia(video);
      })
      .catch(() => signaler(video, "Le lecteur n'a pas pu démarrer."));
  } else {
    video.src = plan.url;
  }

  return () => {
    detache = true;
    hls?.destroy();
    hls = null;
    for (const p of pistes) p.remove();
    video.removeAttribute('src');
    video.load();
  };
}
