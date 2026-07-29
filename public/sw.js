// Eternal CRM service worker (Slice 14, DECISIONS 014).
//
// The cache is a SPEED LAYER, never a source of truth — iOS evicts it after
// disuse and that must never matter. API traffic (/rest, /functions,
// /storage, /auth) is never cached. Photo-upload queueing does NOT live here
// (no Background Sync API); the app queues in IndexedDB and flushes on
// foreground.

const CACHE = 'eternal-static-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  // Never touch API or cross-origin traffic.
  if (url.origin !== self.location.origin) return
  if (/^\/(rest|functions|storage|auth|realtime)\//.test(url.pathname)) return

  if (event.request.mode === 'navigate') {
    // Network-first for navigations; cached shell only as offline fallback.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put('/', copy))
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Hashed static assets: cache-first (immutable filenames).
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ??
          fetch(event.request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(event.request, copy))
            return res
          }),
      ),
    )
  }
})

self.addEventListener('push', (event) => {
  let payload = { title: 'Eternal CRM', body: 'New activity', url: '/' }
  try {
    payload = { ...payload, ...event.data.json() }
  } catch {
    /* default payload */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
