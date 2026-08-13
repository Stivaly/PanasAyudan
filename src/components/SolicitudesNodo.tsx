"use client";

// Solicitudes del nodo: pedir insumos y seguir compromisos. Partido en
// FormularioSolicitud / TarjetaSolicitud y lib/solicitudes (issue #80); aquí
// queda la carga, el realtime, la agrupación y la orquestación entre piezas.

import { useCallback, useEffect, useMemo, useState } from "react";
import FormularioSolicitud from "@/components/FormularioSolicitud";
import TarjetaSolicitud from "@/components/TarjetaSolicitud";
import { eliminarSolicitud, listarSolicitudesNodo } from "@/lib/api";
import { SolicitudNodo } from "@/lib/types";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

interface Props {
  nodeId: string;
  token: string;
}

export default function SolicitudesNodo({ nodeId, token }: Props) {
  const [solicitudes, setSolicitudes] = useState<SolicitudNodo[]>([]);
  const [solicitudesError, setSolicitudesError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Solicitud cargada en el formulario para editar (objeto completo: así el
  // formulario siembra sus campos una sola vez, aunque el realtime refresque).
  const [editando, setEditando] = useState<SolicitudNodo | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  // Anti doble submit (issue #53): RPC de borrado en vuelo. Boolean basta
  // porque solo hay un strip de confirmacion abierto a la vez (eliminandoId).
  const [borrando, setBorrando] = useState(false);

  const cargar = useCallback(() => {
    listarSolicitudesNodo(nodeId, token)
      .then((lista) => {
        setSolicitudes(lista);
        setSolicitudesError(false);
      })
      .catch(() => setSolicitudesError(true));
  }, [nodeId, token]);

  const grupos = useMemo(
    () => [
      {
        titulo: "Abiertas",
        descripcion: "Pedidos publicados que aún nadie tomó.",
        solicitudes: solicitudes.filter((s) => s.status === "abierta"),
      },
      {
        titulo: "Compromisos recibidos",
        descripcion: "Centros o voluntarios ya ofrecieron ayuda; aquí ves cuánto falta.",
        solicitudes: solicitudes.filter(
          (s) =>
            s.status === "parcial" ||
            s.status === "inventario_asegurado" ||
            s.status === "en_camino"
        ),
      },
      {
        titulo: "Recibidas/cerradas",
        descripcion: "Pedidos confirmados como recibidos.",
        solicitudes: solicitudes.filter((s) => s.status === "cerrada"),
      },
    ],
    [solicitudes]
  );

  const realtimeTables = useMemo(
    () => [
      { table: "solicitudes", filter: `node_id_origen=eq.${nodeId}` },
      { table: "compromisos_voluntario" },
      { table: "compromisos_nodo" },
    ],
    [nodeId]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  useRealtimeRefresh(
    `solicitudes_nodo_${nodeId}`,
    realtimeTables,
    cargar,
    Boolean(nodeId && token)
  );

  const eliminar = async (solicitudId: string) => {
    if (borrando) return;
    setError(null);
    setBorrando(true);
    try {
      await eliminarSolicitud(solicitudId, token);
      setEliminandoId(null);
      if (editando?.id === solicitudId) setEditando(null);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la solicitud.");
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <FormularioSolicitud
        key={editando?.id ?? "nueva"}
        nodeId={nodeId}
        token={token}
        editando={editando}
        onGuardado={() => {
          setError(null);
          setEditando(null);
          cargar();
        }}
        onCancelar={() => setEditando(null)}
        onError={setError}
      />

      {solicitudesError ? (
        <div className="card border-danger">
          <p className="text-sm font-semibold text-danger">No se pudieron cargar las solicitudes.</p>
          <button onClick={cargar} className="btn-ghost mt-2 w-full text-sm">
            Reintentar
          </button>
        </div>
      ) : solicitudes.length === 0 ? (
        <p className="text-sm text-muted">Este punto aún no tiene solicitudes.</p>
      ) : (
        grupos.map((grupo) =>
          grupo.solicitudes.length > 0 ? (
            <div key={grupo.titulo} className="flex flex-col gap-2">
              <div>
                <p className="text-xs font-semibold uppercase text-muted">{grupo.titulo}</p>
                <p className="text-xs text-muted">{grupo.descripcion}</p>
              </div>
              {grupo.solicitudes.map((s) => (
                <TarjetaSolicitud
                  key={s.id}
                  s={s}
                  eliminando={eliminandoId === s.id}
                  borrando={borrando}
                  onEditar={() => {
                    setError(null);
                    setEliminandoId(null);
                    setEditando(s);
                  }}
                  onPedirEliminar={() => setEliminandoId(s.id)}
                  onConfirmarEliminar={() => eliminar(s.id)}
                  onCancelarEliminar={() => setEliminandoId(null)}
                />
              ))}
            </div>
          ) : null
        )
      )}
    </div>
  );
}
