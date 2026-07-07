"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmarEntregaCompromiso,
  confirmarLlegadaCompromiso,
  crearSolicitud,
  getCategorias,
  getSubcategorias,
  listarSolicitudesNodo,
} from "@/lib/api";
import {
  Category,
  MAGNITUD_ORDEN,
  Magnitud,
  SolicitudNodo,
  Subcategory,
} from "@/lib/types";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

interface Props {
  nodeId: string;
  token: string;
}

export default function SolicitudesNodo({ nodeId, token }: Props) {
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategory[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudNodo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [magnitud, setMagnitud] = useState<Magnitud>("unidades");
  const [requiereVehiculo, setRequiereVehiculo] = useState(false);
  const [confirmandoNoLlego, setConfirmandoNoLlego] = useState<string | null>(null);

  const cargar = useCallback(() => {
    listarSolicitudesNodo(nodeId, token)
      .then(setSolicitudes)
      .catch(() => setSolicitudes([]));
  }, [nodeId, token]);

  const grupos = useMemo(
    () => [
      {
        titulo: "Abiertas",
        solicitudes: solicitudes.filter((s) => s.status === "abierta"),
      },
      {
        titulo: "Con compromiso",
        solicitudes: solicitudes.filter(
          (s) => s.status === "parcial" || s.status === "inventario_asegurado"
        ),
      },
      {
        titulo: "En camino",
        solicitudes: solicitudes.filter((s) => s.status === "en_camino"),
      },
      {
        titulo: "Recibidas/cerradas",
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
    getCategorias().then(setCategorias).catch(() => setCategorias([]));
    cargar();
  }, [cargar]);

  useRealtimeRefresh(
    `solicitudes_nodo_${nodeId}`,
    realtimeTables,
    cargar,
    Boolean(nodeId && token)
  );

  useEffect(() => {
    // Reset del selector dependiente al cambiar categoria (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubcategoryId("");
    if (!categoryId) {
      setSubcategorias([]);
      return;
    }
    getSubcategorias(categoryId)
      .then(setSubcategorias)
      .catch(() => setSubcategorias([]));
  }, [categoryId]);

  const crear = async () => {
    setError(null);
    if (!categoryId) {
      setError("Elige una categoria para la solicitud.");
      return;
    }
    setCreando(true);
    try {
      await crearSolicitud(
        nodeId,
        {
          category_id: categoryId,
          subcategory_id: subcategoryId || null,
          magnitud,
          requiere_vehiculo: requiereVehiculo,
        },
        token
      );
      setCategoryId("");
      setSubcategoryId("");
      setMagnitud("unidades");
      setRequiereVehiculo(false);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la solicitud.");
    } finally {
      setCreando(false);
    }
  };

  const confirmar = async (compromisoId: string) => {
    setError(null);
    try {
      await confirmarEntregaCompromiso(compromisoId, token);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar la entrega.");
    }
  };

  const registrarLlegada = async (compromisoId: string, llego: boolean) => {
    setError(null);
    try {
      await confirmarLlegadaCompromiso(compromisoId, llego, token);
      setConfirmandoNoLlego(null);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la llegada.");
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div>
        <p className="text-sm font-semibold text-accent">Pedir insumos</p>
        <p className="mt-1 text-xs text-muted">
          Crea pedidos para este punto y revisa compromisos de voluntarios o de otros puntos.
        </p>
      </div>
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <div className="flex flex-col gap-2 rounded-xl bg-bg p-3">
        <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Categoria...</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={subcategoryId}
          onChange={(e) => setSubcategoryId(e.target.value)}
          disabled={!categoryId || subcategorias.length === 0}
        >
          <option value="">Subcategoria (opcional)...</option>
          {subcategorias.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={magnitud}
          onChange={(e) => setMagnitud(e.target.value as Magnitud)}
        >
          {MAGNITUD_ORDEN.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={requiereVehiculo}
            onChange={(e) => setRequiereVehiculo(e.target.checked)}
          />
          <span>Requiere vehiculo</span>
        </label>
        <button onClick={crear} disabled={creando} className="btn-primary text-sm disabled:opacity-50">
          {creando ? "Creando..." : "Crear solicitud"}
        </button>
      </div>

      {solicitudes.length === 0 ? (
        <p className="text-sm text-muted">Este punto aun no tiene solicitudes.</p>
      ) : (
        grupos.map((grupo) =>
          grupo.solicitudes.length > 0 ? (
            <div key={grupo.titulo} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase text-muted">{grupo.titulo}</p>
              {grupo.solicitudes.map((s) => (
                <div key={s.id} className="rounded-xl bg-bg p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {s.category_name}
                        {s.subcategoria ? " - " + s.subcategoria : ""}
                      </p>
                      <p className="text-xs text-muted">
                        Pedido: {s.magnitud}
                        {s.requiere_vehiculo ? " - requiere vehiculo" : ""}
                        {s.sobrante > 0 ? " - pendiente por cubrir" : " - cubierto"}
                      </p>
                    </div>
                    <span className="badge shrink-0">{s.status}</span>
                  </div>

                  {(s.compromisos_voluntario.length > 0 || s.compromisos_nodo.length > 0) && (
                    <div className="mt-2 flex flex-col gap-2">
                      {s.compromisos_voluntario.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold text-muted">Voluntarios</p>
                          {s.compromisos_voluntario.map((c) => (
                            <div key={c.id} className="flex flex-col gap-1 rounded-lg bg-surface p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  {c.magnitud} - {c.tiempo_estimado_minutos} min -{" "}
                                  <span className="text-muted">{c.status}</span>
                                </span>
                                {c.atrasado_24h && (
                                  <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-white">
                                    Sin confirmar +24h
                                  </span>
                                )}
                              </div>
                              {c.status === "pendiente" &&
                                (confirmandoNoLlego === c.id ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-danger">
                                      Bloqueara su cedula de forma permanente. Confirmas?
                                    </span>
                                    <button
                                      onClick={() => registrarLlegada(c.id, false)}
                                      className="text-xs font-semibold text-danger"
                                    >
                                      Si, no llego
                                    </button>
                                    <button
                                      onClick={() => setConfirmandoNoLlego(null)}
                                      className="text-xs font-semibold text-muted"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                ) : (
                                  <span className="flex gap-2">
                                    <button
                                      onClick={() => registrarLlegada(c.id, true)}
                                      className="text-xs font-semibold text-accent"
                                    >
                                      Llego
                                    </button>
                                    <button
                                      onClick={() => setConfirmandoNoLlego(c.id)}
                                      className="text-xs font-semibold text-danger"
                                    >
                                      No llego
                                    </button>
                                  </span>
                                ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {s.compromisos_nodo.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold text-muted">Otros puntos</p>
                          {s.compromisos_nodo.map((c) => (
                            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2">
                              <span>
                                {c.magnitud} - {c.tiene_transporte ? "con transporte" : "sin transporte"} -{" "}
                                <span className="text-muted">{c.status}</span>
                              </span>
                              {(c.status === "comprometido" || c.status === "en_camino") && (
                                <button onClick={() => confirmar(c.id)} className="text-xs font-semibold text-accent">
                                  Confirmar
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null
        )
      )}
    </div>
  );
}
