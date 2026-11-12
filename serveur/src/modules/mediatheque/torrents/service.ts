// Règles des téléchargements par torrent : base, droits, quota, file d'attente, choix des fichiers, import final.
// Le moteur (processus enfant) ne fait que télécharger ; tout ce qui décide est ici.
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { TAILLE_MAX_SOUS_TITRES, type CorpsModifTorrent, type EtatTorrent, type FichierTorrent, type Telechargement } from '@canape/partage';
import type { UtilisateurConnecte } from '../../../commun/auth.ts';
import { ErreurHttp, interdit, introuvable, requeteInvalide } from '../../../commun/erreurs.ts';
import { idBase32, maintenantIso } from '../../../commun/identifiants.ts';
import type { Mediatheque } from '../mediatheque.ts';
import { octetsUtilises } from '../televersement.ts';
import { appliquerChoix, associerSousTitres, choixParDefaut, decrire, FICHIERS_MAX } from './fichiers.ts';
import { Moteur } from './moteur.ts';
import type { DeEnfant, EtatTorrentEnfant } from './protocole.ts';

export interface LigneTelechargement {
  id: string; proprietaire_id: number; info_hash: string; source: string; nom: string | null; etat: EtatTorrent;
  fichiers: string | null; octets_total: number | null; octets_recus: number; films: string; erreur: string | null;
  cree_le: string; termine_le: string | null;
}

/** Ce qui est ajouté : un lien déjà validé, ou un `.torrent` déjà lu. */
export type SourceAjout =
  | { magnet: string; infoHash: string; nom: string | null }
  | { fichier: Uint8Array; infoHash: string; nom: string | null };

const ACTIFS: EtatTorrent[] = ['metadonnees', 'telechargement'];
const EN_COURS: EtatTorrent[] = ['metadonnees', 'telechargement', 'pause', 'import'];
/** Sans informations du torrent au bout de ce temps (aucun pair ?), le téléchargement s'arrête en erreur. */
const DELAI_METADONNEES_MS = 15 * 60_000;
/** Un partage après la fin ne dure jamais plus de ça, même sans preneur. */
const DUREE_PARTAGE_MAX_MS = 24 * 3600_000;
const DOSSIER_TORRENTS = '.torrents';

const jsonOu = <T>(texte: string | null, defaut: T): T => {
  if (!texte) return defaut;
  try { return JSON.parse(texte) as T; } catch { return defaut; }
};

export class Torrents {
  readonly moteur: Moteur;
  /** Torrents confiés au moteur (au plus `torrentSimultanes` en téléchargement). */
  private readonly envoyes = new Set<string>();
  private readonly debutMeta = new Map<string, number>();
  private readonly vivant = new Map<string, EtatTorrentEnfant>();
  /** Torrents partagés après leur fin (`CANAPE_TORRENT_PARTAGE` > 0) : leurs données restent jusqu'au ratio. */
  private readonly partages = new Set<string>();
  private readonly imports = new Set<string>();
  private readonly travaux = new Set<Promise<unknown>>();
  private minuteur: NodeJS.Timeout | null = null;
  private fermeture = false;

  private readonly app: FastifyInstance;
  private readonly med: Mediatheque;

  constructor(app: FastifyInstance, med: Mediatheque) {
    this.app = app;
    this.med = med;
    this.moteur = new Moteur(app.config, app.log);
    this.moteur.on('message', (m) => this.suivre(Promise.resolve().then(() => this.surMessage(m))));
    this.moteur.on('demarre', () => this.surDemarrage());
    this.moteur.on('mort', () => this.surMort());
  }

  private get config() { return this.app.config; }
  private get db() { return this.app.db; }
  get actif(): boolean { return this.config.torrents; }

  private dossier(id: string): string { return path.join(this.config.telechargements, id); }
  private fichierTorrent(id: string): string { return path.join(this.config.telechargements, DOSSIER_TORRENTS, `${id}.torrent`); }

  /** Garde une tâche de fond pour l'attendre à la fermeture et ne jamais laisser une promesse sans `catch`. */
  private suivre(p: Promise<unknown> | void): void {
    if (!p) return;
    const t: Promise<unknown> = p.catch((err) => this.app.log.error({ err }, 'torrents : erreur interne')).finally(() => this.travaux.delete(t));
    this.travaux.add(t);
  }

  // ----- Cycle de vie -----

  async demarrer(): Promise<void> {
    await mkdir(path.join(this.config.telechargements, DOSSIER_TORRENTS), { recursive: true });
    await this.nettoyer();
    if (!this.actif) return;
    // Un import interrompu est refait ; les téléchargements reprennent (les morceaux reçus sont revérifiés).
    for (const l of this.lignesParEtat('import')) this.suivre(this.importer(l.id));
    this.planifier();
    this.minuteur = setInterval(() => this.verifierDelais(), 30_000);
    this.minuteur.unref();
  }

  async arreter(): Promise<void> {
    this.fermeture = true;
    if (this.minuteur) clearInterval(this.minuteur);
    await Promise.allSettled([...this.travaux]);
    await this.moteur.arreter();
  }

  /** Efface les dossiers et `.torrent` dont plus personne n'a besoin (arrêt brutal, partage interrompu…). */
  private async nettoyer(): Promise<void> {
    const racine = this.config.telechargements;
    const lignes = new Map((this.db.prepare('SELECT id, etat FROM telechargements').all() as Array<{ id: string; etat: EtatTorrent }>).map((l) => [l.id, l.etat]));
    for (const nom of await readdir(racine).catch(() => [] as string[])) {
      if (nom === DOSSIER_TORRENTS) continue;
      const etat = lignes.get(nom);
      if (!etat || etat === 'termine' || etat === 'annule') await rm(path.join(racine, nom), { recursive: true, force: true });
    }
    const gardes = path.join(racine, DOSSIER_TORRENTS);
    for (const nom of await readdir(gardes).catch(() => [] as string[])) {
      const etat = lignes.get(nom.replace(/\.torrent$/, ''));
      if (!etat || !EN_COURS.includes(etat)) await rm(path.join(gardes, nom), { force: true });
    }
  }

  // ----- Lecture -----

  ligne(id: string): LigneTelechargement | null {
    return (this.db.prepare('SELECT * FROM telechargements WHERE id = ?').get(id) as unknown as LigneTelechargement | undefined) ?? null;
  }

  private lignesParEtat(...etats: EtatTorrent[]): LigneTelechargement[] {
    return this.db.prepare(`SELECT * FROM telechargements WHERE etat IN (${etats.map(() => '?').join(',')}) ORDER BY cree_le, rowid`)
      .all(...etats) as unknown as LigneTelechargement[];
  }

  peutAjouter(u: UtilisateurConnecte): boolean {
    return this.actif && (u.role === 'admin' || u.peutTeleverser);
  }

  /** Ligne visible par l'utilisateur (la sienne ; l'admin les voit toutes), sinon 404. */
  visible(u: UtilisateurConnecte, id: string): LigneTelechargement {
    const l = this.ligne(id);
    if (!l || (u.role !== 'admin' && l.proprietaire_id !== u.id)) throw introuvable('Téléchargement introuvable.');
    return l;
  }

  lister(u: UtilisateurConnecte): Telechargement[] {
    const lignes = (u.role === 'admin'
      ? this.db.prepare('SELECT * FROM telechargements ORDER BY cree_le DESC, rowid DESC').all()
      : this.db.prepare('SELECT * FROM telechargements WHERE proprietaire_id = ? ORDER BY cree_le DESC, rowid DESC').all(u.id)) as unknown as LigneTelechargement[];
    return lignes.map((l) => this.vue(l));
  }

  /** Base + dernier état connu du moteur. */
  vue(l: LigneTelechargement): Telechargement {
    const fichiers = jsonOu<FichierTorrent[]>(l.fichiers, []);
    const v = ACTIFS.includes(l.etat) ? this.vivant.get(l.id) : undefined;
    const proprio = this.db.prepare('SELECT prenom FROM utilisateurs WHERE id = ?').get(l.proprietaire_id) as { prenom: string } | undefined;
    const termine = l.etat === 'termine' || l.etat === 'import';
    const octetsTotal = l.octets_total;
    const octetsRecus = termine && octetsTotal !== null ? octetsTotal : (v?.octetsRecus ?? l.octets_recus);
    const debit = v?.debit ?? 0;
    const progression = octetsTotal ? Math.min(1, octetsRecus / octetsTotal) : termine ? 1 : 0;
    return {
      id: l.id, proprietaireId: l.proprietaire_id, proprietairePrenom: proprio?.prenom ?? '', nom: l.nom, infoHash: l.info_hash,
      etat: l.etat, progression, octetsRecus, octetsTotal, debit, debitEnvoi: v?.debitEnvoi ?? 0, pairs: v?.pairs ?? 0,
      resteSecondes: l.etat === 'telechargement' && octetsTotal !== null && debit > 0 ? Math.ceil(Math.max(0, octetsTotal - octetsRecus) / debit) : null,
      fichiers, filmIds: jsonOu<string[]>(l.films, []), erreur: l.etat === 'erreur' ? l.erreur : null,
      creeLe: l.cree_le, termineLe: l.termine_le,
    };
  }

  // ----- Ajout -----

  async ajouter(u: UtilisateurConnecte, source: SourceAjout): Promise<Telechargement> {
    if (!this.actif) throw interdit('Les torrents sont désactivés sur ce serveur.');
    if (!this.peutAjouter(u)) throw interdit("Tu n'as pas le droit d'ajouter des films.");
    const doublon = this.db.prepare(`SELECT 1 FROM telechargements WHERE info_hash = ? AND etat IN (${EN_COURS.map(() => '?').join(',')})`)
      .get(source.infoHash, ...EN_COURS);
    if (doublon) throw new ErreurHttp(409, 'conflit', 'Ce torrent est déjà en cours de téléchargement.');
    const id = idBase32(12);
    let ref: string;
    if ('magnet' in source) ref = source.magnet;
    else {
      ref = path.posix.join(DOSSIER_TORRENTS, `${id}.torrent`);
      await mkdir(path.dirname(this.fichierTorrent(id)), { recursive: true });
      await writeFile(this.fichierTorrent(id), source.fichier);
    }
    this.db.prepare(
      `INSERT INTO telechargements (id, proprietaire_id, info_hash, source, nom, etat, cree_le) VALUES (?, ?, ?, ?, ?, 'metadonnees', ?)`,
    ).run(id, u.id, source.infoHash, ref, source.nom, maintenantIso());
    this.planifier();
    return this.vue(this.ligne(id)!);
  }

  // ----- File d'attente : au plus `torrentSimultanes` actifs -----

  /** Confie au moteur les téléchargements qui ont leur tour, dans l'ordre d'ajout. */
  planifier(): void {
    if (!this.actif || this.fermeture) return;
    for (const l of this.lignesParEtat(...ACTIFS)) {
      if (this.envoyes.size >= this.config.torrentSimultanes) break;
      if (this.envoyes.has(l.id)) continue;
      this.envoyes.add(l.id);
      this.confier(l);
    }
  }

  private confier(l: LigneTelechargement): void {
    if (l.etat === 'metadonnees' && !l.fichiers) this.debutMeta.set(l.id, Date.now());
    this.moteur.demarrer();
    const fichiers = jsonOu<FichierTorrent[]>(l.fichiers, []);
    const choix = fichiers.filter((f) => f.choisi).map((f) => f.index);
    const magnet = l.source.startsWith('magnet:');
    // Si le moteur n'est pas encore prêt, `surDemarrage` renverra tout.
    this.moteur.envoyer({
      t: 'ajouter', id: l.id, dossier: this.dossier(l.id),
      ...(magnet ? { magnet: l.source } : { fichier: path.join(this.config.telechargements, l.source) }),
      ...(choix.length ? { choix } : {}),
    });
  }

  private surDemarrage(): void {
    for (const id of this.envoyes) {
      const l = this.ligne(id);
      if (l && ACTIFS.includes(l.etat)) this.confier(l);
    }
  }

  /** Le moteur est mort : les états connus ne valent plus, les partages en cours s'arrêtent. */
  private surMort(): void {
    this.vivant.clear();
    for (const id of [...this.partages]) this.suivre(this.finPartage(id));
  }

  private verifierDelais(): void {
    const maintenant = Date.now();
    for (const [id, debut] of this.debutMeta) {
      const l = this.ligne(id);
      if (!l || l.fichiers || l.etat !== 'metadonnees') { this.debutMeta.delete(id); continue; }
      if (maintenant - debut > DELAI_METADONNEES_MS) {
        this.suivre(this.echec(id, "Aucun pair n'a répondu : impossible de récupérer les informations du torrent."));
      }
    }
  }

  // ----- Messages du moteur -----

  private surMessage(m: DeEnfant): Promise<void> | void {
    switch (m.t) {
      case 'metadonnees': return this.surMetadonnees(m);
      case 'etat': this.surEtat(m.torrents); return;
      case 'termine': return this.surTermine(m.id);
      case 'erreur': return this.echec(m.id, this.messageMoteur(m.message), { moteurDejaRetire: true });
      case 'partage_fini': return this.finPartage(m.id);
      default: return;
    }
  }

  private messageMoteur(brut: string): string {
    return `Le torrent n'a pas pu être téléchargé : ${brut}`;
  }

  private surEtat(liste: EtatTorrentEnfant[]): void {
    const maj = this.db.prepare('UPDATE telechargements SET octets_recus = ? WHERE id = ? AND octets_recus <> ?');
    for (const e of liste) {
      const l = this.ligne(e.id);
      if (!l || !ACTIFS.includes(l.etat)) continue;
      this.vivant.set(e.id, e);
      if (e.octetsTotal > 0) maj.run(e.octetsRecus, e.id, e.octetsRecus);
    }
  }

  private async surMetadonnees(m: Extract<DeEnfant, { t: 'metadonnees' }>): Promise<void> {
    const l = this.ligne(m.id);
    if (!l || !ACTIFS.includes(l.etat)) return;
    this.debutMeta.delete(m.id);
    if (m.fichiers.length > FICHIERS_MAX) {
      return this.echec(m.id, `Ce torrent contient trop de fichiers (plus de ${FICHIERS_MAX}).`);
    }
    // Reprise : le choix déjà fait est gardé ; sinon, le choix par défaut.
    let fichiers = jsonOu<FichierTorrent[] | null>(l.fichiers, null);
    if (!fichiers || fichiers.length !== m.fichiers.length) {
      fichiers = decrire(m.fichiers);
      const choix = choixParDefaut(fichiers);
      if (!choix.length) return this.echec(m.id, 'Ce torrent ne contient pas de vidéo.');
      fichiers = appliquerChoix(fichiers, choix);
    }
    const total = this.tailleChoisie(fichiers);
    if (this.quotaDepasse(l.proprietaire_id, l.id, total)) {
      return this.echec(m.id, 'Ton espace est plein : ce téléchargement dépasse ton quota.');
    }
    this.db.prepare("UPDATE telechargements SET nom = ?, fichiers = ?, octets_total = ?, etat = 'telechargement' WHERE id = ?")
      .run(m.nom || l.nom, JSON.stringify(fichiers), total, m.id);
    this.moteur.envoyer({ t: 'choisir', id: m.id, fichiers: fichiers.filter((f) => f.choisi).map((f) => f.index) });
  }

  private tailleChoisie(fichiers: FichierTorrent[]): number {
    return fichiers.filter((f) => f.choisi).reduce((n, f) => n + f.taille, 0);
  }

  /** Le propriétaire dépasserait-il son quota avec `total` octets de plus (cet envoi exclu) ? */
  private quotaDepasse(proprietaireId: number, id: string, total: number): boolean {
    const p = this.db.prepare('SELECT role, quota_octets FROM utilisateurs WHERE id = ?').get(proprietaireId) as { role: string; quota_octets: number | null } | undefined;
    if (!p || p.role === 'admin' || p.quota_octets === null) return false;
    return octetsUtilises(this.app, proprietaireId, id) + total > p.quota_octets;
  }

  /** Erreur : le torrent quitte le moteur, ses données partielles sont effacées. */
  private async echec(id: string, message: string, o: { moteurDejaRetire?: boolean; garderDonnees?: boolean } = {}): Promise<void> {
    const l = this.ligne(id);
    if (!l || !EN_COURS.includes(l.etat)) return;
    this.db.prepare("UPDATE telechargements SET etat = 'erreur', erreur = ?, termine_le = ? WHERE id = ?").run(message, maintenantIso(), id);
    this.liberer(id);
    if (!o.moteurDejaRetire) await this.moteur.retirer(id, !o.garderDonnees);
    else if (!o.garderDonnees) await rm(this.dossier(id), { recursive: true, force: true });
    await rm(this.fichierTorrent(id), { force: true });
    this.planifier();
  }

  private liberer(id: string): void {
    this.envoyes.delete(id);
    this.vivant.delete(id);
    this.debutMeta.delete(id);
  }

  private async surTermine(id: string): Promise<void> {
    const l = this.ligne(id);
    if (!l || l.etat !== 'telechargement') return;
    this.db.prepare("UPDATE telechargements SET etat = 'import', octets_recus = COALESCE(octets_total, octets_recus) WHERE id = ?").run(id);
    this.liberer(id);
    this.planifier();
    await this.importer(id, true);
  }

  // ----- Fin : les films arrivent dans la galerie -----

  /** `enLigne` : le torrent est encore dans le moteur (téléchargement qui vient de finir). */
  private async importer(id: string, enLigne = false): Promise<void> {
    if (this.imports.has(id)) return;
    this.imports.add(id);
    try {
      const partage = this.config.torrentPartage > 0 && enLigne;
      if (partage) {
        this.partages.add(id);
        this.moteur.envoyer({ t: 'partager', id, ratio: this.config.torrentPartage, delaiMs: DUREE_PARTAGE_MAX_MS });
      } else if (enLigne) {
        await this.moteur.retirer(id, false);
      }
      await this.importerFichiers(id, partage);
    } catch (e) {
      this.partages.delete(id);
      this.app.log.error({ err: e, id }, "import d'un torrent en erreur");
      await this.echec(id, `Les films n'ont pas pu être ajoutés à ta galerie : ${(e as Error).message}`, { garderDonnees: true });
    } finally {
      this.imports.delete(id);
    }
  }

  private async importerFichiers(id: string, copier: boolean): Promise<void> {
    const l = this.ligne(id);
    if (!l || l.etat !== 'import') return;
    const fichiers = jsonOu<FichierTorrent[]>(l.fichiers, []);
    const dossier = this.dossier(id);
    const dedans = (chemin: string): string => {
      const absolu = path.resolve(dossier, chemin);
      if (absolu !== dossier && !absolu.startsWith(dossier + path.sep)) throw new Error(`chemin suspect dans le torrent (${chemin})`);
      return absolu;
    };
    const videos = fichiers.filter((f) => f.choisi && f.video);
    const sousTitres = associerSousTitres(videos, fichiers.filter((f) => f.choisi && f.sousTitres));
    const filmIds = jsonOu<string[]>(l.films, []);
    for (const v of videos) {
      const source = dedans(v.chemin);
      const existe = await stat(source).then((s) => s.isFile(), () => false);
      // Un import interrompu : la vidéo déjà déplacée dans la galerie n'est pas refaite.
      if (!existe) {
        if (filmIds.length) continue;
        throw new Error(`le fichier ${path.posix.basename(v.chemin)} est introuvable`);
      }
      const filmId = await this.med.creerFilm({
        proprietaireId: l.proprietaire_id, nomOrigine: path.posix.basename(v.chemin), source, copier, taille: v.taille,
      });
      filmIds.push(filmId);
      this.db.prepare('UPDATE telechargements SET films = ? WHERE id = ?').run(JSON.stringify(filmIds), id);
      for (const s of sousTitres.get(v.index) ?? []) {
        try {
          const octets = await readFile(dedans(s.chemin));
          if (octets.length > TAILLE_MAX_SOUS_TITRES) continue;
          await this.med.ajouterSousTitre(filmId, octets, path.posix.basename(s.chemin));
        } catch (err) {
          this.app.log.warn({ err, id }, 'sous-titres du torrent ignorés');
        }
      }
    }
    if (!filmIds.length) throw new Error('aucune vidéo à ajouter');
    this.db.prepare("UPDATE telechargements SET etat = 'termine', films = ?, termine_le = ?, erreur = NULL WHERE id = ?")
      .run(JSON.stringify(filmIds), maintenantIso(), id);
    await rm(this.fichierTorrent(id), { force: true });
    if (!copier) await rm(dossier, { recursive: true, force: true });
  }

  /** Ratio de partage atteint (ou durée maximale) : le torrent s'arrête, ses données sont effacées. */
  private async finPartage(id: string): Promise<void> {
    if (!this.partages.delete(id)) return;
    await this.moteur.retirer(id, true);
    await rm(this.dossier(id), { recursive: true, force: true });
  }

  // ----- Modification et annulation par le propriétaire -----

  async modifier(u: UtilisateurConnecte, id: string, corps: CorpsModifTorrent): Promise<Telechargement> {
    const l = this.visible(u, id);
    if (!this.actif) throw interdit('Les torrents sont désactivés sur ce serveur.');
    if (corps.fichiers === undefined && corps.pause === undefined) throw requeteInvalide('Rien à modifier (fichiers ou pause).');
    if (!['metadonnees', 'telechargement', 'pause'].includes(l.etat)) {
      throw new ErreurHttp(409, 'conflit', l.etat === 'erreur' ? "Ce téléchargement est en erreur : retire-le et ajoute-le de nouveau." : 'Ce téléchargement est terminé ou annulé.');
    }
    if (corps.pause !== undefined && typeof corps.pause !== 'boolean') throw requeteInvalide('« pause » doit valoir vrai ou faux.');

    let fichiers = jsonOu<FichierTorrent[] | null>(l.fichiers, null);
    let choix: number[] | null = null;
    if (corps.fichiers !== undefined) {
      if (!fichiers) throw new ErreurHttp(409, 'conflit', "Les informations du torrent ne sont pas encore reçues : attends un instant.");
      const liste = corps.fichiers;
      if (!Array.isArray(liste) || liste.some((n) => !Number.isInteger(n) || n < 0 || n >= fichiers!.length)) {
        throw requeteInvalide('La liste des fichiers choisis est invalide.');
      }
      choix = [...new Set(liste)];
      if (!choix.some((i) => fichiers![i]?.video)) throw requeteInvalide('Choisis au moins une vidéo.');
      fichiers = appliquerChoix(fichiers, choix);
      const total = this.tailleChoisie(fichiers);
      if (this.quotaDepasse(l.proprietaire_id, l.id, total)) {
        throw new ErreurHttp(507, 'quota_depasse', 'Ton espace est plein : ce choix dépasse ton quota.');
      }
      this.db.prepare('UPDATE telechargements SET fichiers = ?, octets_total = ? WHERE id = ?').run(JSON.stringify(fichiers), total, id);
      if (this.envoyes.has(id)) this.moteur.envoyer({ t: 'choisir', id, fichiers: choix });
    }

    if (corps.pause === true && l.etat !== 'pause') {
      this.db.prepare("UPDATE telechargements SET etat = 'pause' WHERE id = ?").run(id);
      this.liberer(id);
      await this.moteur.retirer(id, false);
      this.planifier();
    } else if (corps.pause === false && l.etat === 'pause') {
      this.db.prepare('UPDATE telechargements SET etat = ? WHERE id = ?').run(fichiers ? 'telechargement' : 'metadonnees', id);
      this.planifier();
    }
    return this.vue(this.ligne(id)!);
  }

  /** Arrête et efface un téléchargement en cours ; retire de la liste une ligne finie, en erreur ou annulée. */
  async retirer(u: UtilisateurConnecte, id: string): Promise<void> {
    const l = this.visible(u, id);
    if (l.etat === 'import') throw new ErreurHttp(409, 'conflit', "Les films sont en train d'être ajoutés à ta galerie : réessaie dans un instant.");
    if (['metadonnees', 'telechargement', 'pause'].includes(l.etat)) {
      this.db.prepare("UPDATE telechargements SET etat = 'annule', termine_le = ?, erreur = NULL WHERE id = ?").run(maintenantIso(), id);
      this.liberer(id);
      await this.moteur.retirer(id, true);
      await rm(this.dossier(id), { recursive: true, force: true });
      await rm(this.fichierTorrent(id), { force: true });
      this.planifier();
      return;
    }
    // Ligne finie : retirée de la liste (les données gardées d'une erreur d'import partent avec elle).
    this.db.prepare('DELETE FROM telechargements WHERE id = ?').run(id);
    await rm(this.dossier(id), { recursive: true, force: true });
    await rm(this.fichierTorrent(id), { force: true });
  }
}
