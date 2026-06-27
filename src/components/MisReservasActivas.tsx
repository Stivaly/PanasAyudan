"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRecogidasDeRecogedor } from "@/lib/api";
import { RecogidaConDetalle } from "@/lib/types";
import Countdown from "@/components/Countdown";

const TOKEN_KEY = "panas_recogedor_token";

// Card colapsable con las reservas pendientes del dispositivo actual.
// Es adicional a la lista pública de /buscar; se oculta por completo si no hay
// token local o no hay reservas pendientes.
export default function MisReservasActivas() {
  const [pendientes, setPendientes] = useState<RecogidaConDetalle[]>([]);
  const [abierto, setAbierto] = useState(true);

  useEffect(() => {
    const token = typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    getRecogidasDeRecogedor(token)
      .then((data) => setPendientes(data.filter((r) => r.status === "pendiente")))
      .catch(() => {});
  }, []);

  if (pendientes.length === 0) return null;

  return (
    <section className="card flex flex-col gap-3 border-accent">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center justify-between gap-3 text-left"
      >
        <h2 className="text-sm font-bold uppercase tracking-wide text-accent">
          Mis reservas activas
        </h2>
        <span className="text-sm text-muted">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <div className="flex flex-col gap-3">
          {pendientes.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-xl bg-bg p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.aporte_item?.descripcion ?? "Insumo"}</p>
                  <p className="text-xs text-muted">
                    {r.aporte_item?.aporte?.location?.place_name ?? "Lugar"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold">
                  <Countdown hasta={r.reserved_until} vencidoTexto="Liberada" />
                </span>
              </div>
              <Link href="/mis-recogidas" className="btn-ghost w-full text-sm">
                Ver detalles
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
