// Service de notifications : clés VAPID gardées en base, abonnements par appareil, envois, limite par séance.
import type { FastifyInstance } from 'fastify';
import type { ChargeNotification } from '@canape/partage';
import { maintenantIso } from '../../commun/identifiants.ts';
import { envoyerNotification, genererClesVapid, type Abonnement, type ClesVapid, type ResultatEnvoi } from './webpush.ts';

/** Une personne prévenue au plus une fois par séance dans cette fenêtre. */
export const DELAI_ENTRE_NOTIFICATIONS_MS = 10 * 60_000;
export const MAX_ABONNEMENTS_PAR_PERSONNE = 20;

interface LigneAbonnement extends Abonnement { id: number; utilisateur_id: number }

export interface EntreeSalle {
  seanceId: string;
  entrant: { id: number; prenom: string };
  /** Identifiants des personnes déjà dans la salle (l'entrant compris). */
  presents: ReadonlySet<number>;
}

export class ServiceNotifications {
  /** Délai d'attente d'un envoi (réglable en test). */
  delaiMs = 8000;
  /** Horloge (réglable en test). */
  maintenant: () => number = Date.now;
  private app: FastifyInstance;
  private clesVapid: ClesVapid | null = null;

  constructor(app: FastifyInstance) {
    this.app = app;
  }

  /** Clés du serveur : créées au premier appel puis relues en base, jamais changées. */
  cles(): ClesVapid {
    if (this.clesVapid) return this.clesVapid;
    const db = this.app.db;
    const lire = () => db.prepare('SELECT cle_publique, cle_privee FROM notifications_cles WHERE id = 1').get() as { cle_publique: string; cle_privee: string } | undefined;
    let l = lire();
    if (!l) {
      const neuves = genererClesVapid();
      db.prepare('INSERT OR IGNORE INTO notifications_cles (id, cle_publique, cle_privee, cree_le) VALUES (1, ?, ?, ?)').run(neuves.publique, neuves.privee, maintenantIso());
      l = lire()!;
    }
    this.clesVapid = { publique: l.cle_publique, privee: l.cle_privee };
    return this.clesVapid;
  }

  /** Crée l'abonnement, ou le met à jour (même `endpoint` : il passe à la personne connectée). */
  abonner(utilisateurId: number, a: Abonnement, appareil: string): void {
    const db = this.app.db;
    db.prepare(
      `INSERT INTO notifications_abonnements (utilisateur_id, endpoint, p256dh, auth, appareil, cree_le) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET utilisateur_id = excluded.utilisateur_id, p256dh = excluded.p256dh, auth = excluded.auth, appareil = excluded.appareil`,
    ).run(utilisateurId, a.endpoint, a.p256dh, a.auth, appareil, maintenantIso(new Date(this.maintenant())));
  }

  nombreAbonnements(utilisateurId: number): number {
    return (this.app.db.prepare('SELECT COUNT(*) AS n FROM notifications_abonnements WHERE utilisateur_id = ?').get(utilisateurId) as { n: number }).n;
  }

  possede(utilisateurId: number, endpoint: string): boolean {
    return this.app.db.prepare('SELECT 1 AS x FROM notifications_abonnements WHERE utilisateur_id = ? AND endpoint = ?').get(utilisateurId, endpoint) !== undefined;
  }

  desabonner(utilisateurId: number, endpoint: string): void {
    this.app.db.prepare('DELETE FROM notifications_abonnements WHERE utilisateur_id = ? AND endpoint = ?').run(utilisateurId, endpoint);
  }

  private abonnementsDe(utilisateurId: number, endpoint?: string): LigneAbonnement[] {
    const db = this.app.db;
    return (endpoint === undefined
      ? db.prepare('SELECT id, utilisateur_id, endpoint, p256dh, auth FROM notifications_abonnements WHERE utilisateur_id = ?').all(utilisateurId)
      : db.prepare('SELECT id, utilisateur_id, endpoint, p256dh, auth FROM notifications_abonnements WHERE utilisateur_id = ? AND endpoint = ?').all(utilisateurId, endpoint)
    ) as unknown as LigneAbonnement[];
  }

  /** Envoie à un abonnement ; 404 / 410 le suppriment ; le résultat est noté. Ne lève jamais. */
  private async envoyerA(a: LigneAbonnement, charge: ChargeNotification): Promise<ResultatEnvoi> {
    let r: ResultatEnvoi;
    try {
      r = await envoyerNotification(a, Buffer.from(JSON.stringify(charge)), {
        cles: this.cles(), sujet: this.app.config.urlPublique, delaiMs: this.delaiMs, maintenant: this.maintenant(),
      });
    } catch (err) {
      r = { ok: false, statut: null, expire: false, raison: err instanceof Error ? err.name : 'erreur' };
    }
    try {
      const db = this.app.db;
      const quand = maintenantIso(new Date(this.maintenant()));
      if (r.ok) db.prepare('UPDATE notifications_abonnements SET dernier_succes_le = ? WHERE id = ?').run(quand, a.id);
      else if (r.expire) db.prepare('DELETE FROM notifications_abonnements WHERE id = ?').run(a.id);
      else db.prepare('UPDATE notifications_abonnements SET dernier_echec_le = ?, dernier_echec_raison = ? WHERE id = ?').run(quand, r.raison, a.id);
    } catch (err) {
      this.app.log.warn({ err }, 'notifications : résultat non enregistré');
    }
    return r;
  }

  /** Notification d'essai de la personne : à un appareil (`endpoint`) ou à tous les siens. */
  async essai(utilisateurId: number, endpoint?: string): Promise<{ envoyes: number; echecs: number }> {
    const charge: ChargeNotification = {
      titre: 'Canapé', corps: 'Les notifications fonctionnent sur cet appareil.', url: '/compte', etiquette: 'essai',
    };
    const resultats = await Promise.all(this.abonnementsDe(utilisateurId, endpoint).map((a) => this.envoyerA(a, charge)));
    const envoyes = resultats.filter((r) => r.ok).length;
    return { envoyes, echecs: resultats.length - envoyes };
  }

  /**
   * Quelqu'un entre dans la salle : prévient les autres participants de la séance (hôte et invités) qui ne sont pas
   * dans la salle et qui ont un appareil abonné, au plus une fois par séance toutes les 10 minutes. Ne lève jamais.
   */
  async prevenirEntree(e: EntreeSalle): Promise<number> {
    try {
      const db = this.app.db;
      const s = db.prepare(
        `SELECT s.hote_id, s.terminee_le, COALESCE(NULLIF(TRIM(s.titre), ''), f.titre) AS nom
           FROM seances s LEFT JOIN films f ON f.id = s.film_id WHERE s.id = ?`,
      ).get(e.seanceId) as { hote_id: number; terminee_le: string | null; nom: string | null } | undefined;
      if (!s || s.terminee_le !== null) return 0;
      const ids = new Set<number>([s.hote_id]);
      for (const p of db.prepare('SELECT utilisateur_id FROM seances_participants WHERE seance_id = ?').all(e.seanceId) as Array<{ utilisateur_id: number }>) ids.add(p.utilisateur_id);
      const charge: ChargeNotification = {
        titre: `${e.entrant.prenom} est dans la salle`,
        corps: s.nom ? `${s.nom} — rejoins la séance quand tu veux.` : 'Rejoins la séance quand tu veux.',
        url: `/seances/${e.seanceId}`,
        etiquette: `seance-${e.seanceId}`,
      };
      const maintenant = this.maintenant();
      const envois: Array<Promise<ResultatEnvoi>> = [];
      let prevenus = 0;
      for (const id of ids) {
        if (id === e.entrant.id || e.presents.has(id)) continue;
        const abonnements = this.abonnementsDe(id);
        if (abonnements.length === 0) continue;
        const dernier = db.prepare('SELECT envoye_le FROM notifications_envois WHERE seance_id = ? AND utilisateur_id = ?').get(e.seanceId, id) as { envoye_le: string } | undefined;
        if (dernier && maintenant - Date.parse(dernier.envoye_le) < DELAI_ENTRE_NOTIFICATIONS_MS) continue;
        // La limite se prend avant l'envoi : deux entrées rapprochées ne préviennent pas deux fois.
        db.prepare(
          `INSERT INTO notifications_envois (seance_id, utilisateur_id, envoye_le) VALUES (?, ?, ?)
           ON CONFLICT (seance_id, utilisateur_id) DO UPDATE SET envoye_le = excluded.envoye_le`,
        ).run(e.seanceId, id, maintenantIso(new Date(maintenant)));
        prevenus++;
        for (const a of abonnements) envois.push(this.envoyerA(a, charge));
      }
      await Promise.all(envois);
      return prevenus;
    } catch (err) {
      this.app.log.warn({ err }, 'notifications : prévenir à l\'entrée dans la salle a échoué');
      return 0;
    }
  }
}
