const STATIC_CACHE = "static-v2";
const RUNTIME_CACHE = "runtime-v2";

const STATIC_ASSETS = ["/", "/index.php"];

// -------- Helpers --------

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // Successful? Update cache and return fresh
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline or server down → use cache
    const cached = await cache.match(request);
    return cached || Promise.reject(err);
  }
}

async function cacheFirstWithRuntimeCache(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Nothing cached and no network
    return Promise.reject(err);
  }
}

// -------- Lifecycle --------

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

// -------- Fetch logic --------

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Only mess with our own origin
  if (!isSameOrigin) return;

  const dest = request.destination;

  // 1) Navigation requests (address bar, refresh, internal links)
  if (request.mode === "navigate") {
    event.respondWith(
      // HTML navigation: network-first with cached offline fallback
      networkFirst(request, STATIC_CACHE).catch(async () => {
        // If even that fails, try cached shell directly
        const cache = await caches.open(STATIC_CACHE);
        return (
          (await cache.match("/")) ||
          (await cache.match("/index.html")) ||
          (await cache.match("/index.php")) ||
          Response.error()
        );
      }),
    );
    return;
  }

  // 2) JS & CSS → network-first (so users get new code immediately when online)
  if (dest === "script" || dest === "style") {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // 3) Everything else (images, fonts, etc.) → cache-first + dynamic caching
  event.respondWith(cacheFirstWithRuntimeCache(request, RUNTIME_CACHE));
});
