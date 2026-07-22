"use client";
// RegistrarSW (issue #42): además de registrar el SW, detecta cuando hay una
// versión nueva en waiting (el SW ya no hace skipWaiting automático) y muestra
// un banner para actualizar de forma controlada. "Después" deja el update en
// waiting: se aplica al cerrar las pestañas o en la próxima sesión.

import { useEffect, useRef, useState } from "react";

export default function RegistrarSW() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const recargado = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      // Guard de una sola recarga (mismo espíritu que RecargarEnChunkError).
      if (recargado.current) return;
      recargado.current = true;
      window.location.reload();
    };

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Update que quedó pendiente de una visita anterior.
          if (reg.waiting) setWaiting(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const nuevo = reg.installing;
            if (!nuevo) return;
            nuevo.addEventListener("statechange", () => {
              // Sin controller es el primer install, no un update: no avisar.
              if (nuevo.state === "installed" && navigator.serviceWorker.controller) {
                setWaiting(nuevo);
              }
            });
          });
        })
        .catch(() => {});
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad);
    }
    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-xl border border-border bg-surface p-3 text-sm text-fg shadow-lg">
      <p className="font-semibold">Nueva versión disponible</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white dark:text-black"
        >
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => setWaiting(null)}
          className="rounded-lg border border-border px-3 py-2 text-sm font-semibold"
        >
          Después
        </button>
      </div>
    </div>
  );
}
