"use client";

import { useEffect } from "react";

// Tras un deploy nuevo, los chunks cambian de hash. Una pestaña abierta desde
// antes del deploy puede pedir un chunk viejo que ya no existe y lanzar
// ChunkLoadError. Aquí lo detectamos y forzamos UN solo reload para bajar el
// build nuevo.
//
// Guard por timestamp: si ya recargamos hace menos de VENTANA_MS, no volvemos a
// recargar (evita bucle si el error persiste por otra causa). Pasada esa
// ventana, un nuevo error sí puede recargar (p. ej. el siguiente deploy).
const KEY = "chunk_reload_ts";
const VENTANA_MS = 10_000;

function esChunkError(valor: unknown): boolean {
  if (!valor) return false;
  const nombre = (valor as { name?: unknown }).name;
  const mensaje = (valor as { message?: unknown }).message;
  const texto = `${typeof nombre === "string" ? nombre : ""} ${
    typeof mensaje === "string" ? mensaje : ""
  }`;
  return /ChunkLoadError|Loading chunk [\d]+ failed|Failed to load chunk|importing a module script failed/i.test(
    texto
  );
}

export default function RecargarEnChunkError() {
  useEffect(() => {
    const recargarUnaVez = () => {
      const ultimo = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - ultimo < VENTANA_MS) return; // recién intentamos: no entrar en bucle
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      if (esChunkError(e.error) || esChunkError(e)) recargarUnaVez();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (esChunkError(e.reason)) recargarUnaVez();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
