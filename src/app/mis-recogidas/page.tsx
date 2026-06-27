"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getRecogidasDeRecogedor } from "@/lib/api";
import { RecogidaConDetalle } from "@/lib/types";
import Countdown from "@/components/Countdown";

const TOKEN_KEY = "panas_recogedor_token";

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MisRecogidas() {
  const [token, setToken] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [recogidas, setRecogidas] = useState<RecogidaConDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
    setToken(t);
    setVerificando(false);
  }, []);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getRecogidasDeRecogedor(token);
      setRecogidas(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar tus recogidas.");
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setCargando(false);
      return;
    }
    void cargar();

    // Realtime: cambios en recogidas de este dispositivo (por token local).
    const canal = supabase
      .channel(`recogidas_${token}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recogidas",
          filter: `recogedor_token=eq.${token}`,
        },
        () => void cargar()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [token, cargar]);

  const header = (
    <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <Link href="/buscar" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
        ←
      </Link>
      <h1 className="text-lg font-bold">Mis recogidas</h1>
    </div>
  );

  if (verificando) {
    return <main className="grid min-h-dvh place-items-center text-muted">Cargando...</main>;
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {header}
        <div className="card text-center">
          <p className="text-muted">No tienes recogidas en este dispositivo.</p>
          <Link href="/buscar" className="btn-primary mt-3 inline-block">
            Buscar insumos
          </Link>
        </div>
      </main>
    );
  }

  const pendientes = recogidas.filter((r) => r.status === "pendiente");
  const historicas = recogidas.filter((r) => r.status !== "pendiente");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {header}

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {cargando && <p className="text-muted">Cargando tus recogidas...</p>}

      {!cargando && recogidas.length === 0 && (
        <div className="card text-center">
          <p className="text-muted">No tienes recogidas en este dispositivo.</p>
          <Link href="/buscar" className="btn-primary mt-3 inline-block">
            Buscar insumos
          </Link>
        </div>
      )}

      {pendientes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-accent">Pendientes</h2>
          {pendientes.map((r) => {
            const lugar = r.aporte_item?.aporte?.location;
            return (
            <div key={r.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.aporte_item?.descripcion ?? "Insumo"}</p>
                  <p className="text-xs text-muted">{lugar?.place_name ?? "Lugar"}</p>
                  {lugar?.estado && <p className="text-xs text-muted">{lugar.estado}</p>}
                  {lugar?.descripcion_libre && (
                    <p className="mt-1 text-sm">{lugar.descripcion_libre}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold text-muted">
                  {r.qty_a_buscar} {r.qty_a_buscar === 1 ? "objeto" : "objetos"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">Tiempo para ir a buscar</span>
                <span className="font-bold">
                  <Countdown hasta={r.reserved_until} vencidoTexto="Liberada" />
                </span>
              </div>
            </div>
            );
          })}
        </section>
      )}

      {historicas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-accent">
            Completadas / Confirmadas
          </h2>
          {historicas.map((r) => {
            const cancelada = r.status === "cancelada";
            const lugar = r.aporte_item?.aporte?.location;
            return (
              <div
                key={r.id}
                className={`card flex flex-col gap-2 ${cancelada ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${cancelada ? "text-muted" : ""}`}>
                      {r.aporte_item?.descripcion ?? "Insumo"}
                    </p>
                    <p className="text-xs text-muted">{lugar?.place_name ?? "Lugar"}</p>
                    {lugar?.estado && <p className="text-xs text-muted">{lugar.estado}</p>}
                    {lugar?.descripcion_libre && (
                      <p className="mt-1 text-sm">{lugar.descripcion_libre}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-muted">
                    {r.qty_a_buscar} {r.qty_a_buscar === 1 ? "objeto" : "objetos"}
                  </span>
                </div>

                {cancelada ? (
                  <p className="text-sm font-semibold text-muted">Cancelada</p>
                ) : r.confirmada_at ? (
                  <p className="text-sm font-semibold text-green-400">
                    ✓ Entrega confirmada el {formatearFecha(r.confirmada_at)}
                  </p>
                ) : (
                  <p className="text-sm text-muted">⏳ Esperando confirmación del voluntario</p>
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
