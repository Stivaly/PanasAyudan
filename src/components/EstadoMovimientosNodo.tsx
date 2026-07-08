"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelarCompromiso,
  confirmarEntregaCompromiso,
  editarCompromisoNodo,
  listarMovimientosNodo,
  marcarCompromisoNodoEnviado,
} from "@/lib/api";
import { MovimientoNodoEntrante, MovimientoNodoSaliente } from "@/lib/types";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

interface Props {
  nodeId: string;
  token: string;
}

const REALTIME_TABLES = [
  { table: "solicitudes" },
  { table: "compromisos_nodo" },
  { table: "compromisos_voluntario" },
  { table: "centros_acopio" },
];

export default function EstadoMovimientosNodo({ nodeId, token }: Props) {
  const [salientes, setSalientes] = useState<MovimientoNodoSaliente[]>([]);
  const [entrantes, setEntrantes] = useState<MovimientoNodoEntrante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionId, setAccionId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [cantidadEditada, setCantidadEditada] = useState("");

  const cargar = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    try {
      const data = await listarMovimientosNodo(nodeId, token);
      setSalientes(data.salientes);
      setEntrantes(data.entrantes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los movimientos.");
      setSalientes([]);
      setEntrantes([]);
    } finally {
      setCargando(false);
    }
  }, [nodeId, token]);

  const realtimeTables = useMemo(() => REALTIME_TABLES, []);

  useEffect(() => {
    // Carga inicial async en efecto; cargar controla el estado de carga.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  useRealtimeRefresh(
    `estado_movimientos_${nodeId}`,
    realtimeTables,
    () => void cargar(false),
    Boolean(nodeId && token)
  );

  const ejecutar = async (id: string, accion: () => Promise<void>) => {
    setError(null);
    setAccionId(id);
    try {
      await accion();
      setEditandoId(null);
      setCantidadEditada("");
      await cargar(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la accion.");
    } finally {
      setAccionId(null);
    }
  };

  const empezarEdicion = (mov: MovimientoNodoSaliente) => {
    setError(null);
    setEditandoId(mov.id);
    setCantidadEditada(mov.cantidad ? String(mov.cantidad) : "");
  };

  const guardarEdicion = (mov: MovimientoNodoSaliente) => {
    const cant = Number(cantidadEditada);
    if (!cantidadEditada.trim() || !Number.isInteger(cant) || cant <= 0) {
      setError("Indica una cantidad valida.");
      return;
    }
    void ejecutar(mov.id, () => editarCompromisoNodo(mov.id, cant, token));
  };

  const descripcion = (mov: { category_name: string; subcategoria: string | null }) =>
    `${mov.category_name}${mov.subcategoria ? " - " + mov.subcategoria : ""}`;

  if (cargando) {
    return <p className="text-sm text-muted">Cargando movimientos...</p>;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div>
        <p className="text-sm font-semibold text-accent">Movimientos</p>
        <p className="mt-1 text-xs text-muted">
          Envios comprometidos por este punto y ayudas que vienen hacia aqui.
        </p>
      </div>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase text-muted">Salientes</p>
        {salientes.length === 0 ? (
          <p className="rounded-xl bg-bg p-3 text-sm text-muted">Este punto aun no tiene envios comprometidos.</p>
        ) : (
          salientes.map((mov) => (
            <div key={mov.id} className="rounded-xl bg-bg p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{descripcion(mov)}</p>
                  <p className="text-xs text-muted">Destino: {mov.destino_nombre}</p>
                  <p className="mt-1 text-xs text-muted">
                    {mov.cantidad ? `${mov.cantidad} ` : ""}{mov.magnitud} -{" "}
                    {mov.tiene_transporte ? "transporte propio" : "requiere voluntario"}
                  </p>
                  {!mov.tiene_transporte && (
                    <p className="mt-1 text-xs text-muted">
                      {mov.cantidad_con_voluntario} con voluntario; {mov.cantidad_sin_voluntario} pendiente.
                    </p>
                  )}
                  {mov.nota && <p className="mt-1 text-xs text-white">{mov.nota}</p>}
                </div>
                <span className="badge shrink-0">{mov.status}</span>
              </div>

              {editandoId === mov.id ? (
                <div className="mt-3 flex gap-2">
                  <input
                    className="field min-w-0 flex-1"
                    inputMode="numeric"
                    value={cantidadEditada}
                    onChange={(e) => setCantidadEditada(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <button
                    onClick={() => guardarEdicion(mov)}
                    disabled={accionId === mov.id}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    Guardar
                  </button>
                  <button onClick={() => setEditandoId(null)} className="btn-ghost text-sm">
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {mov.puede_editar && (
                    <button onClick={() => empezarEdicion(mov)} className="btn-ghost text-sm">
                      Editar
                    </button>
                  )}
                  {mov.puede_cancelar && (
                    <button
                      onClick={() => ejecutar(mov.id, () => cancelarCompromiso(mov.id, token))}
                      disabled={accionId === mov.id}
                      className="btn-ghost text-sm text-danger disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  )}
                  {mov.puede_marcar_enviado && (
                    <button
                      onClick={() => ejecutar(mov.id, () => marcarCompromisoNodoEnviado(mov.id, token))}
                      disabled={accionId === mov.id}
                      className="btn-primary text-sm disabled:opacity-50"
                    >
                      Enviado
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase text-muted">Entrantes</p>
        {entrantes.length === 0 ? (
          <p className="rounded-xl bg-bg p-3 text-sm text-muted">No hay ayudas en camino hacia este punto.</p>
        ) : (
          entrantes.map((mov) => (
            <div key={mov.id} className="rounded-xl bg-bg p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{descripcion(mov)}</p>
                  <p className="text-xs text-muted">Origen: {mov.origen_nombre}</p>
                  <p className="mt-1 text-xs text-muted">
                    {mov.cantidad ? `${mov.cantidad} ` : ""}{mov.magnitud} - lo trae: {mov.transportista}
                  </p>
                  {mov.nota && <p className="mt-1 text-xs text-white">{mov.nota}</p>}
                </div>
                <span className="badge shrink-0">{mov.status}</span>
              </div>

              {mov.voluntarios.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {mov.voluntarios.map((vol) => (
                    <div key={vol.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2">
                      <span className="text-xs">
                        {vol.nombre || "Voluntario"} - {vol.cantidad ? `${vol.cantidad} ` : ""}{vol.magnitud} -{" "}
                        <span className="text-muted">{vol.status}</span>
                      </span>
                      {(vol.status === "pendiente" || vol.status === "retirado") && (
                        <button
                          onClick={() => ejecutar(vol.id, () => confirmarEntregaCompromiso(vol.id, token))}
                          disabled={accionId === vol.id}
                          className="text-xs font-semibold text-accent disabled:opacity-50"
                        >
                          Recibido
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {mov.puede_confirmar_recepcion && (
                <button
                  onClick={() => ejecutar(mov.id, () => confirmarEntregaCompromiso(mov.id, token))}
                  disabled={accionId === mov.id}
                  className="btn-primary mt-3 w-full text-sm disabled:opacity-50"
                >
                  Recibido
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
