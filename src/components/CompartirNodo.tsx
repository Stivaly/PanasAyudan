"use client";

// Compartir un nodo (issue #24). Dos canales sin backend:
//  - WhatsApp: wa.me/?text= con nombre + dirección + URL (mismo patrón que el resto
//    de la app, sin API).
//  - SMS: sms:?body= construido SOLO con datos ya renderizados/cacheados (nombre,
//    categorías disponibles y dirección). Cero requests al tocarlo: funciona offline
//    con la app cacheada (habilitado por la instalación PWA de #31).

import { useMemo } from "react";

interface Props {
  nombre: string;
  direccion: string;
  // Nombres de las categorías disponibles ya visibles en pantalla (no se piden aquí).
  categorias: string[];
}

export default function CompartirNodo({ nombre, direccion, categorias }: Props) {
  const whatsappHref = useMemo(() => {
    const url = typeof window === "undefined" ? "" : window.location.href;
    const texto = `Punto de ayuda: ${nombre} - ${direccion}${url ? ` - PanasAyudan: ${url}` : ""}`;
    return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  }, [nombre, direccion]);

  const smsHref = useMemo(() => {
    const cats = categorias.length > 0 ? `\nDisponible: ${categorias.join(", ")}` : "";
    const cuerpo = `Punto de ayuda: ${nombre}${cats}\nDirección: ${direccion}`;
    return `sms:?body=${encodeURIComponent(cuerpo)}`;
  }, [nombre, direccion, categorias]);

  return (
    <div className="flex flex-col gap-2">
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost w-full"
      >
        Compartir por WhatsApp
      </a>
      <a href={smsHref} className="btn-ghost w-full">
        Compartir por SMS
      </a>
    </div>
  );
}
