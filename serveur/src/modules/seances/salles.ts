// Salles en mémoire (une par séance active) et traitement des messages WebSocket.
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import {
  EMOJIS, LIMITES_WS, type CodeErreurWs, type Emoji, type MessageClient, type MessageServeur, type RaisonEtat, type UtilisateurPublic,
} from '@canape/partage';
import type { UtilisateurConnecte } from '../../commun/auth.ts';
import { maintenantIso } from '../../commun/identifiants.ts';
import { messagesDe } from './depot.ts';
import { Salle, positionValide } from './salle.ts';

/** Seau à jetons : `capacite` d'un coup, `parSeconde` ensuite. */
export class Seau {
  private jetons: number;
  private dernier: number;
  private capacite: number;
  private parSeconde: number;
  private maintenant: () => number;
  constructor(capacite: number, parSeconde: number, maintenant: () => number = Date.now) {
    this.capacite = capacite;
    this.parSeconde = parSeconde;
    this.maintenant = maintenant;
    this.jetons = capacite;
    this.dernier = maintenant();
  }
  prendre(): boolean {
    const t = this.maintenant();
    this.jetons = Math.min(this.capacite, this.jetons + ((t - this.dernier) / 1000) * this.parSeconde);
    this.dernier = t;
    if (this.jetons < 1) return false;
    this.jetons -= 1;
    return true;
  }
}

export interface Connexion {
  cid: string;
  ws: WebSocket;
  utilisateur: UtilisateurConnecte;
  vivant: boolean;
  /** Réactions et messages : 5/s. */
  seauSocial: Seau;
  /** Tout le reste (ping, signal, état…) : large, contre les inondations. */
  seauGeneral: Seau;
}

export interface SalleActive {
  id: string;
  salle: Salle;
  connexions: Map<string, Connexion>;
  minuteur: NodeJS.Timeout | null;
}

const EMOJIS_OK: ReadonlySet<string> = new Set(EMOJIS);
const CLE_SOUS_TITRES = /^[pe]\d{1,6}$/;

export const publicDe = (u: Pick<UtilisateurConnecte, 'id' | 'prenom' | 'couleur'>): UtilisateurPublic => ({ id: u.id, prenom: u.prenom, couleur: u.couleur });

export class Salles {
  readonly actives = new Map<string, SalleActive>();
  private battement: NodeJS.Timeout;
  private app: FastifyInstance;
  private maintenant: () => number;

  constructor(app: FastifyInstance, maintenant: () => number = Date.now) {
    this.app = app;
    this.maintenant = maintenant;
    this.battement = setInterval(() => this.maintien(), 25_000);
    this.battement.unref();
    app.addHook('onClose', async () => this.fermerTout());
  }

  presents(seanceId: string): number {
    return this.actives.get(seanceId)?.connexions.size ?? 0;
  }

  /** Maintien : ping de protocole, fermeture des connexions mortes. */
  private maintien(): void {
    for (const a of this.actives.values()) {
      for (const c of a.connexions.values()) {
        if (!c.vivant) { c.ws.terminate(); continue; }
        c.vivant = false;
        try { c.ws.ping(); } catch { /* ignoré */ }
      }
    }
  }

  fermerTout(): void {
    clearInterval(this.battement);
    for (const a of this.actives.values()) {
      if (a.minuteur) clearTimeout(a.minuteur);
      for (const c of a.connexions.values()) c.ws.terminate();
    }
    this.actives.clear();
  }

  envoyer(c: Connexion, msg: MessageServeur): void {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  }

  private diffuser(a: SalleActive, msg: MessageServeur, sauf: string | null = null): void {
    const texte = JSON.stringify(msg);
    for (const c of a.connexions.values()) if (c.cid !== sauf && c.ws.readyState === 1) c.ws.send(texte);
  }

  private erreur(c: Connexion, code: CodeErreurWs, message: string): void {
    this.envoyer(c, { t: 'erreur', code, message });
  }

  private diffuserEtat(a: SalleActive, raison: RaisonEtat, par: string | null): void {
    this.enregistrer(a);
    this.diffuser(a, { t: 'etat', etat: a.salle.instantane(), raison, par });
  }

  /** Écrit film, position, piste audio et sous-titres dans `seances`. */
  private enregistrer(a: SalleActive): void {
    const e = a.salle.aEnregistrer();
    try {
      this.app.db.prepare('UPDATE seances SET film_id = ?, position = ?, piste_audio = ?, sous_titres = ? WHERE id = ?')
        .run(e.filmId, e.position, e.pisteAudio, e.sousTitres, a.id);
    } catch (err) {
      this.app.log.warn({ err }, 'séance : état non enregistré');
    }
  }

  private ouvrir(id: string): SalleActive {
    let a = this.actives.get(id);
    if (a) return a;
    const l = this.app.db.prepare('SELECT film_id, position, piste_audio, sous_titres FROM seances WHERE id = ?').get(id) as
      { film_id: string | null; position: number; piste_audio: number | null; sous_titres: string | null } | undefined;
    a = {
      id,
      salle: new Salle(l?.film_id ? { filmId: l.film_id, position: l.position, pisteAudio: l.piste_audio, sousTitres: l.sous_titres } : { filmId: null, position: 0, pisteAudio: null, sousTitres: null }, this.maintenant),
      connexions: new Map(),
      minuteur: null,
    };
    this.actives.set(id, a);
    return a;
  }

  /** Branche une connexion acceptée à la salle de la séance (la crée au besoin) et envoie `bienvenue`. */
  rejoindre(seanceId: string, utilisateur: UtilisateurConnecte, ws: WebSocket): void {
    const a = this.ouvrir(seanceId);
    const cid = randomBytes(6).toString('hex');
    const c: Connexion = {
      cid, ws, utilisateur, vivant: true,
      seauSocial: new Seau(LIMITES_WS.evenementsParSeconde, LIMITES_WS.evenementsParSeconde, this.maintenant),
      seauGeneral: new Seau(200, 100, this.maintenant),
    };
    const moi = a.salle.ajouter(cid, publicDe(utilisateur));
    a.connexions.set(cid, c);
    ws.on('pong', () => { c.vivant = true; });
    ws.on('error', () => { /* la fermeture suit */ });
    ws.on('message', (data: Buffer, binaire: boolean) => {
      c.vivant = true;
      if (binaire) return;
      this.recevoir(a, c, data.toString('utf8'));
    });
    ws.on('close', () => this.partir(a, c));

    this.envoyer(c, {
      t: 'bienvenue',
      moi: { cid, utilisateur: moi.utilisateur },
      serveur: this.maintenant(),
      participants: [...a.salle.participants.values()].filter((p) => p.cid !== cid),
      etat: a.salle.instantane(),
      messages: messagesDe(this.app, seanceId, null, 50),
    });
    this.diffuser(a, { t: 'arrivee', participant: moi }, cid);
  }

  private partir(a: SalleActive, c: Connexion): void {
    if (!a.connexions.delete(c.cid)) return;
    const { participant, raison } = a.salle.retirer(c.cid);
    if (a.connexions.size === 0) {
      if (a.minuteur) clearTimeout(a.minuteur);
      this.enregistrer(a);
      this.actives.delete(a.id);
      return;
    }
    if (!participant) return;
    this.diffuser(a, { t: 'depart', cid: c.cid });
    if (raison) this.diffuserEtat(a, raison, raison === 'depart' ? participant.utilisateur.prenom : c.cid);
  }

  private recevoir(a: SalleActive, c: Connexion, texte: string): void {
    let msg: MessageClient;
    try {
      msg = JSON.parse(texte) as MessageClient;
    } catch {
      return this.erreur(c, 'message_invalide', 'Message illisible.');
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return this.erreur(c, 'message_invalide', 'Message illisible.');
    if (!c.seauGeneral.prendre()) return this.erreur(c, 'trop_vite', 'Trop de messages.');
    try {
      this.traiter(a, c, msg);
    } catch (err) {
      this.app.log.error({ err, type: msg.t }, 'séance : message en échec');
      this.erreur(c, 'serveur', 'Erreur côté serveur.');
    }
  }

  private traiter(a: SalleActive, c: Connexion, msg: MessageClient): void {
    const s = a.salle;
    const etat = (raison: RaisonEtat | null) => {
      if (raison) this.diffuserEtat(a, raison, c.cid);
    };
    switch (msg.t) {
      case 'ping':
        if (typeof msg.c === 'number') this.envoyer(c, { t: 'pong', c: msg.c, s: this.maintenant() });
        return;
      case 'lecture': return etat(s.lire(c.cid, msg.position));
      case 'pause': {
        const r = s.pause(c.cid, msg.position, msg.fin === true);
        if (r === 'fin') this.noterProgression(a, c, s.aEnregistrer().position, true);
        return etat(r);
      }
      case 'aller': return etat(s.aller(c.cid, msg.position));
      case 'film': {
        const film = typeof msg.filmId === 'string' ? this.app.mediatheque.obtenir(msg.filmId) : null;
        if (!film || film.etat !== 'pret' || !this.app.mediatheque.peutVoir(c.utilisateur, film.id)) {
          return this.erreur(c, 'film_inconnu', 'Film introuvable.');
        }
        // Enregistré d'abord : la règle d'accès « participant d'une séance dont le film est celui-ci » en dépend.
        return etat(s.film(c.cid, film.id));
      }
      case 'audio':
        if (!Number.isInteger(msg.piste) || msg.piste < 0 || msg.piste > 255) return this.erreur(c, 'piste_invalide', 'Piste audio invalide.');
        return etat(s.audio(c.cid, msg.piste));
      case 'sous_titres':
        if (msg.cle !== null && (typeof msg.cle !== 'string' || !CLE_SOUS_TITRES.test(msg.cle))) {
          return this.erreur(c, 'piste_invalide', 'Sous-titres invalides.');
        }
        return etat(s.sousTitresChoix(c.cid, msg.cle));
      case 'compte_a_rebours': {
        const r = s.demarrerCompteARebours(c.cid);
        if (!r) return;
        if (a.minuteur) clearTimeout(a.minuteur);
        const id = s.idCompte;
        a.minuteur = setTimeout(() => {
          a.minuteur = null;
          const fin = s.finCompteARebours(id);
          if (fin) this.diffuserEtat(a, fin, null);
        }, LIMITES_WS.compteARebours * 1000);
        a.minuteur.unref();
        return etat(r);
      }
      case 'tampon': return etat(s.tampon(c.cid, msg.enCours === true));
      case 'ignorer_attente':
        if (typeof msg.cid !== 'string') return;
        return etat(s.ignorerAttente(c.cid, msg.cid));
      case 'media': {
        const p = s.media(c.cid, msg.micro === true, msg.camera === true);
        if (p) this.diffuser(a, { t: 'media', cid: c.cid, micro: p.micro, camera: p.camera }, c.cid);
        return;
      }
      case 'reaction':
        if (typeof msg.emoji !== 'string' || !EMOJIS_OK.has(msg.emoji)) return this.erreur(c, 'message_invalide', 'Réaction inconnue.');
        if (!c.seauSocial.prendre()) return this.erreur(c, 'trop_vite', 'Trop de réactions.');
        this.diffuser(a, { t: 'reaction', cid: c.cid, emoji: msg.emoji as Emoji });
        return;
      case 'message': {
        if (typeof msg.texte !== 'string') return this.erreur(c, 'texte_invalide', 'Message vide.');
        // eslint-disable-next-line no-control-regex
        const t = msg.texte.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
        if (!t) return this.erreur(c, 'texte_invalide', 'Message vide.');
        if ([...t].length > LIMITES_WS.texteMessageMax) return this.erreur(c, 'texte_trop_long', `Message trop long (${LIMITES_WS.texteMessageMax} caractères au plus).`);
        if (!c.seauSocial.prendre()) return this.erreur(c, 'trop_vite', 'Trop de messages.');
        const position = s.aEnregistrer().filmId === null ? null : s.positionAttendue();
        const envoyeLe = maintenantIso();
        const r = this.app.db.prepare('INSERT INTO messages (seance_id, utilisateur_id, texte, position, envoye_le) VALUES (?, ?, ?, ?, ?)')
          .run(a.id, c.utilisateur.id, t, position, envoyeLe);
        this.diffuser(a, {
          t: 'message',
          message: { id: Number(r.lastInsertRowid), utilisateurId: c.utilisateur.id, prenom: c.utilisateur.prenom, texte: t, position, envoyeLe },
        });
        return;
      }
      case 'progression':
        if (positionValide(msg.position)) this.noterProgression(a, c, msg.position, false);
        return;
      case 'signal': {
        const cible = typeof msg.a === 'string' ? a.connexions.get(msg.a) : undefined;
        if (!cible || cible.cid === c.cid || typeof msg.donnees !== 'object' || msg.donnees === null) {
          return this.erreur(c, 'destinataire_inconnu', 'Destinataire inconnu.');
        }
        this.envoyer(cible, { t: 'signal', de: c.cid, donnees: msg.donnees });
        return;
      }
      default:
        this.erreur(c, 'type_inconnu', 'Type de message inconnu.');
    }
  }

  /** Progression du compte (reprise, historique) et position de la séance. */
  private noterProgression(a: SalleActive, c: Connexion, position: number, fin: boolean): void {
    const filmId = a.salle.aEnregistrer().filmId;
    if (!filmId) return;
    const film = this.app.mediatheque.obtenir(filmId);
    const duree = film ? (film.duree ?? film.analyse?.duree ?? null) : null;
    const pos = duree ? Math.min(position, duree) : position;
    const termine = fin || (duree !== null && duree > 0 && pos / duree >= 0.95);
    this.app.db.prepare(
      `INSERT INTO progression (utilisateur_id, film_id, position, duree, seance_id, termine, vu_le) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (utilisateur_id, film_id) DO UPDATE SET position = excluded.position, duree = excluded.duree,
         seance_id = excluded.seance_id, termine = excluded.termine, vu_le = excluded.vu_le`,
    ).run(c.utilisateur.id, filmId, termine && duree ? duree : pos, duree, a.id, termine ? 1 : 0, maintenantIso());
    this.app.db.prepare('UPDATE seances SET position = ? WHERE id = ?').run(a.salle.aEnregistrer().position, a.id);
  }

  /** Le film d'une séance est retiré ou remplacé hors WebSocket (suppression du film, `PATCH` de l'hôte). */
  changerFilm(seanceId: string, filmId: string | null): void {
    const a = this.actives.get(seanceId);
    if (!a) return;
    this.diffuserEtat(a, a.salle.film(null, filmId) ?? 'film', null);
  }

  surFilmSupprime(filmId: string): void {
    for (const a of this.actives.values()) if (a.salle.aEnregistrer().filmId === filmId) this.changerFilm(a.id, null);
  }

  /** Ferme les connexions d'une séance supprimée. */
  fermerSeance(seanceId: string): void {
    const a = this.actives.get(seanceId);
    if (!a) return;
    if (a.minuteur) clearTimeout(a.minuteur);
    this.actives.delete(seanceId);
    for (const c of a.connexions.values()) c.ws.close(4004, 'Séance supprimée');
  }
}
