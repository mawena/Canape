// Analyse d'un fichier vidéo par ffprobe → `Analyse` (partage/src/films.ts).
import type { Analyse, PisteAudioAnalysee, PisteSousTitresAnalysee, PisteVideoAnalysee } from '@canape/partage';
import { ffprobeJson, type OptionsExecuter, type SortieFfprobe } from '../../commun/ffmpeg.ts';

type Flux = NonNullable<SortieFfprobe['streams']>[number];

const CODECS_TEXTE = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text', 'subviewer', 'microdvd', 'sami', 'jacosub', 'realtext']);

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const nombre = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const tags = (f: Flux): Record<string, string> => (f['tags'] as Record<string, string> | undefined) ?? {};
const disposition = (f: Flux): Record<string, number> => (f['disposition'] as Record<string, number> | undefined) ?? {};

function fps(v: unknown): number | null {
  const m = /^(\d+)\/(\d+)$/.exec(String(v ?? ''));
  if (!m || Number(m[2]) === 0) return null;
  return Math.round((Number(m[1]) / Number(m[2])) * 1000) / 1000;
}

function profondeur(f: Flux): number {
  const brut = nombre(f['bits_per_raw_sample']);
  if (brut) return brut;
  const m = /(\d{2})(?:le|be)?$/.exec(String(f['pix_fmt'] ?? ''));
  const n = m ? Number(m[1]) : 8;
  return n >= 9 && n <= 16 ? n : 8;
}

export function typeHdr(f: Flux): 'non' | 'hdr10' | 'hlg' | 'dolby-vision' {
  const annexes = (f['side_data_list'] as Array<Record<string, unknown>> | undefined) ?? [];
  if (annexes.some((a) => /dovi|dolby vision/i.test(String(a['side_data_type'] ?? '')) || a['dv_profile'] !== undefined)) return 'dolby-vision';
  const transfert = String(f['color_transfer'] ?? '');
  if (transfert === 'smpte2084') return 'hdr10';
  if (transfert === 'arib-std-b67') return 'hlg';
  return 'non';
}

function profilDolbyVision(f: Flux): number | null {
  const annexes = (f['side_data_list'] as Array<Record<string, unknown>> | undefined) ?? [];
  const dv = annexes.find((a) => a['dv_profile'] !== undefined);
  return dv ? nombre(dv['dv_profile']) : null;
}

function video(f: Flux): PisteVideoAnalysee {
  const hdrType = typeHdr(f);
  return {
    index: f.index,
    codec: f.codec_name ?? 'inconnu',
    profil: texte(f['profile']),
    largeur: nombre(f['width']) ?? 0,
    hauteur: nombre(f['height']) ?? 0,
    profondeurBits: profondeur(f),
    pixFmt: texte(f['pix_fmt']),
    hdr: hdrType !== 'non',
    hdrType,
    dvProfil: hdrType === 'dolby-vision' ? profilDolbyVision(f) : null,
    fps: fps(f['avg_frame_rate']) ?? fps(f['r_frame_rate']),
    debit: nombre(f['bit_rate']),
  };
}

function audio(f: Flux): PisteAudioAnalysee {
  return {
    index: f.index,
    codec: f.codec_name ?? 'inconnu',
    langue: texte(tags(f)['language']) && tags(f)['language'] !== 'und' ? tags(f)['language']! : null,
    titre: texte(tags(f)['title']),
    canaux: nombre(f['channels']) ?? 2,
    debit: nombre(f['bit_rate']),
    parDefaut: disposition(f)['default'] === 1,
  };
}

function sousTitres(f: Flux): PisteSousTitresAnalysee {
  const titre = texte(tags(f)['title']);
  const d = disposition(f);
  return {
    index: f.index,
    codec: f.codec_name ?? 'inconnu',
    langue: texte(tags(f)['language']) && tags(f)['language'] !== 'und' ? tags(f)['language']! : null,
    titre,
    texte: CODECS_TEXTE.has(f.codec_name ?? ''),
    force: d['forced'] === 1 || /forc|forced/i.test(titre ?? ''),
    sdh: d['hearing_impaired'] === 1 || /\bsdh\b|malentendant/i.test(titre ?? ''),
    parDefaut: d['default'] === 1,
  };
}

/** Transforme la sortie de ffprobe en `Analyse` ; lève une erreur française si ce n'est pas une vidéo. */
export function construireAnalyse(sortie: SortieFfprobe): Analyse {
  const flux = sortie.streams ?? [];
  const videos = flux.filter((f) => f.codec_type === 'video' && disposition(f)['attached_pic'] !== 1);
  const principale = videos[0];
  if (!principale) throw new Error("Aucune piste vidéo n'a été trouvée dans ce fichier.");
  const duree = nombre(sortie.format?.duration) ?? nombre(principale['duration']) ?? 0;
  return {
    conteneur: sortie.format?.format_name ?? 'inconnu',
    duree,
    debit: nombre(sortie.format?.bit_rate),
    video: video(principale),
    audio: flux.filter((f) => f.codec_type === 'audio').map(audio),
    sousTitres: flux.filter((f) => f.codec_type === 'subtitle').map(sousTitres),
  };
}

export async function analyserFichier(chemin: string, options: OptionsExecuter = {}): Promise<Analyse> {
  let sortie: SortieFfprobe;
  try {
    sortie = await ffprobeJson(chemin, options);
  } catch {
    throw new Error("Ce fichier n'est pas une vidéo que le serveur sait lire.");
  }
  return construireAnalyse(sortie);
}
