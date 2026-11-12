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
