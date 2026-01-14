const CACHE_NAME = 'prospector-shell-v1'

function getScopePath() {
  try {
    const u = new URL(self.registration.scope)
    return u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`
  } catch {
    return '/'
  }
}

const SCOPE = getScopePath()

function inScope(path) {
  const p = String(path || '')
  if (!p) return SCOPE
  if (p.startsWith('/')) return `${SCOPE}${p.slice(1)}`
  return `${SCOPE}${p}`
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([SCOPE, inScope('index.html'), inScope('manifest.webmanifest'), inScope('icon.svg')]))
      .then(() => self.skipWaiting())
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
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
          return res
        })
        .catch(() => caches.match(SCOPE))
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
