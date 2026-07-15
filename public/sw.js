// v3 (issue #24): vista pública de nodos. /buscar ya es parte del shell; las fichas
// /nodo/[id] son dinámicas y las cachea el handler de navegación (network-first) al
// visitarlas, habilitando el compartir por SMS offline desde datos ya renderizados.
const CACHE = "panasayudan-v4";
const SHELL = ["/", "/buscar", "/dar", "/voluntarios", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
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
