// Notifications Web Push : types communs au serveur, au client et au service worker.

/** `GET /api/notifications/cle` : clé publique VAPID du serveur (base64url, 65 octets). */
export interface ReponseCleNotifications {
  clePublique: string;
}

/** `POST /api/notifications/abonnements` : forme de `PushSubscription.toJSON()`, plus un nom d'appareil lisible. */
export interface CorpsAbonnementNotifications {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  appareil?: string;
}

/** `DELETE /api/notifications/abonnements` */
export interface CorpsDesabonnementNotifications {
  endpoint: string;
}

/** `POST /api/notifications/essai` : `endpoint` limite l'essai à un seul appareil. */
export interface CorpsEssaiNotifications {
  endpoint?: string;
}

export interface ReponseEssaiNotifications {
  envoyes: number;
  echecs: number;
}

/**
 * Ce que contient la notification chiffrée : seulement un prénom, un titre et l'adresse de la séance.
 * Lue par le service worker.
 */
export interface ChargeNotification {
  titre: string;
  corps: string;
  /** Chemin dans Canapé (`/seances/<id>`). */
  url: string;
  /** Regroupe les notifications d'une même séance. */
  etiquette: string;
}
