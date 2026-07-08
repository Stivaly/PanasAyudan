"use client";

import { useEffect, useState } from "react";
import { getEstadisticasImpacto } from "@/lib/api";
import { EstadisticasImpacto } from "@/lib/types";

const CINCO_MINUTOS_MS = 5 * 60 * 1000;

// Sección de impacto agregado. Carga sin bloquear el resto de la home y se
// refresca cada 5 minutos. Si falla o aún no carga, no renderiza nada.
export default function SeccionImpacto() {
  const [stats, setStats] = useState<EstadisticasImpacto | null>(null);

  useEffect(() => {
    let activo = true;
    const cargar = () => {
      getEstadisticasImpacto()
        .then((data) => {
          if (activo) setStats(data);
        })
        .catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, CINCO_MINUTOS_MS);
    return () => {
      activo = false;
      clearInterval(id);
    };
  }, []);

  if (!stats) return null;

  const cards = [
    { valor: stats.total_qty_coordinada, etiqueta: "insumos entregados" },
    { valor: stats.total_recogidas_completadas, etiqueta: "entregas completadas" },
    { valor: stats.lugares_activos, etiqueta: "puntos activos" },
    { valor: stats.total_aportes_activos, etiqueta: "solicitudes activas" },
  ];

  return (
    <section className="mx-auto mt-6 w-full max-w-sm">
      <h2 className="mb-3 text-center text-sm font-semibold text-muted">
        Lo que hemos logrado juntos
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <div
            key={c.etiqueta}
            className="card flex min-h-24 flex-col items-center justify-center bg-surface/80 text-center"
          >
            <p className="text-2xl font-bold text-white">{c.valor}</p>
            <p className="mt-1 text-xs text-muted">{c.etiqueta}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
