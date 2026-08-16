"use client";

// Se muestra mientras navigator.onLine sea false y desaparece solo al volver la
// red. Va arriba porque los banners inferiores taparían la NodoTabBar, y dentro
// de la PilaSuperior porque no es descartable: al durar lo que dure la caída,
// superponerse al contenido dejaba botones inalcanzables todo ese rato (#163).
import PilaSuperior, { ORDEN_CONEXION } from "@/components/PilaSuperior";
import { useConexion } from "@/hooks/useConexion";

export default function AvisoConexion() {
  const online = useConexion();

  if (online) return null;

  return (
    <PilaSuperior orden={ORDEN_CONEXION}>
      <div className="px-3 pt-3">
        <div
          role="status"
          aria-live="polite"
          className="mx-auto max-w-md rounded-xl border border-border bg-surface p-3 text-sm text-fg shadow-lg"
        >
          <span className="font-semibold text-warning">Sin conexión.</span>{" "}
          Los datos pueden estar desactualizados.
        </div>
      </div>
    </PilaSuperior>
  );
}
