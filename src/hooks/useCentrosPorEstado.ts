"use client";

// Centros de acopio de un estado (issue #76).
//
// El patrón estaba duplicado en el registro de voluntario y en el panel de
// superadmin: al cambiar de estado hay que limpiar el centro elegido, vaciar la
// lista y volver a pedirla. Las dos copias ya habían divergido — la de
// superadmin distinguía "falló la carga" de "no hay centros" y se refrescaba por
// Realtime; la de voluntarios no. Este hook se queda con la versión completa.
//
// Posee también el centro seleccionado: el reset al cambiar de estado es parte
// del patrón, y dejarlo afuera obligaba a repetir un efecto en cada página.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCentrosAcopioPorEstado } from "@/lib/api";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { CentroAcopio } from "@/lib/types";

export function useCentrosPorEstado(estadoId: string | null, canal: string) {
  const [centros, setCentros] = useState<CentroAcopio[]>([]);
  const [centroId, setCentroId] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  const cargar = useCallback((id: string, mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    return getCentrosAcopioPorEstado(id)
      .then((lista) => {
        setCentros(lista);
        setError(false);
      })
      .catch(() => {
        setCentros([]);
        setError(true);
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    // Reset del selector dependiente al cambiar de estado + fetch (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCentroId("");
    setCentros([]);
    if (!estadoId) {
      setCargando(false);
      return;
    }
    void cargar(estadoId);
  }, [estadoId, cargar]);

  const tablas = useMemo(
    () => (estadoId ? [{ table: "centros_acopio", filter: `estado_id=eq.${estadoId}` }] : []),
    [estadoId]
  );

  useRealtimeRefresh(
    canal,
    tablas,
    () => {
      if (estadoId) void cargar(estadoId, false);
    },
    Boolean(estadoId)
  );

  return { centros, centroId, setCentroId, cargando, error };
}
