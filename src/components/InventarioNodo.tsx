"use client";

// Inventario del nodo (issue #22). Dos modos:
//   * admin (soloColaborador=false): edición completa — alta/edición de items con
//     categoría, subcategoría, disponibilidad, magnitud (solo si el tipo del nodo
//     la publica: acopio la exige, mixto la acepta, entrega la oculta) y condición.
//   * colaborador (soloColaborador=true): solo marcar "no hay" y solicitar
//     reposición; no configura (coherente con 0030 y el criterio de aceptación).
// Al marcar agotado se ofrece crear la solicitud automática (solicitar_reposicion).

import { useCallback, useEffect, useState } from "react";
import {
  getCategorias,
  getSubcategorias,
  upsertInventario,
  marcarAgotado,
  solicitarReposicion,
} from "@/lib/api";
import { useInventarioNodo } from "@/hooks/useInventarioNodo";
import {
  Category,
  Subcategory,
  Magnitud,
  MAGNITUD_ORDEN,
  NodeTipo,
} from "@/lib/types";

interface Props {
  nodeId: string;
  token: string;
  tipo: NodeTipo;
  soloColaborador?: boolean;
}

export default function InventarioNodo({ nodeId, token, tipo, soloColaborador = false }: Props) {
  const { items, error: cargaError, refrescar } = useInventarioNodo(nodeId, token);
  const publicaMagnitud = tipo !== "entrega"; // acopio | mixto muestran magnitud
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // --- Formulario de configuración (solo admin) ---
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategory[]>([]);
  const [fCategory, setFCategory] = useState("");
  const [fSubcategory, setFSubcategory] = useState("");
  const [fDisponible, setFDisponible] = useState(true);
  const [fMagnitud, setFMagnitud] = useState<Magnitud | "">("");
  const [fCondicion, setFCondicion] = useState("");
  const [guardando, setGuardando] = useState(false);

  // --- Prompt "¿Solicitar más?" (ambos modos) ---
  const [solicitarFor, setSolicitarFor] = useState<string | null>(null);
  const [solMagnitud, setSolMagnitud] = useState<Magnitud>("unidades");
  const [solVehiculo, setSolVehiculo] = useState(false);

  useEffect(() => {
    if (soloColaborador) return;
    getCategorias().then(setCategorias).catch(() => setCategorias([]));
  }, [soloColaborador]);

  useEffect(() => {
    if (soloColaborador) return;
    // Reset de subcategoría al cambiar la macro + fetch dependiente (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFSubcategory("");
    if (!fCategory) {
      setSubcategorias([]);
      return;
    }
    getSubcategorias(fCategory).then(setSubcategorias).catch(() => setSubcategorias([]));
  }, [fCategory, soloColaborador]);

  const guardar = async () => {
    setError(null);
    setExito(null);
    if (!fCategory) {
      setError("Elige una categoría para el item.");
      return;
    }
    if (tipo === "acopio" && !fMagnitud) {
      setError("Un centro de acopio debe indicar la magnitud del item.");
      return;
    }
    setGuardando(true);
    try {
      await upsertInventario(
        nodeId,
        [
          {
            category_id: fCategory,
            subcategory_id: fSubcategory || null,
            disponible: fDisponible,
            magnitud: publicaMagnitud ? (fMagnitud || null) : null,
            condicion: fCondicion.trim() || null,
          },
        ],
        token
      );
      refrescar();
      setFCategory("");
      setFSubcategory("");
      setFDisponible(true);
      setFCondicion("");
      setFMagnitud("");
      setExito("Item guardado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el item.");
    } finally {
      setGuardando(false);
    }
  };

  const agotar = async (inventoryId: string) => {
    setError(null);
    setExito(null);
    try {
      const r = await marcarAgotado(inventoryId, token);
      refrescar();
      // La app ofrece de inmediato crear la solicitud de reposición.
      if (r.sugerir_solicitud) setSolicitarFor(inventoryId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar como agotado.");
    }
  };

  const solicitar = useCallback(
    async (inventoryId: string) => {
      setError(null);
      setExito(null);
      try {
        await solicitarReposicion(inventoryId, solMagnitud, solVehiculo, token);
        setSolicitarFor(null);
        setSolVehiculo(false);
        setSolMagnitud("unidades");
        setExito("Solicitud de reposicion creada.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear la solicitud.");
      }
    },
    [solMagnitud, solVehiculo, token]
  );

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <p className="text-sm font-semibold text-accent">Inventario del punto</p>
      {(error || cargaError) && (
        <p className="text-sm font-semibold text-danger">{error ?? cargaError}</p>
      )}
      {exito && <p className="text-sm font-semibold text-accent">{exito}</p>}

      {/* Alta/edición (solo admin) */}
      {!soloColaborador && (
        <div className="flex flex-col gap-2 rounded-xl bg-bg p-3">
          <select className="field" value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
            <option value="">Categoría…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="field"
            value={fSubcategory}
            onChange={(e) => setFSubcategory(e.target.value)}
            disabled={!fCategory || subcategorias.length === 0}
          >
            <option value="">Subcategoría (opcional)…</option>
            {subcategorias.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {publicaMagnitud && (
            <select
              className="field"
              value={fMagnitud}
              onChange={(e) => setFMagnitud(e.target.value as Magnitud | "")}
            >
              <option value="">
                {tipo === "acopio" ? "Magnitud…" : "Magnitud (opcional)…"}
              </option>
              {MAGNITUD_ORDEN.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          <input
            className="field"
            placeholder="Condición (ej. Se requiere receta médica)"
            value={fCondicion}
            onChange={(e) => setFCondicion(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fDisponible} onChange={(e) => setFDisponible(e.target.checked)} />
            <span>Disponible</span>
          </label>
          <button onClick={guardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar item"}
          </button>
        </div>
      )}

      {/* Lista de inventario */}
      {items.length === 0 ? (
        <p className="text-sm text-muted">Este punto aún no tiene inventario.</p>
      ) : (
        items.map((it) => (
          <div key={it.id} className="rounded-xl bg-bg p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {it.category?.name ?? "—"}
                  {it.subcategory ? " · " + it.subcategory.name : ""}
                </p>
                <p className="text-xs text-muted">
                  {publicaMagnitud && it.magnitud ? "Magnitud: " + it.magnitud + " · " : ""}
                  {it.disponible ? "Disponible" : "No hay"}
                </p>
                {it.condicion && <p className="mt-1 text-xs text-muted">⚠ {it.condicion}</p>}
              </div>
              {it.disponible && (
                <button onClick={() => agotar(it.id)} className="shrink-0 text-xs font-semibold text-danger">
                  Marcar “no hay”
                </button>
              )}
            </div>

            {/* Prompt de reposición: auto tras agotar, o manual si ya está en "no hay" */}
            {!it.disponible && solicitarFor !== it.id && (
              <button
                onClick={() => setSolicitarFor(it.id)}
                className="mt-2 text-xs font-semibold text-accent"
              >
                ¿Solicitar más?
              </button>
            )}
            {solicitarFor === it.id && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg bg-surface p-2">
                <select
                  className="field"
                  value={solMagnitud}
                  onChange={(e) => setSolMagnitud(e.target.value as Magnitud)}
                >
                  {MAGNITUD_ORDEN.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={solVehiculo} onChange={(e) => setSolVehiculo(e.target.checked)} />
                  <span>Requiere vehículo</span>
                </label>
                <div className="flex gap-2">
                  <button onClick={() => solicitar(it.id)} className="btn-primary text-xs">
                    Solicitar
                  </button>
                  <button onClick={() => setSolicitarFor(null)} className="btn-ghost text-xs">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
