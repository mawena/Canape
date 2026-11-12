// Caméra et micro : ouverture tolérante (la salle reste utilisable si l'un ou l'autre manque), périphériques, vu-mètre.
import { contraintesMicro, niveauRms } from './son.ts';

export type RaisonSansMedias = 'insecure' | 'refus' | 'absent';

export interface Peripheriques {
  micros: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  sorties: MediaDeviceInfo[];
}

export interface ChoixMedias {
  micro?: string;
  camera?: string;
  casque?: boolean;
}

/** Caméra légère : le film a besoin de la bande passante. */
export function contraintesCamera(deviceId?: string): MediaTrackConstraints {
  return {
    width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
  };
}

export async function ouvrirMedias(choix: ChoixMedias = {}): Promise<{ flux: MediaStream | null; raison: RaisonSansMedias | null }> {
  if (!navigator.mediaDevices?.getUserMedia) return { flux: null, raison: 'insecure' };
  const audio = contraintesMicro(choix.casque ?? false, choix.micro);
  const video = contraintesCamera(choix.camera);
  const essais: MediaStreamConstraints[] = [{ audio, video }, { audio, video: false }, { audio: false, video }];
  let raison: RaisonSansMedias = 'absent';
  for (const contraintes of essais) {
    try {
      return { flux: await navigator.mediaDevices.getUserMedia(contraintes), raison: null };
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        raison = 'refus';
        break;
      }
    }
  }
  return { flux: null, raison };
}

export async function lirePeripheriques(): Promise<Peripheriques> {
  const vide: Peripheriques = { micros: [], cameras: [], sorties: [] };
  if (!navigator.mediaDevices?.enumerateDevices) return vide;
  try {
    const tous = await navigator.mediaDevices.enumerateDevices();
    return {
      micros: tous.filter((d) => d.kind === 'audioinput'),
      cameras: tous.filter((d) => d.kind === 'videoinput'),
      sorties: tous.filter((d) => d.kind === 'audiooutput'),
    };
  } catch {
    return vide;
  }
}

export function libelleAppareil(d: MediaDeviceInfo, n: number): string {
  return d.label || `Appareil ${n + 1}`;
}

/** Vu-mètre : rappelle `auNiveau` (0–1) à chaque image tant qu'il n'est pas arrêté. */
export function mesurerMicro(contexte: AudioContext, piste: MediaStreamTrack, auNiveau: (n: number) => void): () => void {
  const source = contexte.createMediaStreamSource(new MediaStream([piste]));
  const analyseur = contexte.createAnalyser();
  analyseur.fftSize = 1024;
  source.connect(analyseur);
  const donnees = new Uint8Array(analyseur.fftSize);
  let fini = false;
  const boucle = () => {
    if (fini) return;
    analyseur.getByteTimeDomainData(donnees);
    auNiveau(Math.min(1, niveauRms(donnees) * 4));
    requestAnimationFrame(boucle);
  };
  boucle();
  return () => {
    fini = true;
    try { source.disconnect(); } catch { /* déjà fait */ }
  };
}

/** Détecteur de voix d'un flux distant (le flux doit aussi être attaché à un `<audio>` : bug de Chrome). */
export function detecteurVoix(contexte: AudioContext, flux: MediaStream): { niveau: () => number; arreter: () => void } {
  const source = contexte.createMediaStreamSource(new MediaStream(flux.getAudioTracks()));
  const analyseur = contexte.createAnalyser();
  analyseur.fftSize = 2048;
  source.connect(analyseur); // volontairement pas relié à la sortie : le son sort par l'élément <audio>
  const donnees = new Uint8Array(analyseur.fftSize);
  return {
    niveau() {
      analyseur.getByteTimeDomainData(donnees);
      return niveauRms(donnees);
    },
    arreter() {
      try { source.disconnect(); } catch { /* déjà fait */ }
    },
  };
}
