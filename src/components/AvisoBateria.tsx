"use client";

import { useEffect, useRef, useState } from "react";
import { useTema } from "@/hooks/useTema";

type BatteryManagerLike = EventTarget & {
  level: number;
  addEventListener: (type: "levelchange", listener: () => void) => void;
  removeEventListener: (type: "levelchange", listener: () => void) => void;
};

type NavigatorConBateria = Navigator & {
  getBattery?: () => Promise<BatteryManagerLike>;
};

type Banner = {
  nivel: number;
  umbral: 20 | 10;
};

function umbralParaNivel(level: number): 20 | 10 | null {
  if (level <= 0.1) return 10;
  if (level <= 0.2) return 20;
  return null;
}

export default function AvisoBateria() {
  const { tema, setTema } = useTema();
  const [banner, setBanner] = useState<Banner | null>(null);
  const ultimoUmbral = useRef<20 | 10 | null>(null);

  useEffect(() => {
    const nav = navigator as NavigatorConBateria;
    if (!nav.getBattery) return;

    let activo = true;
    let bateria: BatteryManagerLike | null = null;

    const revisar = () => {
      if (!bateria || tema === "dark") {
        setBanner(null);
        return;
      }

      const umbral = umbralParaNivel(bateria.level);
      if (!umbral) {
        ultimoUmbral.current = null;
        setBanner(null);
        return;
      }

      if (ultimoUmbral.current === umbral) return;
      ultimoUmbral.current = umbral;
      setBanner({ nivel: Math.round(bateria.level * 100), umbral });
    };

    nav.getBattery().then((manager) => {
      if (!activo) return;
      bateria = manager;
      revisar();
      manager.addEventListener("levelchange", revisar);
    });

    return () => {
      activo = false;
      bateria?.removeEventListener("levelchange", revisar);
    };
  }, [tema]);

  if (tema === "dark" || !banner) return null;

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-xl border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-950 shadow-lg dark:bg-amber-950 dark:text-amber-50">
      <p className="font-semibold">
        Batería al {banner.nivel}% — cambia a modo oscuro para no gastar más
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setTema("dark")}
          className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white dark:bg-amber-400 dark:text-black"
        >
          Cambiar ahora
        </button>
        <button
          type="button"
          onClick={() => setBanner(null)}
          className="rounded-lg border border-amber-700/40 px-3 py-2 text-sm font-semibold"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
