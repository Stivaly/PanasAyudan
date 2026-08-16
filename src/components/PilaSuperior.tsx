"use client";

// Pila superior (issue #163): el espejo de PilaInferior para lo que se fija al
// borde de arriba.
//
// Dos problemas resuelve:
//
// 1. El aviso de "sin conexión" se superponía al contenido. Ninguna página
//    compensaba su alto, y como no es descartable —dura lo que dure la caída de
//    red— tapaba lo que hubiera debajo todo ese rato. Medido en /nodo: cubría el
//    87% de los botones "Cancelar" y "Enviado" de un envío.
//
// 2. Ese aviso y el de modo claro compartían coordenada exacta, así que si
//    coincidían se pisaban.
//
// Los hijos se apilan en columna y la altura total se publica como padding-top
// del <body> y como --pila-superior, que las cabeceras sticky usan para pegarse
// por debajo de la pila en vez de por detrás.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const ID = "pila-superior";

// Orden dentro de la pila: menor va arriba. La conexión manda sobre el resto
// porque condiciona si lo que se ve en pantalla sigue siendo cierto.
export const ORDEN_CONEXION = 0;
export const ORDEN_AVISO = 10;

function obtenerContenedor(): HTMLElement {
  const existente = document.getElementById(ID);
  if (existente) return existente;

  const el = document.createElement("div");
  el.id = ID;
  // pointer-events-none para que los huecos entre avisos no bloqueen el
  // contenido de abajo; cada hijo reactiva los eventos sobre su propia caja.
  el.className =
    "pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col " +
    "pt-[env(safe-area-inset-top)]";
  document.body.appendChild(el);

  const observer = new ResizeObserver(() => {
    const alto = el.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--pila-superior", `${alto}px`);
    document.body.style.paddingTop = alto > 0 ? `${alto}px` : "";
  });
  observer.observe(el);

  return el;
}

interface Props {
  orden?: number;
  children: React.ReactNode;
}

export default function PilaSuperior({ orden = ORDEN_AVISO, children }: Props) {
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
