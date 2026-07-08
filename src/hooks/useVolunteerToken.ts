"use client";

import { useSyncExternalStore } from "react";
import { getVolunteerToken } from "@/lib/supabase";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // El token vive en localStorage; el evento 'storage' cubre cambios hechos
  // desde otras pestañas. Basta para lecturas de montaje.
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

// Token de voluntario expuesto como store externo (useSyncExternalStore). Es la
// forma correcta de leer un valor cliente-only (localStorage) sin hacer setState
// dentro de un efecto: el snapshot de servidor es null (SSR-safe) y el de cliente
// lee localStorage, sin desajuste de hidratación.
export function useVolunteerToken(): string | null {
  return useSyncExternalStore(subscribe, getVolunteerToken, () => null);
}
