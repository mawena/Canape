// Types minimaux de WebTorrent 3 et de parse-torrent (les paquets n'en fournissent pas) : seulement ce que Canapé utilise.

declare module 'webtorrent' {
  import { EventEmitter } from 'node:events';

  export interface FichierWebTorrent {
    name: string;
    /** Chemin dans le torrent, racine comprise (`Dossier/Film.mkv`). */
    path: string;
    length: number;
    downloaded: number;
    done: boolean;
    select(priority?: number): void;
    deselect(): void;
  }

  export interface TorrentWebTorrent extends EventEmitter {
    infoHash: string;
    name: string;
    path: string;
    files: FichierWebTorrent[];
    pieces: unknown[];
    deselect(debut: number, fin: number): void;
    ready: boolean;
    done: boolean;
    destroyed: boolean;
    length: number;
    received: number;
    uploaded: number;
    ratio: number;
    downloadSpeed: number;
    uploadSpeed: number;
    numPeers: number;
    addPeer(adresse: string): boolean;
    pause(): void;
    resume(): void;
    destroy(options?: { destroyStore?: boolean }, rappel?: (err?: Error | null) => void): void;
  }

  export interface OptionsClientWebTorrent {
    torrentPort?: number;
    dhtPort?: number;
    dht?: boolean | object;
    tracker?: boolean | object;
    lsd?: boolean;
    utp?: boolean;
    webSeeds?: boolean;
    natUpnp?: boolean | string;
    natPmp?: boolean;
    maxConns?: number;
    /** Octets/s, -1 = sans limite. */
    downloadLimit?: number;
    uploadLimit?: number;
  }

  export interface OptionsTorrentWebTorrent {
    path?: string;
    deselect?: boolean;
    announce?: string[];
    skipVerify?: boolean;
    private?: boolean;
  }

  export default class WebTorrent extends EventEmitter {
    constructor(options?: OptionsClientWebTorrent);
    torrents: TorrentWebTorrent[];
    torrentPort: number;
    destroyed: boolean;
    add(source: string | Uint8Array, options?: OptionsTorrentWebTorrent, onTorrent?: (t: TorrentWebTorrent) => void): TorrentWebTorrent;
    seed(source: string | string[] | Uint8Array, options?: Record<string, unknown>, onSeed?: (t: TorrentWebTorrent) => void): TorrentWebTorrent;
    throttleDownload(octetsParSeconde: number): void;
    throttleUpload(octetsParSeconde: number): void;
    destroy(rappel?: (err?: Error | null) => void): void;
  }
}

declare module 'parse-torrent' {
  export interface TorrentAnalyse {
    infoHash: string;
    name?: string;
    length?: number;
    files?: Array<{ path: string; name: string; length: number; offset: number }>;
  }
  export default function parseTorrent(source: string | Uint8Array): Promise<TorrentAnalyse>;
}
