// Service worker for the installable app (PWA).
//
// Deliberately minimal and privacy-safe: this app shows patient records and
// staff/parent accounts may share a phone, so NOTHING dynamic is cached —
// no API responses, no pages, no uploads. Only content-hashed build assets
// and the app icons are cached (they never contain user data), and the
// offline page is shown when a page load fails with no network.

const CACHE = 'aetherdev-static-v1'
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Page loads: always the network (fresh, auth-checked data); offline page
  // only when the network is unreachable.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  // Immutable, content-hashed build output and icons: cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return res
      })),
    )
  }
  // Everything else (/api/*, /uploads, pages' data) goes straight to the
  // network untouched.
})
