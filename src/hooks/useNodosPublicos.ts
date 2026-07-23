"use client";

// Lista pública de nodos (issue #24) mantenida fresca vía Realtime. Se refresca
// ante cambios en node_inventory (para actualizar las etiquetas de categorías) y en
// centros_acopio (para aparecer/desaparecer al activar/pausar/cerrar un nodo).
// Mismo patrón de debounce que useItemsRealtime / useInventarioNodo.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getNodosPublicos } from "@/lib/api";
import { NodoPublico } from "@/lib/types";

interface Estado {
  nodos: NodoPublico[];
  cargando: boolean;
  error: string | null;
}

export function useNodosPublicos(): Estado & {
  refrescar: () => void;
  cargar: (mostrarCarga?: boolean) => Promise<void>;
} {
  const [nodos, setNodos] = useState<NodoPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    try {
      setNodos(await getNodosPublicos());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los puntos.");
    } finally {
      setCargando(false);
    }
  }, []);

  const refrescar = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      void cargar(false);
    }, 400);
  }, [cargar]);

  useEffect(() => {
    // Carga inicial en efecto (intencional): cargar() ya marca "cargando".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();

    const canal = supabase
      .channel("nodos_publicos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "node_inventory" },
        () => refrescar()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "centros_acopio" },
        () => refrescar()
      )
      .subscribe();

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      void supabase.removeChannel(canal);
    };
  }, [cargar, refrescar]);

  return { nodos, cargando, error, refrescar, cargar };
}
