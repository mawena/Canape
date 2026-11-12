// provisoire, remplacé par le module lecture à l'intégration.
// API attendue par la salle : `chargerPlan(filmId, pisteAudio)` et `attacherLecture(video, plan)`.
// `pisteAudio` négatif = piste par défaut (le paramètre `audio` est alors omis).
import type { PlanDeLecture } from '@canape/partage';
import { api } from '$lib/api/client.ts';

export function chargerPlan(filmId: string, pisteAudio: number): Promise<PlanDeLecture> {
  const requete = pisteAudio >= 0 ? `?audio=${pisteAudio}` : '';
  return api.get<PlanDeLecture>(`/api/films/${encodeURIComponent(filmId)}/lecture${requete}`);
}

/** Branche la source (direct ou HLS natif), ajoute les pistes de sous-titres ; rend la fonction qui détache. */
export function attacherLecture(video: HTMLVideoElement, plan: PlanDeLecture): () => void {
  video.src = plan.url;
  const pistes: HTMLTrackElement[] = [];
  for (const st of plan.sousTitres) {
    const piste = document.createElement('track');
    piste.kind = 'subtitles';
    piste.label = st.libelle;
    piste.srclang = st.langue ?? 'fr';
    piste.src = st.url;
    piste.dataset['cle'] = st.cle;
    video.appendChild(piste);
    pistes.push(piste);
  }
  for (const t of Array.from(video.textTracks)) t.mode = 'disabled';
  video.load();
  return () => {
    video.pause();
    for (const p of pistes) p.remove();
    video.removeAttribute('src');
    video.load();
  };
}
