// Choix du mode de lecture (règles 1 à 3 de « Lecture universelle » ; la 4 — préparation — est gérée à part).
import path from 'node:path';
import type { Analyse, PisteAudioAnalysee, PisteVideoAnalysee } from '@canape/partage';

export type ModeChoisi = 'direct' | 'copie' | 'conversion';

export interface Decision {
  mode: ModeChoisi;
  /** Phrase en français simple. */
  raison: string;
}

const NOMS_CODECS: Record<string, string> = {
  hevc: 'HEVC', h264: 'H.264', mpeg4: 'MPEG-4', mpeg2video: 'MPEG-2', vc1: 'VC-1', vp9: 'VP9', vp8: 'VP8', av1: 'AV1',
  wmv3: 'WMV', msmpeg4v3: 'MPEG-4', theora: 'Theora', prores: 'ProRes',
};

const AUDIO_MP4 = new Set(['aac', 'mp3', 'opus']);
const AUDIO_WEBM = new Set(['opus', 'vorbis']);
const VIDEO_MP4 = new Set(['h264', 'vp9', 'av1']);
const VIDEO_WEBM = new Set(['vp8', 'vp9', 'av1']);

/** `mp4` (MP4, M4V, MOV), `webm`, ou `autre` d'après l'extension et le format ffprobe. */
export function familleConteneur(nomFichier: string, conteneur: string): 'mp4' | 'webm' | 'autre' {
  const ext = path.extname(nomFichier).toLowerCase();
  if (['.mp4', '.m4v', '.mov'].includes(ext) && /mp4|mov/.test(conteneur)) return 'mp4';
  if (ext === '.webm' && /webm|matroska/.test(conteneur)) return 'webm';
  return 'autre';
}

/** Hauteur maximale de ce que les navigateurs lisent sans conversion (1080p, marge pour 1088 et 2K). */
export const LARGEUR_MAX_DIRECT = 2048;
export const HAUTEUR_MAX_DIRECT = 1088;

function imageSimple(v: PisteVideoAnalysee): boolean {
  return !v.hdr && v.profondeurBits <= 8 && (v.pixFmt === null || v.pixFmt === 'yuv420p' || v.pixFmt === 'yuvj420p')
    && v.largeur <= LARGEUR_MAX_DIRECT && v.hauteur <= HAUTEUR_MAX_DIRECT;
}

/** Résumé des raisons qui obligent à convertir l'image : « HEVC 10 bits, HDR ». */
export function raisonsImage(v: PisteVideoAnalysee): string {
  const r: string[] = [];
  const nom = NOMS_CODECS[v.codec] ?? v.codec.toUpperCase();
  if (v.codec !== 'h264' || v.profondeurBits > 8) r.push(v.profondeurBits > 8 ? `${nom} ${v.profondeurBits} bits` : nom);
  if (v.hdrType === 'dolby-vision') r.push('Dolby Vision');
  else if (v.hdr) r.push('HDR');
  if (v.largeur > LARGEUR_MAX_DIRECT || v.hauteur > HAUTEUR_MAX_DIRECT) r.push(v.hauteur >= 2000 ? '4K' : `${v.hauteur} p`);
  if (v.pixFmt && /422/.test(v.pixFmt)) r.push('couleurs 4:2:2');
  else if (v.pixFmt && /444/.test(v.pixFmt)) r.push('couleurs 4:4:4');
  return r.length ? r.join(', ') : nom;
}

/** Dolby Vision profil 5 : couleurs fausses sans traitement GPU. */
export function dolbyVisionIllisible(v: PisteVideoAnalysee): boolean {
  return v.hdrType === 'dolby-vision' && v.dvProfil === 5;
}

export function decider(analyse: Analyse, nomFichier: string, piste: PisteAudioAnalysee | null): Decision {
  const v = analyse.video;
  if (!v) return { mode: 'conversion', raison: 'Image convertie pendant la lecture' };
  const famille = familleConteneur(nomFichier, analyse.conteneur);
  const imageOk = imageSimple(v);
  const premiere = piste === null || analyse.audio[0]?.index === piste.index;
  const audioOk = piste === null || (premiere && (famille === 'webm' ? AUDIO_WEBM : AUDIO_MP4).has(piste.codec));
  const videoOk = famille === 'webm' ? VIDEO_WEBM.has(v.codec) : VIDEO_MP4.has(v.codec);
  if (famille !== 'autre' && imageOk && videoOk && audioOk) return { mode: 'direct', raison: 'Lu directement' };
  if (imageOk && v.codec === 'h264') {
    const raison = piste !== null && !audioOk
      ? (premiere ? 'Son converti pour ton navigateur' : 'Autre piste audio : son converti pour ton navigateur')
      : 'Fichier adapté pour ton navigateur, sans toucher à l\'image';
    return { mode: 'copie', raison };
  }
  let raison = `Image convertie pendant la lecture (${raisonsImage(v)})`;
  if (dolbyVisionIllisible(v)) raison += ' : Dolby Vision profil 5, les couleurs peuvent être inexactes';
  return { mode: 'conversion', raison };
}

/** Piste audio choisie : celle demandée, sinon la piste par défaut, sinon la première. `undefined` si demandée et absente. */
export function choisirPiste(analyse: Analyse, demandee: number | null): PisteAudioAnalysee | null | undefined {
  if (analyse.audio.length === 0) return null;
  if (demandee === null) return analyse.audio.find((p) => p.parDefaut) ?? analyse.audio[0];
  return analyse.audio.find((p) => p.index === demandee);
}
