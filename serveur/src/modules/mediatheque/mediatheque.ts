// Cœur du module : dépôt des films, droits, traitement (analyse, fiche, images), TMDB, sous-titres.
import { statSync } from 'node:fs';
import { copyFile, link, mkdir, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Analyse, Film, SousTitreExterne } from '@canape/partage';
import type { FilmService, RegleAcces, ServiceMediatheque } from '../../commun/services.ts';
import type { UtilisateurConnecte } from '../../commun/auth.ts';
import { idBase32, maintenantIso } from '../../commun/identifiants.ts';
import type { Config } from '../../config.ts';
import { transaction, type Base } from '../../db/index.ts';
import { analyserFichier } from './analyse.ts';
import { couleurDeImage, extraireImages } from './images.ts';
import { analyserNomFichier, extensionDe } from './noms.ts';
import { deviner, versVtt } from './sous-titres.ts';
import { Tmdb } from './tmdb.ts';

export interface Journal {
  info: (...a: unknown[]) => void;
  warn: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
}

export interface LigneFilm {
  id: string; proprietaire_id: number; titre: string; annee: number | null; resume: string | null; genres: string | null;
  tmdb_id: number | null; fichier: string; nom_origine: string; taille: number; duree: number | null; analyse: string | null;
  affiche: string | null; fond: string | null; etat: 'analyse' | 'pret' | 'erreur'; erreur: string | null;
  visibilite: 'prive' | 'partage' | 'tous'; ajoute_le: string; couleur: string | null;
}

/** Déplace un fichier (copie puis suppression si les dossiers sont sur des disques différents). */
export async function deplacer(source: string, cible: string): Promise<void> {
  try {
    await rename(source, cible);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await copyFile(source, cible);
    await unlink(source);
  }
}

/**
 * Lien physique de `source` vers `cible` (le film et le torrent partagé sont le même fichier, sans place en plus) ;
 * copie en repli (autre disque, droits insuffisants, système de fichiers sans liens), avec une explication claire.
 */
export async function lierOuCopier(source: string, cible: string, journal: Journal): Promise<'lien' | 'copie'> {
  try {
    await link(source, cible);
    return 'lien';
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? '';
    const raisons: Record<string, string> = {
      EXDEV: 'le dossier des téléchargements et celui des films sont sur deux disques différents',
      EPERM: "Canapé n'a pas les droits de lecture et d'écriture sur le fichier téléchargé (Transmission doit tourner avec l'umask 2, dans le groupe canape ; fs.protected_hardlinks=1)",
      EACCES: "Canapé n'a pas les droits de lecture et d'écriture sur le fichier téléchargé (Transmission doit tourner avec l'umask 2, dans le groupe canape ; fs.protected_hardlinks=1)",
      EMLINK: 'trop de liens sur ce fichier', ENOTSUP: 'ce système de fichiers ne sait pas faire de lien physique', EOPNOTSUPP: 'ce système de fichiers ne sait pas faire de lien physique',
    };
    if (!(code in raisons)) throw e;
    journal.warn({ code }, `lien physique impossible (${raisons[code]}) : le film est copié, il prend donc de la place en plus tant que le torrent est gardé`);
    await copyFile(source, cible);
    return 'copie';
  }
}

export class Mediatheque implements ServiceMediatheque {
  readonly db: Base;
  readonly config: Config;
  readonly journal: Journal;
  readonly tmdb: Tmdb;
  private regles: RegleAcces[] = [];
  private abonnesPret: Array<(id: string) => void> = [];
  private abonnesSupprime: Array<(id: string) => void> = [];
  private file: Promise<unknown> = Promise.resolve();
  private enCours = new Set<string>();

  constructor(db: Base, config: Config, journal: Journal) {
    this.db = db;
    this.config = config;
    this.journal = journal;
    this.tmdb = new Tmdb(config.tmdbCle);
  }

  // ----- Service offert aux autres modules -----

  ligne(id: string): LigneFilm | null {
    return (this.db.prepare('SELECT * FROM films WHERE id = ?').get(id) as unknown as LigneFilm | undefined) ?? null;
  }

  obtenir(filmId: string): FilmService | null {
    const l = this.ligne(filmId);
    if (!l) return null;
    return {
      id: l.id, proprietaireId: l.proprietaire_id, titre: l.titre, annee: l.annee, duree: l.duree, fichier: l.fichier,
      cheminAbsolu: path.join(this.config.films, l.fichier), visibilite: l.visibilite, etat: l.etat,
      analyse: l.analyse ? (JSON.parse(l.analyse) as Analyse) : null,
    };
  }

  peutVoir(utilisateur: UtilisateurConnecte, filmId: string): boolean {
    const l = this.ligne(filmId);
    if (!l) return false;
    if (utilisateur.role === 'admin' || l.proprietaire_id === utilisateur.id || l.visibilite === 'tous') return true;
    if (l.visibilite === 'partage') {
      const p = this.db.prepare('SELECT 1 FROM films_partages WHERE film_id = ? AND utilisateur_id = ?').get(filmId, utilisateur.id);
      if (p) return true;
    }
    return this.regles.some((r) => {
      try { return r(utilisateur, filmId); } catch { return false; }
    });
  }

  peutModifier(utilisateur: UtilisateurConnecte, filmId: string): boolean {
    const l = this.ligne(filmId);
    return !!l && (utilisateur.role === 'admin' || l.proprietaire_id === utilisateur.id);
  }

  ajouterRegleAcces(regle: RegleAcces): void { this.regles.push(regle); }
  surFilmPret(cb: (filmId: string) => void): void { this.abonnesPret.push(cb); }
  surFilmSupprime(cb: (filmId: string) => void): void { this.abonnesSupprime.push(cb); }

  private notifier(abonnes: Array<(id: string) => void>, id: string): void {
    for (const cb of abonnes) {
      try { cb(id); } catch (e) { this.journal.error({ err: e }, 'abonné de la médiathèque en erreur'); }
    }
  }

  // ----- Création -----

  /** Crée la fiche d'un fichier déjà reçu (déplacé ou copié dans `<films>/<id>/`) puis lance l'analyse. */
  async creerFilm(o: {
    proprietaireId: number; nomOrigine: string; source: string; copier?: boolean; taille?: number; analyser?: boolean;
    /** Lien physique (repli : copie) : le fichier source reste en place (torrent encore partagé). */
    lier?: boolean;
  }): Promise<string> {
    const id = idBase32(12);
    const ext = extensionDe(o.nomOrigine);
    const dossier = path.join(this.config.films, id);
    await mkdir(path.join(dossier, 'sous-titres'), { recursive: true });
    const cible = path.join(dossier, `original${ext}`);
    try {
      if (o.lier) await lierOuCopier(o.source, cible, this.journal);
      else if (o.copier) await copyFile(o.source, cible);
      else await deplacer(o.source, cible);
    } catch (e) {
      await rm(dossier, { recursive: true, force: true });
      throw e;
    }
    const taille = o.taille ?? (await stat(cible)).size;
    const { titre, annee } = analyserNomFichier(o.nomOrigine);
    this.db.prepare(
      `INSERT INTO films (id, proprietaire_id, titre, annee, fichier, nom_origine, taille, etat, ajoute_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'analyse', ?)`,
    ).run(id, o.proprietaireId, titre, annee, `${id}/original${ext}`, o.nomOrigine, taille, maintenantIso());
    if (o.analyser !== false) this.planifier(id);
    return id;
  }

  // ----- Traitement en tâche de fond (un film à la fois, pour ménager le serveur) -----

  planifier(id: string): Promise<void> {
    const p = this.file.then(() => this.traiter(id)).catch((e) => this.journal.error({ err: e, id }, 'traitement du film en erreur'));
    this.file = p;
    return p as Promise<void>;
  }

  /** Films restés à l'état « analyse » (arrêt du serveur en plein traitement). */
  reprendreAnalyses(): void {
    const l = this.db.prepare("SELECT id FROM films WHERE etat = 'analyse'").all() as Array<{ id: string }>;
    for (const { id } of l) this.planifier(id);
  }

  /** Posé par le module de téléversement : supprime les envois abandonnés. */
  nettoyerTeleversements: () => Promise<number> = async () => 0;

  async attendreTraitements(): Promise<void> { await this.file; }

  private async traiter(id: string): Promise<void> {
    if (this.enCours.has(id)) return;
    this.enCours.add(id);
    try {
      let l = this.ligne(id);
      if (!l) return;
      const nice = this.config.transcodagePriorite;
      const chemin = path.join(this.config.films, l.fichier);
      let analyse: Analyse;
      try {
        analyse = await analyserFichier(chemin, { nice });
      } catch (e) {
        if (this.ligne(id)) {
          this.db.prepare("UPDATE films SET etat = 'erreur', erreur = ? WHERE id = ?").run((e as Error).message, id);
        }
        return;
      }
      if (!this.ligne(id)) return;
      this.db.prepare('UPDATE films SET analyse = ?, duree = ?, erreur = NULL WHERE id = ?').run(JSON.stringify(analyse), analyse.duree, id);

      const dossier = path.join(this.config.films, id);
      try {
        const images = await extraireImages(chemin, dossier, analyse, nice);
        if (images && this.ligne(id)) {
          const couleur = await couleurDeImage(images.affiche, nice);
          this.db.prepare('UPDATE films SET affiche = ?, fond = ?, couleur = ? WHERE id = ?').run(`${id}/affiche.jpg`, `${id}/fond.jpg`, couleur, id);
        }
      } catch (e) {
        this.journal.warn({ err: e, id }, "extraction des images impossible");
      }

      l = this.ligne(id);
      if (l && this.tmdb.actif) {
        try {
          await this.ficheParTmdb(l);
        } catch (e) {
          this.journal.warn({ err: e, id }, 'recherche TMDB impossible');
        }
      }
      if (!this.ligne(id)) return;
      this.db.prepare("UPDATE films SET etat = 'pret' WHERE id = ?").run(id);
      this.notifier(this.abonnesPret, id);
    } finally {
      this.enCours.delete(id);
    }
  }

  /** Recherche automatique : titre + année ; accepte le premier candidat si l'année concorde (à 1 près) ou unique. */
  private async ficheParTmdb(l: LigneFilm): Promise<void> {
    const candidats = await this.tmdb.rechercher(l.titre, l.annee);
    const bon = candidats.find((c) => l.annee === null || c.annee === null || Math.abs(c.annee - l.annee) <= 1) ?? null;
    if (!bon || (l.annee === null && candidats.length > 1 && candidats[0]?.titre.toLowerCase() !== l.titre.toLowerCase())) return;
    await this.appliquerTmdb(l.id, bon.tmdbId);
  }

  async appliquerTmdb(id: string, tmdbId: number): Promise<void> {
    const d = await this.tmdb.details(tmdbId);
    const dossier = path.join(this.config.films, id);
    let affiche: string | null = null;
    let fond: string | null = null;
    if (d.affiche) {
      try { await writeFile(path.join(dossier, 'affiche.jpg'), await this.tmdb.image(d.affiche, 'w500')); affiche = `${id}/affiche.jpg`; } catch (e) { this.journal.warn({ err: e }, 'affiche TMDB'); }
    }
    if (d.fond) {
      try { await writeFile(path.join(dossier, 'fond.jpg'), await this.tmdb.image(d.fond, 'w1280')); fond = `${id}/fond.jpg`; } catch (e) { this.journal.warn({ err: e }, 'fond TMDB'); }
    }
    if (!this.ligne(id)) return;
    const couleur = affiche ? await couleurDeImage(path.join(dossier, 'affiche.jpg'), this.config.transcodagePriorite) : null;
    this.db.prepare(
      `UPDATE films SET titre = COALESCE(NULLIF(?, ''), titre), annee = COALESCE(?, annee), resume = COALESCE(?, resume),
              genres = ?, tmdb_id = ?, affiche = COALESCE(?, affiche), fond = COALESCE(?, fond),
              couleur = CASE WHEN ? IS NOT NULL THEN ? ELSE couleur END WHERE id = ?`,
    ).run(d.titre, d.annee, d.resume, JSON.stringify(d.genres), d.tmdbId, affiche, fond, couleur, couleur, id);
  }

  // ----- Suppression -----

  async supprimer(id: string): Promise<void> {
    if (!this.ligne(id)) return;
    await rm(path.join(this.config.films, id), { recursive: true, force: true });
    this.db.prepare('DELETE FROM films WHERE id = ?').run(id);
    this.notifier(this.abonnesSupprime, id);
  }

  // ----- Partages -----

  partages(id: string): number[] {
    return (this.db.prepare('SELECT utilisateur_id FROM films_partages WHERE film_id = ? ORDER BY utilisateur_id').all(id) as Array<{ utilisateur_id: number }>)
      .map((r) => r.utilisateur_id);
  }

  definirPartages(id: string, ids: number[]): void {
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM films_partages WHERE film_id = ?').run(id);
      const ins = this.db.prepare('INSERT OR IGNORE INTO films_partages (film_id, utilisateur_id) VALUES (?, ?)');
      for (const u of ids) ins.run(id, u);
    });
  }

  // ----- Sous-titres externes -----

  sousTitres(id: string): SousTitreExterne[] {
    return (this.db.prepare('SELECT id, langue, libelle FROM sous_titres_externes WHERE film_id = ? ORDER BY id').all(id) as unknown as SousTitreExterne[]);
  }

  async ajouterSousTitre(id: string, octets: Uint8Array, nomFichier: string, langue?: string | null, libelle?: string | null): Promise<SousTitreExterne> {
    const ext = extensionDe(nomFichier);
    const vtt = versVtt(octets, ext);
    const devine = deviner(nomFichier);
    const l = langue === undefined ? devine.langue : langue;
    const lib = (libelle && libelle.trim()) || devine.libelle;
    const r = this.db.prepare("INSERT INTO sous_titres_externes (film_id, langue, libelle, fichier) VALUES (?, ?, ?, '')").run(id, l, lib);
    const sid = Number(r.lastInsertRowid);
    const rel = `${id}/sous-titres/e${sid}.vtt`;
    try {
      await mkdir(path.join(this.config.films, id, 'sous-titres'), { recursive: true });
      await writeFile(path.join(this.config.films, rel), vtt, 'utf8');
    } catch (e) {
      this.db.prepare('DELETE FROM sous_titres_externes WHERE id = ?').run(sid);
      throw e;
    }
    this.db.prepare('UPDATE sous_titres_externes SET fichier = ? WHERE id = ?').run(rel, sid);
    return { id: sid, langue: l, libelle: lib };
  }

  async retirerSousTitre(id: string, sid: number): Promise<boolean> {
    const l = this.db.prepare('SELECT fichier FROM sous_titres_externes WHERE id = ? AND film_id = ?').get(sid, id) as { fichier: string } | undefined;
    if (!l) return false;
    this.db.prepare('DELETE FROM sous_titres_externes WHERE id = ?').run(sid);
    if (l.fichier) await rm(path.join(this.config.films, l.fichier), { force: true });
    return true;
  }

  // ----- Représentation API -----

  versFilm(l: LigneFilm, u: UtilisateurConnecte, detail = false): Film {
    const modifiable = u.role === 'admin' || l.proprietaire_id === u.id;
    const proprio = this.db.prepare('SELECT prenom FROM utilisateurs WHERE id = ?').get(l.proprietaire_id) as { prenom: string } | undefined;
    let genres: string[] = [];
    try { genres = l.genres ? (JSON.parse(l.genres) as string[]) : []; } catch { /* genres illisibles */ }
    const film: Film = {
      id: l.id, proprietaireId: l.proprietaire_id, proprietairePrenom: proprio?.prenom ?? '', titre: l.titre, annee: l.annee,
      resume: l.resume, genres, tmdbId: l.tmdb_id, nomOrigine: l.nom_origine, taille: l.taille, duree: l.duree, etat: l.etat,
      erreur: l.erreur, visibilite: l.visibilite, partages: modifiable ? this.partages(l.id) : [],
      aAffiche: !!l.affiche, aFond: !!l.fond, couleur: l.couleur, versionImages: this.versionImages(l),
      modifiable, ajouteLe: l.ajoute_le,
    };
    if (detail) {
      film.analyse = l.analyse ? (JSON.parse(l.analyse) as Analyse) : null;
      film.sousTitresExternes = this.sousTitres(l.id);
    }
    return film;
  }

  private versionImages(l: LigneFilm): number {
    // Date de dernière écriture des images : change quand elles sont réécrites (TMDB, nouvelle extraction).
    let v = 0;
    for (const rel of [l.affiche, l.fond]) {
      if (!rel) continue;
      try { v = Math.max(v, Math.floor(statSync(path.join(this.config.films, rel)).mtimeMs / 1000)); } catch { /* image absente */ }
    }
    return v;
  }

  /** Fichiers du dossier d'un film (diagnostic et tests). */
  async fichiersDuFilm(id: string): Promise<string[]> {
    return readdir(path.join(this.config.films, id)).catch(() => []);
  }
}
