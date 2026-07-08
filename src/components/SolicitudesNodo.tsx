"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  crearSolicitud,
  editarSolicitud,
  eliminarSolicitud,
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
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [requiereVehiculo, setRequiereVehiculo] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [subPendiente, setSubPendiente] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(() => {
    listarSolicitudesNodo(nodeId, token)
      .then(setSolicitudes)
      .catch(() => setSolicitudes([]));
  }, [nodeId, token]);

  const grupos = useMemo(
    () => [
      {
        titulo: "Abiertas",
        descripcion: "Pedidos publicados que aun nadie tomo.",
        solicitudes: solicitudes.filter((s) => s.status === "abierta"),
      },
      {
        titulo: "Compromisos recibidos",
        descripcion: "Centros o voluntarios ya ofrecieron ayuda; aqui ves cuanto falta.",
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
    // Reset del selector dependiente al cambiar categoria.
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

  useEffect(() => {
    if (subPendiente && subcategorias.some((s) => s.id === subPendiente)) {
      // Sincroniza el selector con la subcategoria pendiente ya cargada.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubcategoryId(subPendiente);
      setSubPendiente(null);
    }
  }, [subPendiente, subcategorias]);

  useEffect(() => {
    if (editandoId) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editandoId]);

  const limpiarFormulario = () => {
    setEditandoId(null);
    setSubPendiente(null);
    setCategoryId("");
    setSubcategoryId("");
    setMagnitud("unidades");
    setCantidad("");
    setNota("");
    setRequiereVehiculo(false);
  };

  const guardar = async () => {
    setError(null);
    if (!categoryId) {
      setError("Elige una categoria para la solicitud.");
      return;
    }
    const cant = Number(cantidad);
    if (!cantidad.trim() || !Number.isInteger(cant) || cant <= 0) {
      setError("Indica la cantidad (numero entero mayor a cero).");
      return;
    }
    const datos = {
      category_id: categoryId,
      subcategory_id: subcategoryId || null,
      magnitud,
      cantidad: cant,
      requiere_vehiculo: requiereVehiculo,
      nota: nota.trim() || null,
    };
    setCreando(true);
    try {
      if (editandoId) {
        await editarSolicitud(editandoId, datos, token);
      } else {
        await crearSolicitud(nodeId, datos, token);
      }
      limpiarFormulario();
      cargar();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : editandoId
          ? "No se pudo editar la solicitud."
          : "No se pudo crear la solicitud."
      );
    } finally {
      setCreando(false);
    }
  };

  const empezarEdicion = (s: SolicitudNodo) => {
    setError(null);
    setEliminandoId(null);
    setEditandoId(s.id);
    setMagnitud(s.magnitud);
    setCantidad(s.cantidad ? String(s.cantidad) : "");
    setNota(s.nota ?? "");
    setRequiereVehiculo(s.requiere_vehiculo);
    setCategoryId(s.category_id);
    setSubcategoryId("");
    setSubPendiente(s.subcategory_id);
  };

  const eliminar = async (solicitudId: string) => {
    setError(null);
    try {
      await eliminarSolicitud(solicitudId, token);
      setEliminandoId(null);
      if (editandoId === solicitudId) limpiarFormulario();
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la solicitud.");
    }
  };

  const cantidadActivaNodo = (s: SolicitudNodo) =>
    s.compromisos_nodo
      .filter((c) => c.status === "comprometido" || c.status === "en_camino" || c.status === "entregado")
      .reduce((total, c) => total + (c.cantidad ?? 0), 0);

  const cantidadActivaVoluntarioDirecto = (s: SolicitudNodo) =>
    s.compromisos_voluntario
      .filter(
        (c) =>
          !c.compromiso_nodo_id &&
          (c.status === "pendiente" || c.status === "retirado" || c.status === "completado")
      )
      .reduce((total, c) => total + (c.cantidad ?? 0), 0);

  const comprometido = (s: SolicitudNodo) =>
    cantidadActivaNodo(s) + cantidadActivaVoluntarioDirecto(s);

  const falta = (s: SolicitudNodo) => Math.max(0, (s.cantidad ?? 0) - comprometido(s));

  const estadoSolicitud = (s: SolicitudNodo) => {
    if (s.status === "abierta") return "Abierta";
    if (s.status === "cerrada") return "Recibida";
    if (s.status === "en_camino") return "Con envios en camino";
    return "Con compromisos";
  };

  const estadoVoluntario = (c: SolicitudNodo["compromisos_voluntario"][number]) => {
    if (c.status === "completado") return "recibido";
    if (c.status === "incumplido") return "incumplido";
    if (c.status === "retirado") {
      return c.atrasado_24h ? "retirado, confirmacion vencida" : "retirado, esperando confirmacion";
    }
    if (c.atrasado_4h) return "retiro vencido";
    return "pendiente de retiro";
  };

  const estadoNodo = (c: SolicitudNodo["compromisos_nodo"][number]) => {
    if (c.status === "entregado") return "recibido";
    if (c.status === "cancelado") return "cancelado";
    if (c.status === "en_camino") return "enviado";
    if (c.tiene_transporte) return "pendiente de envio";
    if ((c.cantidad_disponible_transporte ?? 0) > 0) return "esperando voluntario";
    return "transporte asignado";
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div>
        <p className="text-sm font-semibold text-accent">
          {editandoId ? "Editar solicitud" : "Pedir insumos"}
        </p>
        <p className="mt-1 text-xs text-muted">
          {editandoId
            ? "Corrige los datos del pedido. Solo se pueden editar solicitudes abiertas sin compromisos."
            : "Crea pedidos para este punto y revisa quien ya prometio ayuda."}
        </p>
      </div>
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <div ref={formRef} className="flex flex-col gap-2 rounded-xl bg-bg p-3">
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
        <div className="flex gap-2">
          <input
            className="field w-1/3"
            inputMode="numeric"
            placeholder="Cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <select
            className="field flex-1"
            value={magnitud}
            onChange={(e) => setMagnitud(e.target.value as Magnitud)}
          >
            {MAGNITUD_ORDEN.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="field min-h-[70px]"
          maxLength={280}
          placeholder="Comentario: que se necesita exactamente. No incluyas telefonos."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={requiereVehiculo}
            onChange={(e) => setRequiereVehiculo(e.target.checked)}
          />
          <span>Requiere vehiculo</span>
        </label>
        <div className="flex gap-2">
          <button
            onClick={guardar}
            disabled={creando}
            className="btn-primary flex-1 text-sm disabled:opacity-50"
          >
            {creando ? "Guardando..." : editandoId ? "Guardar cambios" : "Crear solicitud"}
          </button>
          {editandoId && (
            <button
              onClick={limpiarFormulario}
              disabled={creando}
              className="btn-ghost text-sm disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {solicitudes.length === 0 ? (
        <p className="text-sm text-muted">Este punto aun no tiene solicitudes.</p>
      ) : (
        grupos.map((grupo) =>
          grupo.solicitudes.length > 0 ? (
            <div key={grupo.titulo} className="flex flex-col gap-2">
              <div>
                <p className="text-xs font-semibold uppercase text-muted">{grupo.titulo}</p>
                <p className="text-xs text-muted">{grupo.descripcion}</p>
              </div>
              {grupo.solicitudes.map((s) => (
                <div key={s.id} className="rounded-xl bg-bg p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {s.category_name}
                        {s.subcategoria ? " - " + s.subcategoria : ""}
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
                        <span className="rounded-lg bg-surface px-2 py-1 text-muted">
                          Pedido: <strong className="text-fg">{s.cantidad ?? 0} {s.magnitud}</strong>
                        </span>
                        <span className="rounded-lg bg-surface px-2 py-1 text-muted">
                          Comprometido: <strong className="text-fg">{comprometido(s)} {s.magnitud}</strong>
                        </span>
                        <span className="rounded-lg bg-surface px-2 py-1 text-muted">
                          Falta: <strong className="text-fg">{falta(s)} {s.magnitud}</strong>
                        </span>
                      </div>
                      {s.requiere_vehiculo && (
                        <p className="mt-1 text-xs text-muted">Requiere vehiculo</p>
                      )}
                      {s.nota && <p className="mt-1 text-xs text-fg">{s.nota}</p>}
                    </div>
                    <span className="badge shrink-0">{estadoSolicitud(s)}</span>
                  </div>

                  {(s.compromisos_voluntario.length > 0 || s.compromisos_nodo.length > 0) && (
                    <div className="mt-2 flex flex-col gap-2">
                      {s.compromisos_voluntario.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold text-muted">Voluntarios</p>
                          {s.compromisos_voluntario.map((c) => (
                            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2">
                              <span className="min-w-0">
                                {c.nombre || "Voluntario"} - {c.cantidad ? `${c.cantidad} ` : ""}{c.magnitud}
                              </span>
                              <span className="shrink-0 text-right text-xs font-semibold text-muted">
                                {estadoVoluntario(c)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {s.compromisos_nodo.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold text-muted">Centros</p>
                          {s.compromisos_nodo.map((c) => (
                            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2">
                              <span className="min-w-0">
                                {c.nodo_nombre || "Otro centro"} - {c.cantidad ? `${c.cantidad} ` : ""}{c.magnitud} -{" "}
                                {c.tiene_transporte ? "transporte propio" : "sin transporte propio"}
                              </span>
                              <span className="shrink-0 text-right text-xs font-semibold text-muted">
                                {estadoNodo(c)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {s.status === "abierta" &&
                    (eliminandoId === s.id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                        <span className="text-xs text-danger">Eliminar esta solicitud?</span>
                        <button
                          onClick={() => eliminar(s.id)}
                          className="text-xs font-semibold text-danger"
                        >
                          Si, eliminar
                        </button>
                        <button
                          onClick={() => setEliminandoId(null)}
                          className="text-xs font-semibold text-muted"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-3 border-t border-border pt-2">
                        <button
                          onClick={() => empezarEdicion(s)}
                          className="text-xs font-semibold text-accent"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setEliminandoId(s.id)}
                          className="text-xs font-semibold text-danger"
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          ) : null
        )
      )}
    </div>
  );
}
