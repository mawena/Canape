/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service worker de Canapé : met en cache **uniquement** l'enveloppe de l'application (fichiers construits et statiques,
// page de repli). Jamais /api, /media ni /ws : les films et les données ne sont jamais stockés ici.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `canape-enveloppe-${version}`;
const ENVELOPPE = [...build, ...files.filter((f) => !f.startsWith('/demarrage/'))];
const ENVELOPPE_SET = new Set(ENVELOPPE);
const REPLI = '/index.html';

sw.addEventListener('install', (event) => {
  // Pas de skipWaiting automatique : la nouvelle version attend que l'utilisateur recharge (toast « Recharger »).
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(ENVELOPPE);
      try { await cache.add(new Request(REPLI, { cache: 'reload' })); } catch { /* le repli sera pris au premier passage réseau */ }
    }),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c.startsWith('canape-enveloppe-') && c !== CACHE).map((c) => caches.delete(c))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void sw.skipWaiting();
});

function exclu(url: URL): boolean {
  return /^\/(api|media|ws)(\/|$)/.test(url.pathname);
}

sw.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== location.origin || exclu(url)) return;

  // Fichiers de l'enveloppe : le cache d'abord (ils sont versionnés par leur nom ou par `version`).
  if (ENVELOPPE_SET.has(url.pathname)) {
    event.respondWith(caches.match(requete).then((c) => c ?? fetch(requete)));
    return;
  }
  // Navigation : le réseau d'abord, la page de repli (application monopage) si le réseau manque.
  if (requete.mode === 'navigate') {
    event.respondWith(
      fetch(requete).catch(async () => (await caches.match(REPLI)) ?? new Response('Vous êtes hors ligne.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })),
    );
  }
});

// ---- Notifications Web Push ----
// La charge arrive chiffrée du service de notifications du navigateur : prénom, titre et adresse de la séance seulement.
interface ChargePush { titre?: string; corps?: string; url?: string; etiquette?: string }

sw.addEventListener('push', (event) => {
  let charge: ChargePush = {};
  try { charge = (event.data?.json() ?? {}) as ChargePush; } catch { /* charge illisible : notification générique */ }
  event.waitUntil(
    sw.registration.showNotification(charge.titre ?? 'Canapé', {
      body: charge.corps ?? '',
      icon: '/icones/icone-192.png',
      badge: '/icones/icone-192.png',
      ...(charge.etiquette ? { tag: charge.etiquette } : {}),
      data: { url: typeof charge.url === 'string' && /^\/(?!\/)/.test(charge.url) ? charge.url : '/' },
    }),
  );
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string } | null)?.url ?? '/', sw.location.origin);
  event.waitUntil((async () => {
    const fenetres = (await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })) as WindowClient[];
    // Déjà sur la bonne page : on la met au premier plan.
    const identique = fenetres.find((f) => new URL(f.url).pathname === url.pathname);
    if (identique) { await identique.focus(); return; }
    // Un onglet Canapé qui n'est pas dans une salle (la salle en cours n'est jamais quittée) : il prend la page.
    const libre = fenetres.find((f) => !/^\/seances\/[a-z2-7]{12}\/?$/.test(new URL(f.url).pathname));
    if (libre) {
      try { await (await libre.focus()).navigate(url.href); return; } catch { /* repli : nouvelle fenêtre */ }
    }
    await sw.clients.openWindow(url.href);
  })());
});
