"use client";

// Cabecera compartida de las pantallas con título (issue #153).
//
// Antes cada pantalla armaba su propia fila "volver + título + salir" y el botón
// de tema flotaba fijo y centrado arriba, o sea justo encima de esos títulos: se
// leía "Panel de pu…to", "Panel supe…dmin", "Puntos de a…a". Al meter el botón
// dentro de la fila el choque deja de ser posible por construcción, en vez de
// depender de que ningún título crezca.
//
// Va sticky para que el tema siga a mano al hacer scroll, que era lo único bueno
// de tenerlo fijo. Los márgenes negativos la sacan del padding del <main> para
// que su fondo llegue de borde a borde y el contenido no asome por los lados al
// pasar por debajo.

import type { ReactNode } from "react";
import TemaToggle from "@/components/TemaToggle";

interface Props {
  // El control de volver ya renderizado (BotonVolver o un Link), porque cada
  // pantalla decide su destino y su fallback.
  volver?: ReactNode;
  titulo: string;
  subtitulo?: string;
  // Acciones propias de la pantalla, p. ej. "Salir".
  acciones?: ReactNode;
}

export default function CabeceraPagina({ volver, titulo, subtitulo, acciones }: Props) {
  return (
    <div className="sticky top-0 z-30 -mx-4 -mt-4 flex items-center gap-2 border-b border-border bg-bg px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      {volver}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold">{titulo}</h1>
        {subtitulo && <p className="truncate text-xs text-muted">{subtitulo}</p>}
      </div>
      {acciones}
      <TemaToggle />
    </div>
  );
}
