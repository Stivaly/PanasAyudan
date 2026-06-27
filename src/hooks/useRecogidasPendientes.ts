"use client";

import { useCallback, useEffect, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { supabase, supabaseWithToken } from "@/lib/supabase";
import { calcularDistancias } from "@/lib/maps";
import { resolverCentro } from "@/lib/geo";
import { Coords, Recogida } from "@/lib/types";

export interface RecogidaDetallada {
  recogida: Recogida;
  descripcion: string;
  place_name: string;
  location_id: string;
  aporte_id: string;
  lat: number;
  lng: number;
  metros: number;
}

async function fetchPendientes(
  client: SupabaseClient
): Promise<Omit<RecogidaDetallada, "metros">[]> {
  const { data, error } = await client.rpc("listar_recogidas_pendientes_voluntario");

  if (error) {
    // Los errores de Supabase/PostgREST son objetos planos, no Error.
    // Conservamos el mensaje real (p. ej. "Could not find the function ...").
    throw new Error(error.message || "Error al cargar recogidas.");
  }

  const filas = Array.isArray(data) ? data : [];

  return filas.map((row) => ({
    recogida: {
      id: row.id,
      aporte_item_id: row.aporte_item_id,
      volunteer_id: row.volunteer_id,
      nombre: row.nombre,
      apellido: row.apellido,
      cedula: row.cedula,
      placa_vehiculo: row.placa_vehiculo,
      qty_a_buscar: row.qty_a_buscar,
      status: row.status,
      reserved_until: row.reserved_until,
      confirmation_deadline: row.confirmation_deadline ?? null,
      confirmada_at: row.confirmada_at ?? null,
      created_at: row.created_at,
    },
    descripcion: row.descripcion,
    place_name: row.place_name,
    location_id: row.location_id,
    aporte_id: row.aporte_id,
    lat: row.lat,
    lng: row.lng,
  }));
}

export function useRecogidasPendientes(token: string | null) {
  const [recogidas, setRecogidas] = useState<RecogidaDetallada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [centro, setCentro] = useState<Coords | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const client = supabaseWithToken(token);
      const base = await fetchPendientes(client);
      if (base.length === 0) {
        setRecogidas([]);
        return;
      }
      let distancias: { metros: number }[] = [];
      try {
        let origen = centro;
        if (!origen) {
          origen = await resolverCentro();
          setCentro(origen);
        }
        const destinos = base.map((r) => ({ lat: r.lat, lng: r.lng }));
        distancias = await calcularDistancias(origen, destinos);
      } catch {
        distancias = [];
      }

      const detalladas: RecogidaDetallada[] = base.map((r, i) => ({
        ...r,
        metros: distancias[i]?.metros ?? Number.POSITIVE_INFINITY,
      }));
      detalladas.sort((a, b) => a.metros - b.metros);
      setRecogidas(detalladas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar recogidas.");
    } finally {
      setCargando(false);
    }
  }, [centro, token]);

  useEffect(() => {
    if (!token) return;
    void cargar();

    const canal = supabase
      .channel("recogidas_panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recogidas" },
        () => void cargar()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [token, cargar]);

  return { recogidas, cargando, error, recargar: cargar };
}
