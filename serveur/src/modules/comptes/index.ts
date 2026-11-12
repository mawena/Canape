import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  COULEURS_AVATAR, type Compte, type EtatApi, type InvitationAdmin, type InvitationPublique, type Reglages,
  type Role, type Utilisateur, type UtilisateurAdmin, type UtilisateurPublic,
} from '@canape/partage';
import {
  creerSession, supprimerSession, supprimerSessionsUtilisateur, versUtilisateur, type LigneUtilisateur,
} from '../../commun/auth.ts';
import { ErreurHttp, introuvable, requeteInvalide } from '../../commun/erreurs.ts';
import { maintenantIso } from '../../commun/identifiants.ts';
import { hasherMotDePasse, verifierMotDePasse } from '../../commun/motdepasse.ts';
import { version } from '../../commun/version.ts';
import { transaction } from '../../db/index.ts';
import { LimiteEssais } from './limite.ts';
import {
  chercherInvitation, creerInvitation, ecrireReglages, invitationValide, lienInvitation, lireReglages,
  nombreComptes, octetsParProprietaire, REGLAGES_VALIDES, type LigneInvitation,
} from './service.ts';
import { creerCalculStockage } from './stockage.ts';
import {
  formaterErreursSchema, IDENTIFIANT_MAX, IDENTIFIANT_MIN, MOT_DE_PASSE_MAX, MOT_DE_PASSE_MIN, PRENOM_MAX, PRENOM_MIN,
  validerIdentifiant, validerMotDePasse, validerPrenom,
} from './validation.ts';

export { creerInvitation, lireReglage, lireReglages } from './service.ts';

const schemaErreur = formaterErreursSchema;
const ENTETE_LIMITE = 'Retry-After';

/** Haché d'un mot de passe quelconque, vérifié quand le compte n'existe pas (durée de connexion comparable). */
let hachageFactice: Promise<string> | null = null;

const conflit = (code: string, message: string) => new ErreurHttp(409, code, message);

function utilisateurComplet(l: LigneUtilisateur, octets = 0): Compte {
  return { ...versUtilisateur(l), octetsUtilises: octets };
}

function ligneUtilisateur(db: import('../../db/index.ts').Base, id: number): LigneUtilisateur | null {
  return (db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(id) as LigneUtilisateur | undefined) ?? null;
}

function administrateursActifsAutres(db: import('../../db/index.ts').Base, id: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'admin' AND actif = 1 AND id <> ?").get(id) as { n: number }).n;
}

const moduleComptes: FastifyPluginAsync = async (app) => {
  const { db, config } = app;
  const limite = new LimiteEssais(5, 60_000);
  const calculerStockage = creerCalculStockage(config, db);
  const cleIp = (req: FastifyRequest): string => `ip:${req.ip}`;

  // Premier démarrage : aucun compte -> un lien d'invitation administrateur dans le journal (un seul valide à la fois).
  app.addHook('onReady', async () => {
    if (nombreComptes(db) > 0) return;
    const { lien } = creerInvitation(db, config, { type: 'compte', role: 'admin', remplacerSysteme: true });
    app.log.warn(`Installation requise : ouvre ce lien pour créer le compte administrateur : ${lien}`);
  });

  // ---- État -------------------------------------------------------------------------------------------------
  app.get('/api/etat', async (req, reply): Promise<EtatApi> => {
    const u = app.utilisateurOptionnel(req, reply);
    let utilisateur: Utilisateur | null = null;
    if (u) {
      const { sessionId: _s, ...sans } = u;
      utilisateur = sans;
    }
    return { version, utilisateur, installationRequise: nombreComptes(db) === 0 };
  });

  // ---- Connexion / déconnexion ------------------------------------------------------------------------------
  app.post<{ Body: { identifiant: string; motDePasse: string } }>('/api/connexion', {
    schemaErrorFormatter: schemaErreur,
    schema: {
      body: {
        type: 'object', required: ['identifiant', 'motDePasse'],
        properties: {
          identifiant: { type: 'string', minLength: 1, maxLength: 200 },
          motDePasse: { type: 'string', minLength: 1, maxLength: MOT_DE_PASSE_MAX },
        },
      },
    },
  }, async (req, reply) => {
    const identifiant = req.body.identifiant.trim().toLowerCase();
    const cles = [cleIp(req), `id:${identifiant}`];
    const attente = limite.attente(cles);
    if (attente > 0) {
      reply.header(ENTETE_LIMITE, String(attente));
      throw new ErreurHttp(429, 'trop_de_requetes', attente > 60 ? "Trop d'essais. Réessaie dans 1 minute." : `Trop d'essais. Réessaie dans ${attente} seconde${attente > 1 ? 's' : ''}.`);
    }
    const ligne = db.prepare('SELECT * FROM utilisateurs WHERE identifiant = ?').get(req.body.identifiant.trim()) as (LigneUtilisateur & { mot_de_passe: string }) | undefined;
    const hachage = ligne?.mot_de_passe ?? await (hachageFactice ??= hasherMotDePasse('canape-compte-inexistant'));
    const bon = await verifierMotDePasse(hachage, req.body.motDePasse);
    if (!bon || !ligne || ligne.actif !== 1) {
      limite.echec(cles);
      throw new ErreurHttp(401, 'identifiants_invalides', 'Identifiant ou mot de passe incorrect.');
    }
    limite.reussite(cles[1] as string);
    supprimerSession(req); // une éventuelle session précédente de ce navigateur
    db.prepare('UPDATE utilisateurs SET derniere_connexion = ? WHERE id = ?').run(maintenantIso(), ligne.id);
    creerSession(ligne.id, req, reply);
    return reply.status(204).send();
  });

  app.post('/api/deconnexion', async (req, reply) => {
    supprimerSession(req, reply);
    return reply.status(204).send();
  });

  // ---- Invitations (libres) ---------------------------------------------------------------------------------
  app.get<{ Params: { jeton: string } }>('/api/invitations/:jeton', async (req): Promise<InvitationPublique> => {
    const i = chercherInvitation(db, req.params.jeton);
    if (!i || !invitationValide(i)) return { type: i?.type ?? 'compte', role: null, prenomSuggere: null, valide: false, invitePar: null };
    let invitePar: string | null = null;
    const qui = i.type === 'reinitialisation' ? i.utilisateur_id : i.cree_par;
    if (qui) invitePar = (db.prepare('SELECT prenom FROM utilisateurs WHERE id = ?').get(qui) as { prenom: string } | undefined)?.prenom ?? null;
    return { type: i.type, role: i.role, prenomSuggere: i.prenom_suggere, valide: true, invitePar };
  });

  app.post<{ Params: { jeton: string }; Body: { prenom?: string; identifiant?: string; motDePasse: string; couleur?: string } }>('/api/invitations/:jeton', {
    schemaErrorFormatter: schemaErreur,
    schema: {
      body: {
        type: 'object', required: ['motDePasse'],
        properties: {
          prenom: { type: 'string', minLength: PRENOM_MIN, maxLength: PRENOM_MAX + 20 },
          identifiant: { type: 'string', minLength: IDENTIFIANT_MIN, maxLength: IDENTIFIANT_MAX + 20 },
          motDePasse: { type: 'string', minLength: MOT_DE_PASSE_MIN, maxLength: MOT_DE_PASSE_MAX },
          couleur: { type: 'string', enum: [...COULEURS_AVATAR] },
        },
      },
    },
  }, async (req, reply) => {
    const lien = chercherInvitation(db, req.params.jeton);
    if (!lien || !invitationValide(lien)) throw new ErreurHttp(404, 'invitation_invalide', 'Ce lien a expiré ou a déjà été utilisé. Demande-en un nouveau.');
    const motDePasse = validerMotDePasse(req.body.motDePasse);
    const hachage = await hasherMotDePasse(motDePasse);

    if (lien.type === 'reinitialisation') {
      transaction(db, () => {
        const r = db.prepare('UPDATE invitations SET utilisee_le = ? WHERE id = ? AND utilisee_le IS NULL').run(maintenantIso(), lien.id);
        if (Number(r.changes) !== 1) throw new ErreurHttp(404, 'invitation_invalide', 'Ce lien a déjà été utilisé.');
        db.prepare('UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?').run(hachage, lien.utilisateur_id);
        if (lien.utilisateur_id) supprimerSessionsUtilisateur(db, lien.utilisateur_id);
      });
      return reply.status(204).send();
    }

    if (req.body.prenom === undefined || req.body.identifiant === undefined) throw requeteInvalide('Indique ton prénom et ton identifiant.');
    const prenom = validerPrenom(req.body.prenom);
    const identifiant = validerIdentifiant(req.body.identifiant);
    const role: Role = lien.role ?? 'viewer';
    const couleur = req.body.couleur ?? COULEURS_AVATAR[Math.floor(Math.random() * COULEURS_AVATAR.length)] as string;
    const quota = role === 'admin' ? null : lireReglages(db, config).quotaDefautOctets;
    const id = transaction(db, () => {
      const r = db.prepare('UPDATE invitations SET utilisee_le = ? WHERE id = ? AND utilisee_le IS NULL').run(maintenantIso(), lien.id);
      if (Number(r.changes) !== 1) throw new ErreurHttp(404, 'invitation_invalide', 'Ce lien a déjà été utilisé.');
      if (db.prepare('SELECT 1 FROM utilisateurs WHERE identifiant = ?').get(identifiant)) {
        throw conflit('identifiant_pris', 'Cet identifiant est déjà pris. Choisis-en un autre.');
      }
      const ins = db.prepare(
        `INSERT INTO utilisateurs (prenom, identifiant, mot_de_passe, role, peut_televerser, quota_octets, actif, couleur, cree_le, derniere_connexion)
         VALUES (?, ?, ?, ?, 1, ?, 1, ?, ?, ?)`,
      ).run(prenom, identifiant, hachage, role, quota, couleur, maintenantIso(), maintenantIso());
      return Number(ins.lastInsertRowid);
    });
    supprimerSession(req);
    creerSession(id, req, reply);
    return reply.status(201).send(versUtilisateur(ligneUtilisateur(db, id) as LigneUtilisateur));
  });

  // ---- Compte -----------------------------------------------------------------------------------------------
  app.get('/api/compte', { onRequest: app.exigerConnexion }, async (req): Promise<Compte> => {
    const l = ligneUtilisateur(db, req.utilisateur.id) as LigneUtilisateur;
    return utilisateurComplet(l, octetsParProprietaire(db).get(l.id) ?? 0);
  });

  app.patch<{ Body: { prenom?: string; couleur?: string; motDePasse?: { actuel: string; nouveau: string } } }>('/api/compte', {
    onRequest: app.exigerConnexion,
    schemaErrorFormatter: schemaErreur,
    schema: {
      body: {
        type: 'object',
        properties: {
          prenom: { type: 'string', minLength: PRENOM_MIN, maxLength: PRENOM_MAX + 20 },
          couleur: { type: 'string', enum: [...COULEURS_AVATAR] },
          motDePasse: {
            type: 'object', required: ['actuel', 'nouveau'],
            properties: {
              actuel: { type: 'string', minLength: 1, maxLength: MOT_DE_PASSE_MAX },
              nouveau: { type: 'string', minLength: MOT_DE_PASSE_MIN, maxLength: MOT_DE_PASSE_MAX },
            },
          },
        },
      },
    },
  }, async (req): Promise<Compte> => {
    const { prenom, couleur, motDePasse } = req.body;
    if (prenom === undefined && couleur === undefined && motDePasse === undefined) throw requeteInvalide('Rien à modifier.');
    const id = req.utilisateur.id;
    const nouveauPrenom = prenom === undefined ? undefined : validerPrenom(prenom);
    let hachage: string | undefined;
    if (motDePasse) {
      validerMotDePasse(motDePasse.nouveau);
      const cle = [`compte:${id}`];
      const attente = limite.attente(cle);
      if (attente > 0) throw new ErreurHttp(429, 'trop_de_requetes', "Trop d'essais. Réessaie dans une minute.");
      const courant = db.prepare('SELECT mot_de_passe FROM utilisateurs WHERE id = ?').get(id) as { mot_de_passe: string };
      if (!(await verifierMotDePasse(courant.mot_de_passe, motDePasse.actuel))) {
        limite.echec(cle);
        throw new ErreurHttp(400, 'mot_de_passe_incorrect', 'Ton mot de passe actuel est incorrect.');
      }
      limite.reussite(cle[0] as string);
      hachage = await hasherMotDePasse(motDePasse.nouveau);
    }
    transaction(db, () => {
      if (nouveauPrenom !== undefined) db.prepare('UPDATE utilisateurs SET prenom = ? WHERE id = ?').run(nouveauPrenom, id);
      if (couleur !== undefined) db.prepare('UPDATE utilisateurs SET couleur = ? WHERE id = ?').run(couleur, id);
      if (hachage !== undefined) {
        db.prepare('UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?').run(hachage, id);
        supprimerSessionsUtilisateur(db, id, req.utilisateur.sessionId);
      }
    });
    return utilisateurComplet(ligneUtilisateur(db, id) as LigneUtilisateur, octetsParProprietaire(db).get(id) ?? 0);
  });

  app.get('/api/utilisateurs', { onRequest: app.exigerConnexion }, async (): Promise<UtilisateurPublic[]> => {
    const l = db.prepare('SELECT id, prenom, couleur FROM utilisateurs WHERE actif = 1 ORDER BY prenom COLLATE NOCASE, id').all() as unknown as UtilisateurPublic[];
    return l.map(({ id, prenom, couleur }) => ({ id, prenom, couleur }));
  });

  // ---- Administration ---------------------------------------------------------------------------------------
  await app.register(async (admin) => {
    admin.addHook('onRequest', app.exigerAdmin);

    admin.get('/utilisateurs', async (): Promise<UtilisateurAdmin[]> => {
      const octets = octetsParProprietaire(db);
      const lignes = db.prepare('SELECT * FROM utilisateurs ORDER BY id').all() as unknown as LigneUtilisateur[];
      return lignes.map((l) => ({ ...versUtilisateur(l), actif: l.actif === 1, octetsUtilises: octets.get(l.id) ?? 0 }));
    });

    admin.patch<{ Params: { id: number }; Body: { prenom?: string; role?: Role; peutTeleverser?: boolean; quotaOctets?: number | null; actif?: boolean } }>('/utilisateurs/:id', {
      schemaErrorFormatter: schemaErreur,
      schema: {
        params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
        body: {
          type: 'object',
          properties: {
            prenom: { type: 'string', minLength: PRENOM_MIN, maxLength: PRENOM_MAX + 20 },
            role: { type: 'string', enum: ['admin', 'viewer'] },
            peutTeleverser: { type: 'boolean' },
            quotaOctets: { type: ['integer', 'null'], minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            actif: { type: 'boolean' },
          },
        },
      },
    }, async (req): Promise<UtilisateurAdmin> => {
      const { id } = req.params;
      const b = req.body;
      if (Object.keys(b).length === 0) throw requeteInvalide('Rien à modifier.');
      const prenom = b.prenom === undefined ? undefined : validerPrenom(b.prenom);
      transaction(db, () => {
        const cible = ligneUtilisateur(db, id);
        if (!cible) throw introuvable('Ce compte n’existe pas.');
        const perdAdmin = cible.role === 'admin' && cible.actif === 1
          && ((b.role !== undefined && b.role !== 'admin') || b.actif === false);
        if (perdAdmin && administrateursActifsAutres(db, id) === 0) {
          throw conflit('dernier_admin', 'Il doit rester au moins un administrateur actif.');
        }
        if (prenom !== undefined) db.prepare('UPDATE utilisateurs SET prenom = ? WHERE id = ?').run(prenom, id);
        if (b.role !== undefined) db.prepare('UPDATE utilisateurs SET role = ? WHERE id = ?').run(b.role, id);
        if (b.peutTeleverser !== undefined) db.prepare('UPDATE utilisateurs SET peut_televerser = ? WHERE id = ?').run(b.peutTeleverser ? 1 : 0, id);
        if (b.quotaOctets !== undefined) db.prepare('UPDATE utilisateurs SET quota_octets = ? WHERE id = ?').run(b.quotaOctets, id);
        if (b.actif !== undefined) {
          db.prepare('UPDATE utilisateurs SET actif = ? WHERE id = ?').run(b.actif ? 1 : 0, id);
          if (!b.actif) supprimerSessionsUtilisateur(db, id);
        }
      });
      const l = ligneUtilisateur(db, id) as LigneUtilisateur;
      return { ...versUtilisateur(l), actif: l.actif === 1, octetsUtilises: octetsParProprietaire(db).get(id) ?? 0 };
    });

    admin.delete<{ Params: { id: number } }>('/utilisateurs/:id', {
      schema: { params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } },
      schemaErrorFormatter: schemaErreur,
    }, async (req, reply) => {
      const { id } = req.params;
      if (id === req.utilisateur.id) throw conflit('suppression_de_soi', 'Tu ne peux pas supprimer ton propre compte.');
      const films = transaction(db, () => {
        const cible = ligneUtilisateur(db, id);
        if (!cible) throw introuvable('Ce compte n’existe pas.');
        if (cible.role === 'admin' && cible.actif === 1 && administrateursActifsAutres(db, id) === 0) {
          throw conflit('dernier_admin', 'Il doit rester au moins un administrateur actif.');
        }
        const f = (db.prepare('SELECT id FROM films WHERE proprietaire_id = ?').all(id) as Array<{ id: string }>).map((x) => x.id);
        db.prepare('DELETE FROM utilisateurs WHERE id = ?').run(id);
        return f;
      });
      // Les lignes de films sont parties avec le compte (cascade) : on retire aussi leurs fichiers.
      await Promise.all(films.map((f) => rm(path.join(config.films, f), { recursive: true, force: true }).catch(() => undefined)));
      return reply.status(204).send();
    });

    admin.post<{ Params: { id: number } }>('/utilisateurs/:id/reinitialisation', {
      schema: { params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } },
      schemaErrorFormatter: schemaErreur,
    }, async (req, reply) => {
      if (!ligneUtilisateur(db, req.params.id)) throw introuvable('Ce compte n’existe pas.');
      const i = creerInvitation(db, config, { type: 'reinitialisation', utilisateurId: req.params.id, creePar: req.utilisateur.id });
      return reply.status(201).send({ lien: i.lien, id: i.id, expireLe: i.expireLe });
    });

    admin.get('/invitations', async (): Promise<InvitationAdmin[]> => {
      db.prepare("DELETE FROM invitations WHERE expire_le < ? AND (utilisee_le IS NULL OR utilisee_le < ?)").run(
        maintenantIso(new Date(Date.now() - 30 * 86_400_000)), maintenantIso(new Date(Date.now() - 30 * 86_400_000)),
      );
      const l = db.prepare('SELECT * FROM invitations ORDER BY id DESC LIMIT 200').all() as unknown as LigneInvitation[];
      return l.map((i) => ({
        id: i.id, type: i.type, role: i.role, prenomSuggere: i.prenom_suggere, utilisateurId: i.utilisateur_id,
        creeLe: i.cree_le, expireLe: i.expire_le, utiliseeLe: i.utilisee_le,
      }));
    });

    admin.post<{ Body: { role: Role; prenomSuggere?: string; dureeJours?: number } }>('/invitations', {
      schemaErrorFormatter: schemaErreur,
      schema: {
        body: {
          type: 'object', required: ['role'],
          properties: {
            role: { type: 'string', enum: ['admin', 'viewer'] },
            prenomSuggere: { type: 'string', minLength: PRENOM_MIN, maxLength: PRENOM_MAX + 20 },
            dureeJours: { type: 'integer', minimum: 1, maximum: 90 },
          },
        },
      },
    }, async (req, reply) => {
      const prenomSuggere = req.body.prenomSuggere === undefined ? null : validerPrenom(req.body.prenomSuggere);
      const i = creerInvitation(db, config, {
        type: 'compte', role: req.body.role, prenomSuggere, creePar: req.utilisateur.id, jours: req.body.dureeJours,
      });
      return reply.status(201).send({ lien: i.lien, id: i.id, expireLe: i.expireLe });
    });

    admin.delete<{ Params: { id: number } }>('/invitations/:id', {
      schema: { params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } },
      schemaErrorFormatter: schemaErreur,
    }, async (req, reply) => {
      const r = db.prepare('DELETE FROM invitations WHERE id = ?').run(req.params.id);
      if (Number(r.changes) === 0) throw introuvable('Cette invitation n’existe pas.');
      return reply.status(204).send();
    });

    admin.get('/stockage', async () => calculerStockage());

    admin.get('/reglages', async (): Promise<Reglages> => lireReglages(db, config));

    admin.patch<{ Body: Record<string, unknown> }>('/reglages', {
      schemaErrorFormatter: schemaErreur,
      schema: { body: { type: 'object' } },
    }, async (req): Promise<Reglages> => {
      const entrees = Object.entries(req.body);
      if (entrees.length === 0) throw requeteInvalide('Rien à modifier.');
      for (const [cle, v] of entrees) {
        const valide = (REGLAGES_VALIDES as Record<string, (x: unknown) => boolean>)[cle];
        if (!valide) throw requeteInvalide(`Réglage inconnu : ${cle}.`);
        if (!valide(v)) throw requeteInvalide(formaterErreursSchema([{ instancePath: `/${cle}`, keyword: "type", params: {}, message: "", schemaPath: "" }]).message);
      }
      ecrireReglages(db, req.body as Partial<Reglages>);
      return lireReglages(db, config);
    });
  }, { prefix: '/api/admin' });
};

export type { FastifyReply };
export default moduleComptes;
