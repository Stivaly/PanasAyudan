"use client";

// estado de conexión vía navigator.onLine.
// useSyncExternalStore evita hydration mismatch (snapshot de servidor: online).
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);

  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

export function useConexion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
