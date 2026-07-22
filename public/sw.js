// v9 (issue #42): sin skipWaiting automático — el SW nuevo queda en waiting y
// el cliente (RegistrarSW) avisa "nueva versión disponible"; se activa solo
// cuando el usuario acepta (mensaje SKIP_WAITING) o al cerrar las pestañas.
// v8 (issue #41): página /offline dedicada como fallback de navegación, en vez
// de servir la home para cualquier ruta no cacheada.
// v7 (issue #40): el shell se precachea por URL (Promise.allSettled), no con
// addAll: un 404 en una sola ruta (renombrada, deploy parcial) ya no impide
// que el SW instale. v6 (issue #38): los iconos maskable se separan de los
// `any` para que Android no los recorte al aplicar la máscara; ambos se
// precachean junto al shell. v5 (issue #24): vista pública de nodos. /buscar
// ya es parte del shell; las fichas /nodo/[id] son dinámicas y las cachea el
// handler de navegación (network-first) al visitarlas, habilitando el
// compartir por SMS offline desde datos ya renderizados.
const CACHE = "panasayudan-v9";
const SHELL = [
  "/",
  "/offline",
  "/buscar",
  "/dar",
  "/voluntarios",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
];

async function precache() {
  const cache = await caches.open(CACHE);
  // Por URL, no addAll: un 404 (ruta renombrada, deploy parcial) no debe
  // impedir la instalación del SW (issue #40).
  await Promise.allSettled(SHELL.map((url) => cache.add(url)));
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
  event.waitUntil(precache());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
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
        .catch(() =>
          caches
            .match(request)
            // "/" como último recurso: el precache per-URL tolera que /offline falle.
            .then((r) => r || caches.match("/offline").then((o) => o || caches.match("/")))
        )
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
