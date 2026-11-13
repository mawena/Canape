// Notifications Web Push côté navigateur : état de l'appareil, abonnement, désabonnement. Jamais de demande de permission
// sans geste de la personne : `activer` n'est appelée que par un clic.
import type { CorpsAbonnementNotifications, ReponseCleNotifications, ReponseEssaiNotifications } from '@canape/partage';
import { api } from '$lib/api/client.ts';

import { cleEnOctets, etatNotifications, nomAppareil, type EtatNotifications, type Environnement } from './appareil.ts';

export { etatNotifications, type EtatNotifications, type Environnement };

async function inscription(): Promise<ServiceWorkerRegistration> {
  const delai = new Promise<never>((_, rejet) => setTimeout(() => rejet(new Error('Le service de l’application n’est pas prêt. Recharge la page.')), 8000));
  return Promise.race([navigator.serviceWorker.ready, delai]);
}

/** Lit l'environnement de l'appareil (sans rien demander). */
export async function lireEnvironnement(): Promise<Environnement> {
  const serviceWorker = 'serviceWorker' in navigator;
  const pushManager = typeof window !== 'undefined' && 'PushManager' in window;
  const notification = typeof Notification !== 'undefined';
  let abonne = false;
  if (serviceWorker && pushManager) {
    try {
      const reg = await inscription();
      abonne = (await reg.pushManager.getSubscription()) !== null;
    } catch { /* pas d'abonnement lisible */ }
  }
  return {
    userAgent: navigator.userAgent,
    installee: window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    serviceWorker, pushManager, notification,
    permission: notification ? Notification.permission : null,
    abonne,
  };
}

/** Endpoint de l'abonnement de cet appareil, s'il y en a un. */
export async function endpointActuel(): Promise<string | null> {
  const reg = await inscription();
  return (await reg.pushManager.getSubscription())?.endpoint ?? null;
}

/** Demande la permission (geste de la personne), s'abonne et l'enregistre sur le serveur. */
export async function activer(): Promise<EtatNotifications> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'refuse' : 'inactif';
  const reg = await inscription();
  const { clePublique } = await api.get<ReponseCleNotifications>('/api/notifications/cle');
  let abonnement = await reg.pushManager.getSubscription();
  if (!abonnement) abonnement = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleEnOctets(clePublique) });
  const json = abonnement.toJSON();
  const corps: CorpsAbonnementNotifications = {
    endpoint: abonnement.endpoint,
    keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' },
    appareil: nomAppareil(navigator.userAgent),
  };
  await api.post('/api/notifications/abonnements', corps);
  return 'actif';
}

/** Retire l'abonnement du serveur puis du navigateur. */
export async function desactiver(): Promise<void> {
  const reg = await inscription();
  const abonnement = await reg.pushManager.getSubscription();
  if (!abonnement) return;
  await api.supprimer('/api/notifications/abonnements', { corps: { endpoint: abonnement.endpoint } }).catch(() => undefined);
  await abonnement.unsubscribe();
}

/** Envoie une notification d'essai à cet appareil. */
export async function essayer(): Promise<ReponseEssaiNotifications> {
  const endpoint = await endpointActuel();
  return api.post<ReponseEssaiNotifications>('/api/notifications/essai', endpoint ? { endpoint } : {});
}
