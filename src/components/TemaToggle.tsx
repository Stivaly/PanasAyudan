"use client";

import { useState } from "react";
import { useTema } from "@/hooks/useTema";
import { safeGetItem, safeSetItem } from "@/lib/safeStorage";

const AVISO_CLARO_KEY = "pa_light_theme_notice_dismissed";

export default function TemaToggle() {
  const { tema, setTema } = useTema();
  const [mostrarAviso, setMostrarAviso] = useState(false);
  const claro = tema === "light";

  const cambiar = () => {
    if (claro) {
      setTema("dark");
      return;
    }

    setTema("light");
    if (safeGetItem(AVISO_CLARO_KEY) !== "1") {
      setMostrarAviso(true);
    }
  };

  const descartarAviso = () => {
    safeSetItem(AVISO_CLARO_KEY, "1");
    setMostrarAviso(false);
  };

  return (
    <>
      {/* Va en flujo dentro de la cabecera, no flotando. Antes era un botón
          fijo centrado arriba, o sea exactamente encima del <h1> de cada
          pantalla: tapaba el título en nueve de ellas (issue #153). */}
      <button
        type="button"
        onClick={cambiar}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl"
        aria-label={claro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
        title={claro ? "Modo oscuro" : "Modo claro"}
      >
        <span aria-hidden="true">{claro ? "☾" : "☀"}</span>
      </button>

      {mostrarAviso && (
        <div className="fixed inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] z-40 mx-auto max-w-sm rounded-xl border border-border bg-surface p-3 text-sm shadow-lg">
          <p className="font-semibold text-fg">El modo claro consume más batería</p>
          <p className="mt-1 text-muted">Especialmente en pantallas OLED.</p>
          <button
            type="button"
            onClick={descartarAviso}
            className="mt-3 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-fg"
          >
            Entendido
          </button>
        </div>
      )}
    </>
  );
}
