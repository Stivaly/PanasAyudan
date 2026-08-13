"use client";

// Pila inferior (issue #154): contenedor único para todo lo que se fija al
// borde de abajo de la pantalla.
//
// Antes cada banner era su propio `fixed bottom-0`, así que todos aterrizaban
// en la misma coordenada: se tapaban entre sí y tapaban la NodoTabBar completa
// (z-40 contra z-20), dejando al admin sin navegación. Y ninguno reservaba su
// espacio, así que mientras un banner estuviera abierto el final de cualquier
// página quedaba inalcanzable.
//
// Aquí se resuelven las dos cosas: los hijos se apilan en columna (nadie tapa a
// nadie) y la altura total de la pila se publica como padding-bottom del <body>,
// de modo que toda página puede hacer scroll hasta el final con la pila abierta.
//
// El contenedor se crea al vuelo en el <body> en vez de montarse en el layout:
// así cada overlay se sigue usando suelto, sin que las páginas tengan que saber
// que existe una pila.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const ID = "pila-inferior";

// Orden dentro de la pila: menor va arriba. La barra de navegación siempre va
// al fondo, pegada al borde, porque es el elemento permanente y alcanzable.
export const ORDEN_AVISO = 0;
export const ORDEN_INSTALAR = 10;
export const ORDEN_TABBAR = 100;

function obtenerContenedor(): HTMLElement {
  const existente = document.getElementById(ID);
  if (existente) return existente;

  const el = document.createElement("div");
  el.id = ID;
  // pointer-events-none para que los huecos entre banners no bloqueen el
  // contenido de abajo; cada hijo reactiva los eventos sobre su propia caja.
  el.className =
    "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col " +
    "pb-[env(safe-area-inset-bottom)]";
  document.body.appendChild(el);

  // La altura de la pila cambia sola: un banner aparece, otro se descarta, el
  // texto reflowea al girar el teléfono. Un observer la mantiene sincronizada
  // con el espacio que el body reserva.
  const observer = new ResizeObserver(() => {
    const alto = el.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--pila-inferior", `${alto}px`);
    document.body.style.paddingBottom = alto > 0 ? `${alto}px` : "";
  });
  observer.observe(el);

  return el;
}

interface Props {
  orden?: number;
  children: React.ReactNode;
}

export default function PilaInferior({ orden = ORDEN_AVISO, children }: Props) {
  const [contenedor, setContenedor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // El contenedor es DOM del cliente: no existe hasta after-mount, y por eso
    // el primer render devuelve null en vez de portalear.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContenedor(obtenerContenedor());
  }, []);

  if (!contenedor) return null;

  return createPortal(
    <div className="pointer-events-auto" style={{ order: orden }}>
      {children}
    </div>,
    contenedor
  );
}
