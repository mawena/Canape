// TMDB (facultatif : seulement si CANAPE_TMDB_CLE est définie). Clé v3 (`api_key`) ou jeton v4 (`Bearer`).
import type { CandidatTmdb } from '@canape/partage';

const API = 'https://api.themoviedb.org/3';
const IMAGES = 'https://image.tmdb.org/t/p';

export interface DetailsTmdb {
  tmdbId: number;
  titre: string;
  annee: number | null;
  resume: string | null;
  genres: string[];
  affiche: string | null;
  fond: string | null;
}

interface ResultatBrut {
  id: number; title?: string; release_date?: string; overview?: string; poster_path?: string | null; backdrop_path?: string | null;
  genres?: Array<{ name: string }>;
}

const annee = (d?: string): number | null => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

export class Tmdb {
  cle: string;
  constructor(cle: string) { this.cle = cle; }

  get actif(): boolean { return this.cle !== ''; }

  private async appeler<T>(chemin: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${API}${chemin}`);
    const entetes: Record<string, string> = { Accept: 'application/json' };
    if (this.cle.length > 40) entetes['Authorization'] = `Bearer ${this.cle}`;
    else url.searchParams.set('api_key', this.cle);
    url.searchParams.set('language', 'fr-FR');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await fetch(url, { headers: entetes, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`TMDB a répondu ${r.status}.`);
    return (await r.json()) as T;
  }

  async rechercher(titre: string, an: number | null): Promise<CandidatTmdb[]> {
    const params: Record<string, string> = { query: titre, include_adult: 'false' };
    if (an) params['year'] = String(an);
    const j = await this.appeler<{ results?: ResultatBrut[] }>('/search/movie', params);
    return (j.results ?? []).slice(0, 10).map((r) => ({
      tmdbId: r.id, titre: r.title ?? '', annee: annee(r.release_date), resume: r.overview || null, affiche: r.poster_path ?? null,
    }));
  }

  async details(tmdbId: number): Promise<DetailsTmdb> {
    const r = await this.appeler<ResultatBrut>(`/movie/${tmdbId}`);
    return {
      tmdbId: r.id, titre: r.title ?? '', annee: annee(r.release_date), resume: r.overview || null,
      genres: (r.genres ?? []).map((g) => g.name), affiche: r.poster_path ?? null, fond: r.backdrop_path ?? null,
    };
  }

  /** Télécharge une image TMDB (`taille` : w185, w500, w1280…). */
  async image(chemin: string, taille: string): Promise<Buffer> {
    if (!/^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(chemin)) throw new Error('Chemin d’image invalide.');
    const r = await fetch(`${IMAGES}/${taille}${chemin}`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`Image TMDB : ${r.status}.`);
    return Buffer.from(await r.arrayBuffer());
  }
}
