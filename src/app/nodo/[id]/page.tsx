"use client";

// Detalle público de un nodo (issue #24). Muestra nombre, tipo, dirección, horario,
// estado y las categorías/subcategorías disponibles con su condición. NUNCA cantidades,
// magnitudes ni contactos: la RPC/SELECT público no los devuelve. /nodo (sin id) es el
// panel del admin; esta ruta con id es pública.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import BotonVolver from "@/components/BotonVolver";
import { supabase } from "@/lib/supabase";
import { getNodoPublico, getInventarioPublico } from "@/lib/api";
import {
  InventarioPublicoItem,
  NodoPublicoBase,
  descripcionPausa,
  statusVisible,
} from "@/lib/types";
import CompartirNodo from "@/components/CompartirNodo";

const TIPO_LABEL: Record<string, string> = {
  acopio: "Centro de acopio",
  entrega: "Punto de entrega",
  mixto: "Acopio y entrega",
};

export default function NodoDetalle() {
  const params = useParams<{ id: string }>();
  const nodeId = params.id;

  const [nodo, setNodo] = useState<NodoPublicoBase | null>(null);
  const [inventario, setInventario] = useState<InventarioPublicoItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargarInventario = useCallback(async () => {
    try {
      setInventario(await getInventarioPublico(nodeId));
    } catch {
      // El inventario puede fallar sin invalidar la ficha del nodo.
    }
  }, [nodeId]);

  useEffect(() => {
    let activo = true;
    Promise.all([getNodoPublico(nodeId), getInventarioPublico(nodeId)])
      .then(([n, inv]) => {
        if (!activo) return;
        setNodo(n);
        setInventario(inv);
      })
      .catch(() => {})
      .finally(() => activo && setCargando(false));

    const canal = supabase
      .channel(`nodo_publico_${nodeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "node_inventory",
          filter: `node_id=eq.${nodeId}`,
        },
        () => void recargarInventario()
      )
      .subscribe();

    return () => {
      activo = false;
      void supabase.removeChannel(canal);
    };
  }, [nodeId, recargarInventario]);

  // Agrupa el inventario por macrocategoría, conservando subcategoría + condición.
  const porCategoria = useMemo(() => {
    const grupos = new Map<
      string,
      { nombre: string; items: InventarioPublicoItem[] }
    >();
    for (const it of inventario) {
      const key = it.category_id;
      const nombre = it.category?.name ?? "Otros";
      const g = grupos.get(key);
      if (g) g.items.push(it);
      else grupos.set(key, { nombre, items: [it] });
    }
    return Array.from(grupos.values());
  }, [inventario]);

  const categoriasDisponibles = useMemo(
    () => porCategoria.map((g) => g.nombre),
    [porCategoria]
  );

  if (cargando) {
    return <main className="grid min-h-dvh place-items-center text-muted">Cargando...</main>;
  }

  if (!nodo) {
    return (
      <main className="grid min-h-dvh place-items-center gap-3 p-6 text-center">
        <p className="text-muted">Este punto no está disponible.</p>
        <Link href="/buscar" className="btn-ghost">
          Volver a la búsqueda
        </Link>
      </main>
    );
  }

  const pausa = descripcionPausa(nodo);
  const pausado = statusVisible(nodo) === "pausado";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <BotonVolver fallback="/buscar" />
        <h1 className="text-lg font-bold">{nodo.nombre}</h1>
      </div>

      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {TIPO_LABEL[nodo.tipo] ?? nodo.tipo}
        </span>
        {pausado ? (
          <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200">
            Pausado{pausa ? `: ${pausa}` : ""}
          </span>
        ) : (
          <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:border-green-400/40 dark:bg-green-500/15 dark:text-green-100">
            Operativo
          </span>
        )}
      </div>

      {nodo.direccion && <p className="-mt-2 text-sm text-muted">{nodo.direccion}</p>}

      {nodo.horario && (
        <div className="-mt-1 rounded-xl bg-surface p-3 text-sm">
          <p className="font-semibold">🕑 Horario</p>
          <p className="text-muted">{nodo.horario}</p>
        </div>
      )}

      <CompartirNodo
        nombre={nodo.nombre}
        direccion={nodo.direccion}
        categorias={categoriasDisponibles}
      />

      {porCategoria.length === 0 && (
        <p className="text-muted">Este punto no tiene categorías disponibles por ahora.</p>
      )}

      {porCategoria.map((grupo) => (
        <section key={grupo.nombre} className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-accent">
            {grupo.nombre}
          </h2>
          {grupo.items.map((it) => (
            <div key={it.id} className="card flex flex-col gap-1">
              <span className="font-semibold">
                {it.subcategory?.name ?? it.category?.name ?? "Disponible"}
              </span>
              {it.nota && <span className="text-xs text-muted">💬 {it.nota}</span>}
              {it.condicion && (
                <span className="text-xs text-amber-400">⚠️ {it.condicion}</span>
              )}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
