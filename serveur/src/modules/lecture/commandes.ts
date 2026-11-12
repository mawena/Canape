// Lignes de commande ffmpeg (fonctions pures, testées sans ffmpeg).
import { DUREE_SEGMENT_HLS, type PisteVideoAnalysee } from '@canape/partage';

/** Préréglages x264 utilisables à la volée, du plus rapide au plus lent. Les trois produisent le même segment d'initialisation. */
export const PRESETS = ['superfast', 'veryfast', 'faster'] as const;
export type Preset = (typeof PRESETS)[number];

/**
 * Paramètres x264 fixés pour que tous les lancements (et tous les préréglages) donnent les mêmes SPS/PPS :
 * un seul `init.mp4` vaut pour tous les segments. Pas d'images B : horodatages sans décalage de réordonnancement.
 */
export const X264_HLS = 'ref=3:bframes=0:weightp=1:cabac=1:8x8dct=1:scenecut=0:open-gop=0';

export const LARGEUR_CIBLE = 1920;
export const HAUTEUR_CIBLE = 1080;

const pair = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Dimensions de sortie : tient dans 1920×1080, proportions gardées, valeurs paires. */
export function dimensionsCible(largeur: number, hauteur: number): { largeur: number; hauteur: number; reduit: boolean } {
  if (largeur <= LARGEUR_CIBLE && hauteur <= HAUTEUR_CIBLE) return { largeur: pair(largeur), hauteur: pair(hauteur), reduit: false };
  const f = Math.min(LARGEUR_CIBLE / largeur, HAUTEUR_CIBLE / hauteur);
  return { largeur: pair(largeur * f), hauteur: pair(hauteur * f), reduit: true };
}

/** Chaîne de filtres vidéo : réduction **avant** le calcul HDR → SDR, sortie `yuv420p`. */
export function filtreVideo(v: PisteVideoAnalysee): string {
  const c = dimensionsCible(v.largeur, v.hauteur);
  if (v.hdr) {
    const tin = v.hdrType === 'hlg' ? 'arib-std-b67' : 'smpte2084';
    const reduction = c.reduit ? `zscale=w=${c.largeur}:h=${c.hauteur}:f=bicubic:tin=${tin}:pin=bt2020:min=bt2020nc:rin=limited,` : '';
    return `${reduction}zscale=tin=${tin}:pin=bt2020:min=bt2020nc:rin=limited:t=linear:npl=100,format=gbrpf32le,`
      + 'zscale=p=bt709,tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=limited,format=yuv420p';
  }
  return c.reduit ? `scale=w=${c.largeur}:h=${c.hauteur}:flags=bicubic,format=yuv420p` : 'format=yuv420p';
}

export interface OptionsHls {
  entree: string;
  videoIndex: number;
  /** `null` : film sans piste audio. */
  audioIndex: number | null;
  video: PisteVideoAnalysee;
  mode: 'copie' | 'conversion';
  /** Premier segment à produire (toujours 0 en mode copie). */
  debut: number;
  preset: Preset;
  fils: number;
  dossier: string;
  /** Suffixe unique du lancement (nom du segment d'initialisation et de la liste de ffmpeg). */
  sequence: number;
  /** Durée maximale à produire (secondes) : sert à fabriquer le segment d'initialisation. */
  limite?: number;
}

const COMMUN = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats'];

export function argsHls(o: OptionsHls): string[] {
  const a = [...COMMUN];
  const ss = o.debut * DUREE_SEGMENT_HLS;
  if (o.mode === 'conversion' && o.debut > 0) a.push('-ss', String(ss));
  a.push('-i', o.entree, '-map', `0:${o.videoIndex}`);
  if (o.audioIndex !== null) a.push('-map', `0:${o.audioIndex}`);
  if (o.mode === 'copie') {
    a.push('-c:v', 'copy');
  } else {
    a.push(
      '-vf', filtreVideo(o.video), '-c:v', 'libx264', '-preset', o.preset, '-profile:v', 'high', '-level', '4.1',
      '-crf', '23', '-maxrate', '6M', '-bufsize', '12M', '-threads', String(o.fils), '-x264-params', X264_HLS,
      '-force_key_frames', `expr:gte(t,n_forced*${DUREE_SEGMENT_HLS})`,
    );
  }
  if (o.audioIndex !== null) a.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-ar', '48000');
  if (o.limite !== undefined) a.push('-t', String(o.limite));
  if (o.mode === 'conversion' && o.debut > 0) a.push('-output_ts_offset', String(ss));
  a.push(
    '-f', 'hls', '-hls_time', String(DUREE_SEGMENT_HLS), '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', `init-${o.sequence}.mp4`, '-hls_segment_filename', `${o.dossier}/%d.m4s`,
    '-start_number', String(o.debut), '-hls_flags', 'temp_file', '-hls_list_size', '0', `${o.dossier}/liste-${o.sequence}.m3u8`,
  );
  return a;
}

export interface OptionsPreparation {
  entree: string;
  sortie: string;
  videoIndex: number;
  audioIndex: number | null;
  video: PisteVideoAnalysee;
  /** Image déjà lisible partout : recopiée telle quelle. */
  copieVideo: boolean;
  fils: number;
}

export function argsPreparation(o: OptionsPreparation): string[] {
  const a = [...COMMUN, '-i', o.entree, '-map', `0:${o.videoIndex}`];
  if (o.audioIndex !== null) a.push('-map', `0:${o.audioIndex}`);
  if (o.copieVideo) a.push('-c:v', 'copy');
  else a.push('-vf', filtreVideo(o.video), '-c:v', 'libx264', '-preset', 'fast', '-profile:v', 'high', '-level', '4.1', '-crf', '20', '-threads', String(o.fils));
  if (o.audioIndex !== null) a.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000');
  a.push('-sn', '-dn', '-movflags', '+faststart', '-f', 'mp4', '-y', o.sortie);
  return a;
}

export function argsSousTitres(entree: string, index: number, sortie: string): string[] {
  return ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', entree, '-map', `0:${index}`, '-f', 'webvtt', sortie];
}
