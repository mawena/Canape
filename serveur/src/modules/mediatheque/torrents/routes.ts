// Routes HTTP des torrents : GET/POST /api/torrents, PATCH/DELETE /api/torrents/:id.
import type { FastifyInstance } from 'fastify';
import parseTorrent from 'parse-torrent';
import { TAILLE_MAX_FICHIER_TORRENT, type CorpsModifTorrent, type ListeTelechargements, type Telechargement } from '@canape/partage';
import { ErreurHttp, interdit, requeteInvalide } from '../../../commun/erreurs.ts';
import { analyserMagnet } from './fichiers.ts';
import type { SourceAjout, Torrents } from './service.ts';

export function installerRoutesTorrents(app: FastifyInstance, torrents: Torrents): void {
  const pre = { preHandler: app.exigerConnexion };

  app.get('/api/torrents', pre, async (req): Promise<ListeTelechargements> => ({
    peutAjouter: torrents.peutAjouter(req.utilisateur),
    telechargements: torrents.lister(req.utilisateur),
  }));

  app.post(
    '/api/torrents',
    { ...pre, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply): Promise<Telechargement> => {
      if (!torrents.actif) throw interdit('Les torrents sont désactivés sur ce serveur.');
      if (!torrents.peutAjouter(req.utilisateur)) throw interdit("Tu n'as pas le droit d'ajouter des films.");
      let source: SourceAjout;
      if (req.isMultipart()) {
        const fichier = await req.file();
        if (!fichier) throw requeteInvalide('Aucun fichier reçu.');
        let octets: Buffer;
        try { octets = await fichier.toBuffer(); } catch { throw tropGros(); }
        if (fichier.file.truncated || octets.length > TAILLE_MAX_FICHIER_TORRENT) throw tropGros();
        const champMagnet = fichier.fields['magnet'] as { value?: unknown } | undefined;
        if (octets.length === 0 && typeof champMagnet?.value === 'string') {
          const m = analyserMagnet(champMagnet.value);
          source = { magnet: m.magnet, infoHash: m.infoHash, nom: m.nom };
        } else {
          try {
            const t = await parseTorrent(octets);
            if (!t.infoHash) throw new Error('pas de hash');
            source = { fichier: octets, infoHash: t.infoHash.toLowerCase(), nom: t.name ?? null };
          } catch {
            throw requeteInvalide("Ce fichier n'est pas un .torrent lisible.");
          }
        }
      } else {
        const m = analyserMagnet((req.body as { magnet?: unknown } | null)?.magnet);
        source = { magnet: m.magnet, infoHash: m.infoHash, nom: m.nom };
      }
      const t = await torrents.ajouter(req.utilisateur, source);
      return reply.code(201).send(t);
    },
  );

  app.patch('/api/torrents/:id', pre, async (req): Promise<Telechargement> => {
    const corps = req.body;
    if (!corps || typeof corps !== 'object' || Array.isArray(corps)) throw requeteInvalide('Corps invalide.');
    return torrents.modifier(req.utilisateur, (req.params as { id: string }).id, corps as CorpsModifTorrent);
  });

  app.delete('/api/torrents/:id', pre, async (req, reply) => {
    await torrents.retirer(req.utilisateur, (req.params as { id: string }).id);
    return reply.code(204).send();
  });
}

const tropGros = () => new ErreurHttp(413, 'trop_volumineux', 'Ce fichier .torrent est trop gros (1 Mo au plus).');
