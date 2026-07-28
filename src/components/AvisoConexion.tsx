"use client";

// Se muestra mientras navigator.onLine sea false y desaparece solo al
// volver la red. Va arriba (debajo del botón de tema) porque los banners
// inferiores son descartables y este taparía el NodoTabBar.
import { useConexion } from "@/hooks/useConexion";

export default function AvisoConexion() {
  const online = useConexion();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] z-40 mx-auto max-w-md rounded-xl border border-border bg-surface p-3 text-sm text-fg shadow-lg"
    >
      <span className="font-semibold text-warning">Sin conexión.</span>{" "}
      Los datos pueden estar desactualizados.
    </div>
  );
}
