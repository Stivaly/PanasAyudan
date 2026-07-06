"use client";

// Sección del panel de admin (issue #19): crear solicitudes del nodo y listar
// las existentes con sus compromisos. Vive como sección dentro de la tarjeta de
// cada nodo (no crea una ruta /solicitud/[id] aparte: el issue prioriza
// funcional sobre estructura de rutas). No se expone ubicación de voluntarios.

import { useCallback, useEffect, useState } from "react";
import {
  getCategorias,
  getSubcategorias,
  crearSolicitud,
  listarSolicitudesNodo,
  cancelarCompromiso,
  confirmarEntregaCompromiso,
} from "@/lib/api";
import {
  Category,
  Subcategory,
  Magnitud,
  MAGNITUD_ORDEN,
  SolicitudNodo,
} from "@/lib/types";

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

  const cargar = useCallback(() => {
    listarSolicitudesNodo(nodeId, token)
      .then(setSolicitudes)
      .catch(() => setSolicitudes([]));
  }, [nodeId, token]);

  useEffect(() => {
    getCategorias().then(setCategorias).catch(() => setCategorias([]));
    cargar();
  }, [cargar]);

  // Dropdown de subcategoría dependiente de la macro seleccionada (issue #30).
  useEffect(() => {
    // Reset de la subcategoría al cambiar la macro + fetch dependiente (intencional).
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
      setError("Elige una categoría para la solicitud.");
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
      setSubcategoryId("");
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

  const cancelar = async (compromisoId: string, motivo?: "incumplimiento") => {
    setError(null);
    try {
      await cancelarCompromiso(compromisoId, token, motivo);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar el compromiso.");
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <p className="text-sm font-semibold text-accent">Solicitudes del punto</p>
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {/* Crear solicitud */}
      <div className="flex flex-col gap-2 rounded-xl bg-bg p-3">
        <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Categoría…</option>
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
          <option value="">Subcategoría (opcional)…</option>
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
          <span>Requiere vehículo</span>
        </label>
        <button onClick={crear} disabled={creando} className="btn-primary text-sm disabled:opacity-50">
          {creando ? "Creando…" : "Crear solicitud"}
        </button>
      </div>

      {/* Lista de solicitudes */}
      {solicitudes.length === 0 ? (
        <p className="text-sm text-muted">Este punto aún no tiene solicitudes.</p>
      ) : (
        solicitudes.map((s) => (
          <div key={s.id} className="rounded-xl bg-bg p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {s.category_name}
                  {s.subcategoria ? " · " + s.subcategoria : ""}
                </p>
                <p className="text-xs text-muted">
                  Magnitud: {s.magnitud}
                  {s.requiere_vehiculo ? " · requiere vehículo" : ""}
                  {" · sobrante: " + s.sobrante}
                </p>
              </div>
              <span className="badge shrink-0">{s.status}</span>
            </div>

            {(s.compromisos_voluntario.length > 0 || s.compromisos_nodo.length > 0) && (
              <div className="mt-2 flex flex-col gap-1">
                {s.compromisos_voluntario.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2">
                    <span>
                      🙋 {c.magnitud} · {c.tiempo_estimado_minutos} min ·{" "}
                      <span className="text-muted">{c.status}</span>
                    </span>
                    {c.status === "pendiente" && (
                      <span className="flex gap-1">
                        <button onClick={() => confirmar(c.id)} className="text-xs font-semibold text-accent">
                          Confirmar
                        </button>
                        <button
                          onClick={() => cancelar(c.id, "incumplimiento")}
                          className="text-xs font-semibold text-danger"
                        >
                          Incumplió
                        </button>
                      </span>
                    )}
                  </div>
                ))}
                {s.compromisos_nodo.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2">
                    <span>
                      🏠 {c.magnitud} · {c.tiene_transporte ? "con transporte" : "sin transporte"} ·{" "}
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
        ))
      )}
    </div>
  );
}
