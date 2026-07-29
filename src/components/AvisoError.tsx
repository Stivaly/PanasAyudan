"use client";

// Mensaje de error de formulario (issue #61).
//
// Dos problemas que resuelve, y que el <p> suelto que había antes no cubría:
//   * un lector de pantalla no anunciaba nada al fallar el envío, porque el
//     texto aparecía sin `role="alert"`;
//   * en formularios largos (registro de voluntario, alta de nodo) el error se
//     renderiza fuera de la pantalla y parecía que el botón no hacía nada.
//
// `tabIndex={-1}` permite enfocarlo por código sin meterlo en el orden de
// tabulación. El foco, además de mover el lector de pantalla, arrastra la
// vista en navegadores que ignoran scrollIntoView dentro de un contenedor.

import { useEffect, useRef } from "react";

interface Props {
  mensaje: string | null;
  // Errores de CAMPO (los que salen en el onBlur de un input) deben pasar
  // enfocar={false}: mover el foco mientras el usuario tabula al siguiente
  // campo se lo robaría, que es peor que el problema original. Con role="alert"
  // el lector de pantalla igual los anuncia.
  enfocar?: boolean;
  className?: string;
}

export default function AvisoError({ mensaje, enfocar = true, className }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!mensaje || !enfocar) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ref.current?.focus({ preventScroll: true });
  }, [mensaje, enfocar]);

  if (!mensaje) return null;

  return (
    <p
      ref={ref}
      role="alert"
      tabIndex={enfocar ? -1 : undefined}
      className={className ?? "text-sm font-semibold text-danger"}
    >
      {mensaje}
    </p>
  );
}
