"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getItemsActivos } from "@/lib/api";
import { ItemConCategoria, Location } from "@/lib/types";

export interface ItemConLugar {
  item: ItemConCategoria;
  location: Location;
}

export interface PuntoMapa {
  location: Location;
  totalDisponible: number;
  items: ItemConLugar[];
}

interface Estado {
  puntos: PuntoMapa[];
  cargando: boolean;
  error: string | null;
}

function agrupar(filas: ItemConLugar[]): PuntoMapa[] {
  const mapa = new Map<string, PuntoMapa>();
  for (const fila of filas) {
    const key = fila.location.id;
    const existente = mapa.get(key);
    if (existente) {
      existente.items.push(fila);
      existente.totalDisponible += fila.item.qty_disponible;
    } else {
      mapa.set(key, {
        location: fila.location,
        totalDisponible: fila.item.qty_disponible,
        items: [fila],
      });
    }
  }
  return Array.from(mapa.values());
}

// Carga items activos (opcionalmente filtrados por categoría) y los mantiene
// frescos suscribiéndose a cambios en aporte_items vía Realtime.
export function useItemsRealtime(
  categorySlug?: string,
  estadoId?: string,
  centroAcopioId?: string,
  zonaRescateId?: string
): Estado & { refrescar: () => void } {
  const [puntos, setPuntos] = useState<PuntoMapa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    try {
      const filas = await getItemsActivos(
        categorySlug,
        estadoId,
        centroAcopioId,
        zonaRescateId
      );
      setPuntos(agrupar(filas));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el mapa.");
    } finally {
      setCargando(false);
    }
  }, [categorySlug, estadoId, centroAcopioId, zonaRescateId]);

  const refrescar = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      void cargar();
    }, 400);
  }, [cargar]);

  useEffect(() => {
    setCargando(true);
    void cargar();

    const canal = supabase
      .channel("aporte_items_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aporte_items" },
        () => refrescar()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aportes" },
        () => refrescar()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locations" },
        () => refrescar()
      )
      .subscribe();

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      void supabase.removeChannel(canal);
    };
  }, [cargar, refrescar]);

  return { puntos, cargando, error, refrescar };
}
