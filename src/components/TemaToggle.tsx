"use client";

import { useState } from "react";
import { useTema } from "@/hooks/useTema";

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
    if (localStorage.getItem(AVISO_CLARO_KEY) !== "1") {
      setMostrarAviso(true);
    }
  };

  const descartarAviso = () => {
    localStorage.setItem(AVISO_CLARO_KEY, "1");
    setMostrarAviso(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={cambiar}
        className="fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface/95 text-xl shadow-lg backdrop-blur"
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
