"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BOTON_VOLVER } from "@/lib/estilos";

// Flecha "atrás" del encabezado. Replica el botón de retroceso del navegador:
// vuelve a la pantalla anterior del historial en lugar de ir a un destino fijo.
// Si no hay historial previo (el usuario llegó directo por URL, por deep-link o
// desde una PWA recién abierta) cae al destino `fallback` para no dejar un botón
// muerto. Reemplaza a los `<Link href="...">` y a la navegación por estado que
// hacían que "volver" regresara a un estado anterior de la misma pantalla.
export default function BotonVolver({
  destinoFijo,
  fallback = "/",
  className = BOTON_VOLVER,
  children = "←",
  ariaLabel = "Volver",
}: {
  destinoFijo?: string;
  fallback?: string;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const router = useRouter();

  const volver = () => {
    if (destinoFijo) {
      router.replace(destinoFijo);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  };

  return (
    <button type="button" onClick={volver} className={className} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
