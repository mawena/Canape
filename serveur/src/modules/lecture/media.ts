// Service de fichiers avec `Range`, `ETag` et en-têtes de cache privés.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { introuvable } from '../../commun/erreurs.ts';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.m4s': 'video/iso.segment', '.vtt': 'text/vtt; charset=utf-8',
};

export function typeMime(chemin: string): string {
  return TYPES[path.extname(chemin).toLowerCase()] ?? 'application/octet-stream';
}

/** Découpe l'en-tête `Range` (une seule plage) : `null` = pas de plage, `'invalide'` = 416. */
export function analyserPlage(entete: string | undefined, taille: number): { debut: number; fin: number } | null | 'invalide' {
  if (!entete) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let debut: number;
  let fin: number;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'invalide';
    debut = Math.max(0, taille - n);
    fin = taille - 1;
  } else {
    debut = Number(m[1]);
    fin = m[2] === '' ? taille - 1 : Math.min(Number(m[2]), taille - 1);
  }
  if (debut >= taille || debut > fin) return 'invalide';
  return { debut, fin };
}

export async function servirFichier(
  req: FastifyRequest, reply: FastifyReply, chemin: string, options: { type?: string; cache?: string } = {},
): Promise<FastifyReply> {
  const st = await stat(chemin).catch(() => null);
  if (!st?.isFile()) throw introuvable();
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  reply.header('Accept-Ranges', 'bytes').header('Content-Type', options.type ?? typeMime(chemin))
    .header('Last-Modified', st.mtime.toUTCString()).header('ETag', etag)
    .header('Cache-Control', options.cache ?? 'private, max-age=3600');
  if (req.headers['if-none-match'] === etag) return reply.status(304).send();
  const plage = analyserPlage(req.headers.range, st.size);
  if (plage === 'invalide') return reply.status(416).header('Content-Range', `bytes */${st.size}`).send();
  const debut = plage?.debut ?? 0;
  const fin = plage?.fin ?? st.size - 1;
  if (plage) reply.status(206).header('Content-Range', `bytes ${debut}-${fin}/${st.size}`);
  reply.header('Content-Length', st.size === 0 ? 0 : fin - debut + 1);
  if (req.method === 'HEAD' || st.size === 0) return reply.send();
  return reply.send(createReadStream(chemin, { start: debut, end: fin }));
}
