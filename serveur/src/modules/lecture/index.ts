// Module « lecture » : plan de lecture, fichiers directs, HLS à la demande, préparation, sous-titres, administration.
// Enregistré sans encapsulation par `app.ts`. N'utilise `app.mediatheque` qu'à l'exécution ou dans `onReady`.
import { rmSync } from 'node:fs';
import { availableParallelism, loadavg } from 'node:os';
import path from 'node:path';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  AUDIO_SANS, type Analyse, type EtatLectureAdmin, type PisteAudioAnalysee, type PlanDeLecture, type SousTitresPlan,
} from '@canape/partage';
import { ErreurHttp, introuvable, requeteInvalide } from '../../commun/erreurs.ts';
import type { FilmService } from '../../commun/services.ts';
import { purger, tailleDossier } from './cache.ts';
import { GestionnaireConversions, type Cible } from './conversions.ts';
import { libelleAudio, libelleSousTitres, libelleSousTitresPiste } from './libelles.ts';
import { servirFichier } from './media.ts';
import { GestionnairePreparations } from './preparations.ts';
import { choisirPiste, decider } from './plan.ts';
import { extraireSousTitres } from './sous-titres.ts';

export interface ServiceLecture {
  conversions: GestionnaireConversions;
  preparations: GestionnairePreparations;
}

declare module 'fastify' {
  interface FastifyInstance {
    lecture: ServiceLecture;
  }
}

const nomPiste = (p: PisteAudioAnalysee | null) => (p ? String(p.index) : AUDIO_SANS);

function analyseDe(film: FilmService): Analyse {
  if (film.etat !== 'pret' || !film.analyse?.video) {
    throw new ErreurHttp(409, 'film_non_pret', "Ce film n'est pas encore prêt à être lu.");
  }
  return film.analyse;
}

/** Film lisible par l'utilisateur de la requête, sinon 404 (jamais d'indice sur son existence). */
function filmVisible(app: FastifyInstance, req: FastifyRequest, id: string): FilmService {
  const film = app.mediatheque.obtenir(id);
  if (!film || !app.mediatheque.peutVoir(req.utilisateur, id)) throw introuvable();
  return film;
}

function filmModifiable(app: FastifyInstance, req: FastifyRequest, id: string): FilmService {
  const film = app.mediatheque.obtenir(id);
  if (!film || !app.mediatheque.peutModifier(req.utilisateur, id)) throw introuvable();
  return film;
}

/** `:audio` d'une adresse → piste (ou `null` : film sans audio) ; 404 si elle n'existe pas. */
function pisteDeAdresse(analyse: Analyse, brut: string): PisteAudioAnalysee | null {
  if (brut === AUDIO_SANS) {
    if (analyse.audio.length > 0) throw introuvable();
    return null;
  }
  if (!/^\d+$/.test(brut)) throw introuvable();
  const p = analyse.audio.find((a) => a.index === Number(brut));
  if (!p) throw introuvable();
  return p;
}

function entierOuNull(v: unknown, nom: string): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw requeteInvalide(`${nom} doit être un entier.`);
  return n < 0 ? null : n;
}

const modulelecture: FastifyPluginAsync = async (app) => {
  const { config } = app;
  const journal = { info: (m: string) => app.log.info(m), warn: (m: string) => app.log.warn(m) };
  const conversions = new GestionnaireConversions(config, journal);
  const preparations = new GestionnairePreparations(app.db, config, conversions, (id) => app.mediatheque.obtenir(id), journal);
  app.decorate('lecture', { conversions, preparations } satisfies ServiceLecture);

  const cible = (film: FilmService, analyse: Analyse, piste: PisteAudioAnalysee | null, mode: 'copie' | 'conversion'): Cible => ({
    filmId: film.id, titre: film.titre, entree: film.cheminAbsolu, analyse, audio: piste, mode,
  });

  /** Cible HLS d'une requête `/media/:id/hls/:audio/…` (404 si le film se lit autrement). */
  function cibleHls(req: FastifyRequest, id: string, audio: string): Cible {
    const film = filmVisible(app, req, id);
    const analyse = analyseDe(film);
    const piste = pisteDeAdresse(analyse, audio);
    const d = decider(analyse, film.fichier, piste);
    if (d.mode === 'direct') throw introuvable();
    return cible(film, analyse, piste, d.mode);
  }

  const abandon = (reply: FastifyReply): AbortSignal => {
    const c = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) c.abort();
    });
    return c.signal;
  };

  // --- Plan de lecture ---------------------------------------------------------------------------------------------
  app.get<{ Params: { id: string }; Querystring: { audio?: string } }>(
    '/api/films/:id/lecture', { preHandler: app.exigerConnexion }, async (req) => {
      const film = filmVisible(app, req, req.params.id);
      const analyse = analyseDe(film);
      const demandee = entierOuNull(req.query.audio, 'audio');
      const piste = choisirPiste(analyse, demandee);
      if (piste === undefined) throw requeteInvalide("Cette piste audio n'existe pas.");
      const idAudio = piste?.index ?? -1;
      const prep = preparations.ligne(film.id, idAudio);
      const prete = preparations.cheminPrepare(film.id, idAudio) !== null;
      let mode: PlanDeLecture['mode'];
      let url: string;
      let raison: string;
      if (prete) {
        mode = 'direct';
        url = `/media/${film.id}/prepare/${nomPiste(piste)}.mp4`;
        raison = 'Version préparée, lue directement';
      } else {
        const d = decider(analyse, film.fichier, piste);
        raison = d.raison;
        if (d.mode === 'direct') {
          mode = 'direct';
          url = `/media/${film.id}/original`;
        } else {
          mode = 'hls';
          url = `/media/${film.id}/hls/${nomPiste(piste)}/index.m3u8`;
        }
      }
      const sousTitres: SousTitresPlan[] = [];
      const images: NonNullable<PlanDeLecture['sousTitresImage']> = [];
      for (const s of analyse.sousTitres) {
        if (s.texte) {
          sousTitres.push({
            cle: `p${s.index}`, langue: s.langue, libelle: libelleSousTitresPiste(s), force: s.force, sdh: s.sdh,
            url: `/media/${film.id}/sous-titres/p${s.index}.vtt`,
          });
        } else images.push({ langue: s.langue, libelle: libelleSousTitresPiste(s) });
      }
      const externes = app.db.prepare('SELECT id, langue, libelle FROM sous_titres_externes WHERE film_id = ? ORDER BY id').all(film.id) as
        Array<{ id: number; langue: string | null; libelle: string }>;
      for (const e of externes) {
        const force = /forc/i.test(e.libelle);
        const sdh = /\bsdh\b|malentendant/i.test(e.libelle);
        sousTitres.push({
          cle: `e${e.id}`, langue: e.langue, libelle: e.libelle || libelleSousTitres(e.langue, force, sdh), force, sdh,
          url: `/media/${film.id}/sous-titres/e${e.id}.vtt`,
        });
      }
      const plan: PlanDeLecture = {
        mode, url, duree: analyse.duree,
        pistesAudio: analyse.audio.map((a) => ({ index: a.index, langue: a.langue, libelle: libelleAudio(a), canaux: a.canaux, parDefaut: a.parDefaut })),
        sousTitres, raison, preparation: prep ? { etat: prep.etat, progression: prep.progression } : null,
      };
      if (images.length) plan.sousTitresImage = images;
      return plan;
    },
  );

  // --- Fichiers directs --------------------------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/media/:id/original', { preHandler: app.exigerConnexion }, async (req, reply) => {
    const film = filmVisible(app, req, req.params.id);
    return servirFichier(req, reply, film.cheminAbsolu, { cache: 'private, max-age=3600' });
  });

  app.get<{ Params: { id: string; fichier: string } }>('/media/:id/prepare/:fichier', { preHandler: app.exigerConnexion }, async (req, reply) => {
    filmVisible(app, req, req.params.id);
    const m = /^(-?\d+|sans)\.mp4$/.exec(req.params.fichier);
    if (!m) throw introuvable();
    const audio = m[1] === AUDIO_SANS ? -1 : Number(m[1]);
    const chemin = preparations.cheminPrepare(req.params.id, audio);
    if (!chemin) throw introuvable();
    return servirFichier(req, reply, chemin, { type: 'video/mp4' });
  });

  // --- HLS à la demande --------------------------------------------------------------------------------------------
  app.get<{ Params: { id: string; audio: string } }>('/media/:id/hls/:audio/index.m3u8', { preHandler: app.exigerConnexion }, async (req, reply) => {
    const c = cibleHls(req, req.params.id, req.params.audio);
    const texte = await conversions.liste(c);
    return reply.header('Content-Type', 'application/vnd.apple.mpegurl').header('Cache-Control', 'private, no-cache').send(texte);
  });

  app.get<{ Params: { id: string; audio: string } }>('/media/:id/hls/:audio/init.mp4', { preHandler: app.exigerConnexion }, async (req, reply) => {
    const c = cibleHls(req, req.params.id, req.params.audio);
    const chemin = await conversions.init(c);
    return servirFichier(req, reply, chemin, { type: 'video/mp4', cache: 'private, max-age=3600' });
  });

  app.get<{ Params: { id: string; audio: string; segment: string } }>('/media/:id/hls/:audio/:segment', { preHandler: app.exigerConnexion }, async (req, reply) => {
    const m = /^(\d+)\.m4s$/.exec(req.params.segment);
    if (!m) throw introuvable();
    const c = cibleHls(req, req.params.id, req.params.audio);
    const chemin = await conversions.segment(c, Number(m[1]), req.utilisateur.id, abandon(reply));
    return servirFichier(req, reply, chemin, { type: 'video/iso.segment', cache: 'private, max-age=3600' });
  });

  // --- Sous-titres -------------------------------------------------------------------------------------------------
  app.get<{ Params: { id: string; fichier: string } }>('/media/:id/sous-titres/:fichier', { preHandler: app.exigerConnexion }, async (req, reply) => {
    const film = filmVisible(app, req, req.params.id);
    const m = /^([pe])(\d+)\.vtt$/.exec(req.params.fichier);
    if (!m) throw introuvable();
    const numero = Number(m[2]);
    if (m[1] === 'p') {
      const analyse = analyseDe(film);
      const s = analyse.sousTitres.find((x) => x.index === numero && x.texte);
      if (!s) throw introuvable();
      const sortie = path.join(config.cache, film.id, 'sous-titres', `p${numero}.vtt`);
      try {
        await extraireSousTitres(film.cheminAbsolu, numero, sortie, config.transcodagePriorite);
      } catch (e) {
        throw new ErreurHttp(500, 'sous_titres_illisibles', `Ces sous-titres ne peuvent pas être lus (${(e as Error).message}).`);
      }
      return servirFichier(req, reply, sortie, { type: 'text/vtt; charset=utf-8', cache: 'private, max-age=3600' });
    }
    const ligne = app.db.prepare('SELECT fichier FROM sous_titres_externes WHERE id = ? AND film_id = ?').get(numero, film.id) as { fichier: string } | undefined;
    if (!ligne) throw introuvable();
    const chemin = path.resolve(config.films, ligne.fichier);
    if (!chemin.startsWith(path.resolve(config.films) + path.sep)) throw introuvable();
    return servirFichier(req, reply, chemin, { type: 'text/vtt; charset=utf-8', cache: 'private, max-age=60' });
  });

  // --- Préparations ------------------------------------------------------------------------------------------------
  app.get<{ Params: { id: string; audio?: string } }>('/api/films/:id/preparations', { preHandler: app.exigerConnexion }, async (req) => {
    filmModifiable(app, req, req.params.id);
    return preparations.lignes(req.params.id);
  });

  app.get<{ Params: { id: string; audio: string } }>('/api/films/:id/preparations/:audio', { preHandler: app.exigerConnexion }, async (req) => {
    filmModifiable(app, req, req.params.id);
    const l = preparations.ligne(req.params.id, numeroAudio(req.params.audio));
    if (!l) throw introuvable();
    return l;
  });

  app.post<{ Params: { id: string }; Body: { pisteAudio?: number } | null }>('/api/films/:id/preparations', { preHandler: app.exigerConnexion }, async (req, reply) => {
    const film = filmModifiable(app, req, req.params.id);
    const analyse = analyseDe(film);
    const demandee = entierOuNull(req.body?.pisteAudio, 'pisteAudio');
    const piste = choisirPiste(analyse, demandee);
    if (piste === undefined) throw requeteInvalide("Cette piste audio n'existe pas.");
    if (decider(analyse, film.fichier, piste).mode === 'direct') {
      throw new ErreurHttp(409, 'inutile', 'Ce film se lit déjà directement : il n\'y a rien à préparer.');
    }
    const avant = preparations.ligne(film.id, piste?.index ?? -1);
    const l = preparations.mettreEnFile(film.id, piste?.index ?? -1, true);
    return reply.status(avant && avant.etat !== 'erreur' ? 200 : 201).send(l);
  });

  const supprimerPrep = async (req: FastifyRequest<{ Params: { id: string; audio?: string } }>, reply: FastifyReply) => {
    filmModifiable(app, req, req.params.id);
    const cibles = req.params.audio === undefined
      ? preparations.lignes(req.params.id).map((l) => l.pisteAudio)
      : [numeroAudio(req.params.audio)];
    if (req.params.audio !== undefined && !preparations.ligne(req.params.id, cibles[0]!)) throw introuvable();
    for (const a of cibles) await preparations.retirer(req.params.id, a);
    return reply.status(204).send();
  };
  app.delete<{ Params: { id: string } }>('/api/films/:id/preparations', { preHandler: app.exigerConnexion }, supprimerPrep);
  app.delete<{ Params: { id: string; audio: string } }>('/api/films/:id/preparations/:audio', { preHandler: app.exigerConnexion }, supprimerPrep);

  // --- Administration ----------------------------------------------------------------------------------------------
  let cacheMesure = { t: 0, octets: 0 };
  app.get('/api/admin/lecture', { preHandler: app.exigerAdmin }, async (): Promise<EtatLectureAdmin> => {
    if (Date.now() - cacheMesure.t > 15_000) cacheMesure = { t: Date.now(), octets: await tailleDossier(config.cache) };
    return {
      conversionsALaVolee: conversions.lister(),
      preparations: preparations.lignes().map((l) => ({ ...l, titre: app.mediatheque.obtenir(l.filmId)?.titre ?? l.filmId })),
      charge: { cpu1min: Math.round(loadavg()[0]! * 100) / 100, coeurs: availableParallelism() },
      cache: { octets: cacheMesure.octets, max: config.cacheMax },
    };
  });

  // --- Cycle de vie ------------------------------------------------------------------------------------------------
  const minuteurs: NodeJS.Timeout[] = [];
  app.addHook('onReady', async () => {
    conversions.demarrer();
    preparations.demarrer();
    app.mediatheque.surFilmSupprime((filmId) => {
      void (async () => {
        await conversions.arreterFilm(filmId);
        await preparations.surFilmSupprime(filmId);
        rmSync(path.join(config.cache, filmId), { recursive: true, force: true });
      })().catch((e) => app.log.warn({ err: e }, 'lecture : nettoyage du film supprimé'));
    });
    if (config.preparationAuto) {
      const proposer = (filmId: string) => {
        try {
          const film = app.mediatheque.obtenir(filmId);
          if (!film || film.etat !== 'pret' || !film.analyse?.video) return;
          const piste = choisirPiste(film.analyse, null) ?? null;
          if (decider(film.analyse, film.fichier, piste).mode === 'direct') return;
          const idAudio = piste?.index ?? -1;
          if (preparations.ligne(filmId, idAudio)) return;
          preparations.mettreEnFile(filmId, idAudio, false);
        } catch (e) {
          app.log.warn({ err: e }, 'lecture : préparation automatique');
        }
      };
      app.mediatheque.surFilmPret(proposer);
      const balayage = setTimeout(() => {
        for (const l of app.db.prepare("SELECT id FROM films WHERE etat = 'pret'").all() as Array<{ id: string }>) proposer(l.id);
      }, 5000);
      balayage.unref();
      minuteurs.push(balayage);
    }
    const purge = () => void purger(config.cache, config.cacheMax, conversions.dossiersUtilises()).catch(() => undefined);
    const p1 = setTimeout(purge, 30_000);
    const p2 = setInterval(purge, 10 * 60_000);
    p1.unref();
    p2.unref();
    minuteurs.push(p1, p2);
  });
  app.addHook('onClose', async () => {
    for (const m of minuteurs) clearTimeout(m);
    await Promise.all([conversions.arreterTout(), preparations.arreterTout()]);
  });
};

function numeroAudio(brut: string): number {
  if (brut === AUDIO_SANS) return -1;
  if (!/^\d+$/.test(brut)) throw introuvable();
  return Number(brut);
}

export default modulelecture;
