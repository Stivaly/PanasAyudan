"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getItemsDeLugar, getLugar, getReservasPendientesDeLugar } from "@/lib/api";
import { ItemConCategoria, Location, ReservaPublica } from "@/lib/types";
import Countdown from "@/components/Countdown";
import ReservarItem, { ReservaConfirmadaInfo } from "@/components/ReservarItem";

export default function LugarDetalle() {
  const params = useParams<{ id: string }>();
  const locationId = params.id;

  const [lugar, setLugar] = useState<Location | null>(null);
  const [items, setItems] = useState<ItemConCategoria[]>([]);
  const [reservas, setReservas] = useState<ReservaPublica[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorReservas, setErrorReservas] = useState<string | null>(null);
  const [reservaConfirmada, setReservaConfirmada] = useState<ReservaConfirmadaInfo | null>(null);

  const recargarReservas = useCallback(async () => {
    try {
      const data = await getReservasPendientesDeLugar(locationId);
      setReservas(data);
      setErrorReservas(null);
    } catch {
      setReservas([]);
      setErrorReservas("No se pudo cargar el contador publico de solicitudes.");
    }
  }, [locationId]);

  const recargarDatos = useCallback(async () => {
    await Promise.all([
      getItemsDeLugar(locationId).then(setItems),
      recargarReservas(),
    ]);
  }, [locationId, recargarReservas]);

  useEffect(() => {
    let activo = true;
    Promise.all([
      getLugar(locationId),
      getItemsDeLugar(locationId),
      getReservasPendientesDeLugar(locationId).catch(() => [] as ReservaPublica[]),
    ])
      .then(([l, its, res]) => {
        if (!activo) return;
        setLugar(l);
        setItems(its);
        setReservas(res);
        setErrorReservas(null);
      })
      .catch(() => setErrorReservas("No se pudo cargar el contador publico de solicitudes."))
      .finally(() => activo && setCargando(false));

    const canal = supabase
      .channel(`lugar_${locationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aporte_items" },
        () => void recargarDatos()
      )
      .subscribe();

    return () => {
      activo = false;
      void supabase.removeChannel(canal);
    };
  }, [locationId, recargarDatos]);

  const porCategoria = useMemo(() => {
    const grupos = new Map<string, { nombre: string; items: ItemConCategoria[] }>();
    for (const it of items) {
      const key = it.category.id;
      const g = grupos.get(key);
      if (g) g.items.push(it);
      else grupos.set(key, { nombre: it.category.name, items: [it] });
    }
    return Array.from(grupos.values());
  }, [items]);

  const whatsappHref = useMemo(() => {
    if (typeof window === "undefined" || !lugar) return "#";
    const texto = `Insumos disponibles en ${lugar.place_name} - PanasAyudan: ${window.location.href}`;
    return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  }, [lugar]);

  if (cargando) {
    return <main className="grid min-h-dvh place-items-center text-muted">Cargando...</main>;
  }

  if (!lugar) {
    return (
      <main className="grid min-h-dvh place-items-center gap-3 p-6 text-center">
        <p className="text-muted">Este lugar no existe.</p>
        <Link href="/" className="btn-ghost">Volver al mapa</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <h1 className="text-lg font-bold">{lugar.place_name}</h1>
      </div>
      {lugar.address && <p className="-mt-3 text-sm text-muted">{lugar.address}</p>}
      {lugar.descripcion_libre && lugar.descripcion_libre !== lugar.place_name && (
        <p className="-mt-2 rounded-xl bg-surface p-3 text-sm">{lugar.descripcion_libre}</p>
      )}

      <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full">
        Compartir por WhatsApp
      </a>

      {errorReservas && <p className="text-sm font-semibold text-danger">{errorReservas}</p>}

      {reservaConfirmada && (
        <section className="card flex flex-col gap-3 border-accent">
          {reservaConfirmada.whatsapp ? (
            <a
              href={
                "https://wa.me/" +
                reservaConfirmada.whatsapp +
                "?text=" +
                encodeURIComponent(
                  "Hola, acabo de solicitar " +
                    reservaConfirmada.cantidad +
                    " de " +
                    reservaConfirmada.itemDescripcion +
                    " en Panas Ayudan. Quiero coordinar la recogida."
                )
              }
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full text-base"
            >
              Escribir al voluntario por WhatsApp
            </a>
          ) : (
            <p className="rounded-xl border border-border bg-bg p-3 text-sm text-muted">
              No se encontró un WhatsApp del voluntario para este aporte.
            </p>
          )}
          <div className="rounded-xl bg-bg p-3 text-sm">
            <p className="font-semibold text-accent">Solicitud registrada</p>
            <p className="mt-1 text-muted">
              Tienes hasta que termine el contador para ir a buscar este insumo. Después se libera automáticamente.
            </p>
          </div>
        </section>
      )}

      {porCategoria.length === 0 && (
        <p className="text-muted">Ya no hay insumos disponibles en este lugar.</p>
      )}

      {porCategoria.map((grupo) => (
        <section key={grupo.nombre} className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-accent">{grupo.nombre}</h2>
          {grupo.items.map((it) => {
            return (
              <div key={it.id} className="card flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{it.descripcion}</span>
                  <span className="shrink-0 text-sm text-muted">{it.qty_disponible} disp.</span>
                </div>

                <ReservarItem
                  item={it}
                  onReservada={async (info) => {
                    setReservaConfirmada(info);
                    await recargarDatos();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              </div>
            );
          })}
        </section>
      ))}

      {reservas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-accent">Solicitudes activas</h2>
          <div className="card flex flex-col gap-3 border-accent">
            {reservas.map((solicitud) => (
              <div
                key={solicitud.aporte_item_id + "-" + solicitud.reserved_until}
                className="flex flex-col gap-2 rounded-xl bg-bg p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{solicitud.descripcion}</p>
                    <p className="text-xs text-muted">{solicitud.category_name}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-muted">
                    {solicitud.qty_a_buscar} {solicitud.qty_a_buscar === 1 ? "objeto" : "objetos"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Tiempo para ir a buscar</span>
                  <span className="text-lg font-bold">
                    <Countdown hasta={solicitud.reserved_until} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
