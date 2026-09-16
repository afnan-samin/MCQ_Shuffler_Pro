/* MCQ Shuffler Pro — service worker
   Purpose (Phase 3 #11 — PWA/offline):
   - Network-first for navigations: try the network, fall back to the
     cache when offline, so the tool keeps working with no data cost.
   - Cache-first for same-origin GET assets (fonts, css, js) to cut
     repeat data usage, which matters on metered/mobile connections.
   - All user data stays in the browser (localStorage / file inputs) —
     nothing is cached in the network cache, so privacy is unaffected.
   Bump CACHE_VERSION to invalidate every cached response on deploy.
*/

const CACHE_VERSION = "v1";
const CACHE_NAME = "mcq-shuffler-cache";

/* Only cache safe, same-origin responses. Never cache file-blob URLs. */
const shouldCache = (req) =>
  req.method === "GET" &&
  new URL(req.url).origin === selfOrigin() &&
  !req.url.includes("blob:") &&
  !new URL(req.url).pathname.endsWith(".docx");

function selfOrigin() {
  return new URL(self.location.origin).origin;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => {
  if (self.clients && self.clients.claim) self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method === "GET") {
    // Navigations (HTML) — network first, cache as offline fallback.
    if (req.mode === "navigate") {
      event.respondWith(fetch(req).then((res) => cachePut(req, res)).catch(() => cacheGet(req).then((c) => c || new Response("Offline", { status: 503 }))));
      return;
    }
    // Ordinary same-origin assets — cache-first for speed/data savings.
    event.respondWith(cacheGet(req).then(
      (cached) => cached || fetch(req).then((res) => cachePut(req, res))
    ));
    return;
  }
  event.respondWith(fetch(req));
});

/* ---- tiny cache helpers over the Cache Storage API ---- */

async function cachePut(req, res) {
  try {
    if (res.status === 200 && shouldCache(req)) {
      const cache = await self.caches.open(CACHE_NAME + "-" + CACHE_VERSION);
      const body = await res.clone().blob();
      const cloned = new Response(body, { status: res.status, headers: res.headers });
      cloned.headers.set("Cache-Control", "no-store"); // SW cache, not HTTP cache
      await cache.put(req.url, cloned);
    }
  } catch {
    /* cache full / unsupported — skip silently, network response still used */
  }
  return res;
}

async function cacheGet(req) {
  try {
    const cache = await self.caches.open(CACHE_NAME + "-" + CACHE_VERSION);
    const res = await cache.match(req);
    return res ? new Response(await res.clone().blob(), { status: res.status, headers: res.headers }) : null;
  } catch {
    return null;
  }
}

/* Delete old cache versions on install/upgrade.
   This runs once per SW update to reclaim space for outdated schemas. */
self.addEventListener("install", async () => {
  try {
    const keys = await self.caches.keys();
    for (const key of keys) {
      if (typeof key === "string" && key.startsWith("mcq-shuffler-cache-") && key !== CACHE_NAME + "-" + CACHE_VERSION) {
        await self.caches.delete(key);
      }
    }
  } catch {
    /* best-effort */
  }
});
