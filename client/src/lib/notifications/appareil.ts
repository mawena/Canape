// Notifications : état d'un appareil, nom lisible, clé du serveur en octets (fonctions pures, testées).

export type EtatNotifications =
  | 'chargement'
  | 'non-pris-en-charge'
  | 'iphone-a-installer'
  | 'refuse'
  | 'inactif'
  | 'actif';

export interface Environnement {
  userAgent: string;
  /** Canapé est lancé depuis l'écran d'accueil (application installée). */
  installee: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  permission: NotificationPermission | null;
  /** Un abonnement existe déjà sur cet appareil. */
  abonne: boolean;
}

const estAppleMobile = (ua: string): boolean => /iPhone|iPad|iPod/.test(ua);

/** État affiché dans le compte, déduit de ce que le navigateur sait faire. */
export function etatNotifications(e: Environnement): EtatNotifications {
  if (!e.serviceWorker || !e.pushManager || !e.notification) {
    return estAppleMobile(e.userAgent) && !e.installee ? 'iphone-a-installer' : 'non-pris-en-charge';
  }
  if (e.permission === 'denied') return 'refuse';
  return e.abonne && e.permission === 'granted' ? 'actif' : 'inactif';
}

/** « Firefox sur Linux », « Safari sur iPhone »… (nom lisible de l'appareil, affiché nulle part ailleurs que chez soi). */
export function nomAppareil(ua: string): string {
  const navigateur = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const systeme = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux|X11/.test(ua) ? 'Linux' : '';
  return systeme ? `${navigateur} sur ${systeme}` : navigateur;
}

/** `applicationServerKey` : la clé publique du serveur (base64url) en octets. */
export function cleEnOctets(base64url: string): Uint8Array<ArrayBuffer> {
  const b = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binaire = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const sortie = new Uint8Array(new ArrayBuffer(binaire.length));
  for (let i = 0; i < binaire.length; i++) sortie[i] = binaire.charCodeAt(i);
  return sortie;
}
