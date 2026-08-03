"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listarSolicitudesParaNodo,
  responderSolicitudNodo,
} from "@/lib/api";
import { Magnitud, SolicitudParaNodo } from "@/lib/types";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { RANGO_ENTRE_NODOS_KM } from "@/lib/constantes";
import { validarCantidad } from "@/lib/validaciones";
import CantidadMagnitud from "./CantidadMagnitud";
import SkeletonLista from "./SkeletonLista";

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

export default function SolicitudesEntreCentros({ nodeId, token }: Props) {
  const [solicitudes, setSolicitudes] = useState<SolicitudParaNodo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [respondiendoId, setRespondiendoId] = useState<string | null>(null);
  const [magnitud, setMagnitud] = useState<Magnitud>("unidades");
  const [cantidad, setCantidad] = useState("");
  const [tieneTransporte, setTieneTransporte] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(
    async (mostrarCarga = true) => {
      if (mostrarCarga) setCargando(true);
      try {
        const data = await listarSolicitudesParaNodo(nodeId, token);
        setSolicitudes(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron cargar solicitudes de otros puntos.");
      } finally {
        setCargando(false);
      }
    },
    [nodeId, token]
  );

  const realtimeTables = useMemo(() => REALTIME_TABLES, []);

  useEffect(() => {
    // Carga inicial de datos remotos; cargar controla el estado de carga.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  useRealtimeRefresh(
    `solicitudes_entre_centros_${nodeId}`,
    realtimeTables,
    () => void cargar(false),
    Boolean(nodeId && token)
  );

  const abrir = (s: SolicitudParaNodo) => {
    setRespondiendoId(s.id);
    setMagnitud(s.magnitud);
    setCantidad("");
    setTieneTransporte(false);
    setError(null);
  };

  const responder = async (solicitudId: string) => {
    setError(null);
    const check = validarCantidad(cantidad);
    if (!check.valida) {
      setError(check.error ?? "Cantidad inválida.");
      return;
    }
    const cant = check.cantidad;
    setEnviando(true);
    try {
      await responderSolicitudNodo(solicitudId, magnitud, cant, tieneTransporte, token, nodeId);
      setRespondiendoId(null);
      await cargar(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo comprometer apoyo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div>
        <p className="text-sm font-semibold text-accent">Solicitudes de otros puntos</p>
        <p className="mt-1 text-xs text-muted">
          Pedidos de centros dentro del rango operativo de {RANGO_ENTRE_NODOS_KM} km máximo.
        </p>
      </div>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
      {cargando ? (
        <SkeletonLista />
      ) : solicitudes.length === 0 ? (
        <p className="text-sm text-muted">No hay solicitudes de otros puntos en rango ahora mismo.</p>
      ) : (
        solicitudes.map((s) => (
          <div key={s.id} className="rounded-xl bg-bg p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {s.category_name}
                  {s.subcategoria ? " - " + s.subcategoria : ""}
                </p>
                <p className="text-xs text-muted">Pide: {s.nodo_nombre}</p>
                <p className="mt-1 text-xs text-muted">
                  Pedido: {s.cantidad ? `${s.cantidad} ` : ""}{s.magnitud}
                  {s.requiere_vehiculo ? " - requiere vehículo" : ""}
                  {s.distancia_km !== null ? ` - aprox. ${s.distancia_km} km` : ""}
                </p>
                {s.nota && <p className="mt-1 text-xs text-fg">💬 {s.nota}</p>}
              </div>
              <span className="badge shrink-0">{s.status}</span>
            </div>

            {respondiendoId === s.id ? (
              <div className="mt-3 flex flex-col gap-2 rounded-xl bg-surface p-3">
                <CantidadMagnitud
                  cantidad={cantidad}
                  onCantidad={setCantidad}
                  magnitud={magnitud}
                  onMagnitud={(m) => setMagnitud(m as Magnitud)}
                  max={s.sobrante}
                  label="Cantidad y magnitud que puede aportar este punto"
                />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={tieneTransporte}
                    onChange={(e) => setTieneTransporte(e.target.checked)}
                  />
                  <span>Este punto puede moverlo con transporte propio</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => responder(s.id)}
                    disabled={enviando}
                    className="btn-primary flex-1 text-sm disabled:opacity-50"
                  >
                    {enviando ? "Enviando..." : "Comprometer apoyo"}
                  </button>
                  <button onClick={() => setRespondiendoId(null)} className="btn-ghost flex-1 text-sm">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => abrir(s)} className="btn-primary mt-3 w-full text-sm">
                Ofrecer apoyo desde este punto
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
