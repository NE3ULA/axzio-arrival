/* AXZIO | ARRIVAL — offline shell cache.
 *
 * Strategy (V0.2.1 — fixes returning visitors being stuck on V0.1):
 *  - App shell (navigations, index.html): NETWORK-FIRST. An online
 *    visitor always receives the current deploy; the cache is only an
 *    offline fallback. A release can never be masked by a stale shell.
 *  - Static assets (hashed JS/CSS, icons, manifest): cache-first —
 *    their URLs are content-addressed, so a cached copy is never stale.
 *  - Cross-origin requests (the beta backend) are never intercepted.
 * Bump CACHE_VERSION whenever the shell strategy changes; activation
 * purges every older cache. */
const CACHE_VERSION = "arrival-v11";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  const isShell = request.mode === "navigate" || new URL(request.url).pathname.endsWith("/index.html");
  if (isShell) {
    // Network-first: fresh deploy wins; fall back to cache when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
    )
  );
});
