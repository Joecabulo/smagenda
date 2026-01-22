const CACHE_NAME = 'smagenda-shell-v2'

const CORE_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.png', '/pwa-192.png', '/pwa-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      await Promise.allSettled(CORE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
          return res
        } catch {
          const cached = (await caches.match('/index.html')) || (await caches.match('/'))
          return cached || Response.error()
        }
      })()
    )
    return
  }

  event.respondWith(
    caches.match(req).then((cached) =>
      cached
        ? cached
        : fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
            return res
          })
    )
  )
})
