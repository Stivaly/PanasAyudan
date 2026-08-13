"use client";

// Inventario de un nodo (issue #22) mantenido fresco vía Realtime. #24 (vista
// pública) lo consumirá con token undefined (lectura pública, RLS filtra a nodos
// visibles y verificados); el panel del nodo lo usa con token para ver el suyo en
// cualquier estado. El debounce evita recargar en cada evento suelto.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getInventarioNodo } from "@/lib/api";
import { InventarioItem } from "@/lib/types";

interface Estado {
  items: InventarioItem[];
  cargando: boolean;
  error: string | null;
}

export function useInventarioNodo(
  nodeId: string | null,
  token?: string
): Estado & { refrescar: () => void } {
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    if (!nodeId) {
      setItems([]);
      setCargando(false);
      return;
    }
    try {
      setItems(await getInventarioNodo(nodeId, token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el inventario.");
    } finally {
      setCargando(false);
    }
  }, [nodeId, token]);

  const refrescar = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      void cargar();
    }, 400);
  }, [cargar]);

  useEffect(() => {
    if (!nodeId) return;
    // Fetch en efecto intencional: al montar / cambiar de nodo marcamos "cargando".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    void cargar();

    const canal = supabase
      .channel(`node_inventory_${nodeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "node_inventory",
          filter: `node_id=eq.${nodeId}`,
        },
        () => refrescar()
      )
      .subscribe();

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      void supabase.removeChannel(canal);
    };
  }, [nodeId, cargar, refrescar]);

  return { items, cargando, error, refrescar };
}
