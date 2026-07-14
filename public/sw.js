// v4 (issue #39): el precache incluye los assets del build. El HTML del shell
// referencia sus chunks /_next/static/* con hash de contenido; se extraen del
// propio HTML precacheado y se agregan al cache en el install, para que la
// hidratación funcione offline en frío. /dar sale del shell (modelo viejo).
const CACHE = "panasayudan-v4";
const SHELL = ["/", "/buscar", "/voluntarios", "/manifest.json"];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const assets = new Set();
  for (const ruta of SHELL) {
    const res = await cache.match(ruta);
    if (!res || !(res.headers.get("content-type") || "").includes("text/html")) continue;
    const html = await res.text();
    for (const m of html.matchAll(/["'](\/_next\/static\/[^"']+)["']/g)) assets.add(m[1]);
  }
  // Un asset que falle no debe brickear el install: se cachea en la primera visita.
  await Promise.allSettled([...assets].map((url) => cache.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function esExterno(url) {
  return (
    url.includes("supabase.co") ||
    url.includes("googleapis.com") ||
    url.includes("gstatic.com") ||
    url.includes("ip-api.com") ||
    url.includes("wa.me")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (esExterno(request.url)) return;

  // Network-first para navegación; fallback a cache si no hay red.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copia));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Cache-first para estáticos.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copia));
          }
          return res;
        })
    )
  );
});
