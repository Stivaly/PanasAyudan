"use client";

import { useState } from "react";
import { CLASE_BOTON_ICONO, IconoLuna, IconoSol } from "@/components/Iconos";
import PilaSuperior, { ORDEN_AVISO } from "@/components/PilaSuperior";
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
        className={CLASE_BOTON_ICONO}
        aria-label={claro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
        title={claro ? "Modo oscuro" : "Modo claro"}
      >
        {claro ? <IconoLuna /> : <IconoSol />}
      </button>

      {/* En la pila superior, no suelto: compartía coordenada exacta con el
          aviso de sin conexión, así que si coincidían se pisaban. Además su
          posición seguía calculada respecto al botón de tema flotante, que ya
          no existe (#163). */}
      {mostrarAviso && (
        <PilaSuperior orden={ORDEN_AVISO}>
          <div className="px-3 pt-3">
            <div className="mx-auto max-w-sm rounded-xl border border-border bg-surface p-3 text-sm shadow-lg">
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
          </div>
        </PilaSuperior>
      )}
    </>
  );
}
