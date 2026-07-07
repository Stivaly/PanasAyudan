"use client";

// Inventario del nodo (issue #22). Dos modos:
//   * admin (soloColaborador=false): edición completa — alta/edición de items con
//     categoría, subcategoría, disponibilidad, magnitud (solo si el tipo del nodo
//     la publica: acopio la exige, mixto la acepta, entrega la oculta) y condición.
//   * colaborador (soloColaborador=true): solo marcar "no hay" y solicitar
//     reposición; no configura (coherente con 0030 y el criterio de aceptación).
// Al marcar agotado se ofrece crear la solicitud automática (solicitar_reposicion).

import { useCallback, useEffect, useRef, useState } from "react";
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
  InventarioItem,
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
  const [fCantidad, setFCantidad] = useState("");
  const [fCondicion, setFCondicion] = useState("");
  const [fNota, setFNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Item en edición: cuando está definido, el formulario superior edita ese item
  // en vez de crear uno nuevo. La categoría/subcategoría son la identidad del item
  // (unique node_id+category+subcategory) y quedan fijas; el resto es editable,
  // incluido "Disponible" (así se repone stock tras un "no hay").
  const [editItem, setEditItem] = useState<InventarioItem | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  // --- Prompt "¿Solicitar más?" (ambos modos) ---
  const [solicitarFor, setSolicitarFor] = useState<string | null>(null);
  const [solMagnitud, setSolMagnitud] = useState<Magnitud>("unidades");
  const [solCantidad, setSolCantidad] = useState("");
  const [solVehiculo, setSolVehiculo] = useState(false);
  const [solNota, setSolNota] = useState("");

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

  const limpiarFormulario = () => {
    setEditItem(null);
    setFCategory("");
    setFSubcategory("");
    setFDisponible(true);
    setFCondicion("");
    setFNota("");
    setFMagnitud("");
    setFCantidad("");
  };

  // Carga un item existente en el formulario superior para editarlo. La identidad
  // (categoría/subcategoría) se conserva vía editItem; los selects quedan fijos.
  const iniciarEdicion = (it: InventarioItem) => {
    setError(null);
    setExito(null);
    setSolicitarFor(null);
    setEditItem(it);
    setFDisponible(it.disponible);
    setFMagnitud(it.magnitud ?? "");
    setFCantidad(it.cantidad != null ? String(it.cantidad) : "");
    setFCondicion(it.condicion ?? "");
    setFNota(it.nota ?? "");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const guardar = async () => {
    setError(null);
    setExito(null);
    // En edición la categoría/subcategoría vienen del item; en alta, de los selects.
    const categoryId = editItem ? editItem.category_id : fCategory;
    const subcategoryId = editItem ? editItem.subcategory_id : (fSubcategory || null);
    if (!categoryId) {
      setError("Elige una categoría para el item.");
      return;
    }
    if (tipo === "acopio" && !fMagnitud) {
      setError("Un centro de acopio debe indicar la magnitud del item.");
      return;
    }
    // La cantidad es obligatoria cuando el item lleva magnitud (acopio | mixto).
    const magnitudFinal = publicaMagnitud ? (fMagnitud || null) : null;
    const cant = Number(fCantidad);
    if (magnitudFinal && (!fCantidad.trim() || !Number.isInteger(cant) || cant <= 0)) {
      setError("Indica la cantidad (numero entero mayor a cero).");
      return;
    }
    setGuardando(true);
    try {
      await upsertInventario(
        nodeId,
        [
          {
            category_id: categoryId,
            subcategory_id: subcategoryId,
            disponible: fDisponible,
            magnitud: magnitudFinal,
            cantidad: magnitudFinal ? cant : null,
            condicion: fCondicion.trim() || null,
            nota: fNota.trim() || null,
          },
        ],
        token
      );
      refrescar();
      const editando = editItem !== null;
      limpiarFormulario();
      setExito(editando ? "Cambios guardados." : "Item guardado.");
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
      const cant = Number(solCantidad);
      if (!solCantidad.trim() || !Number.isInteger(cant) || cant <= 0) {
        setError("Indica la cantidad (numero entero mayor a cero).");
        return;
      }
      try {
        await solicitarReposicion(inventoryId, solMagnitud, cant, solVehiculo, token, solNota.trim() || null);
        setSolicitarFor(null);
        setSolVehiculo(false);
        setSolMagnitud("unidades");
        setSolCantidad("");
        setSolNota("");
        setExito("Solicitud de reposicion creada.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear la solicitud.");
      }
    },
    [solMagnitud, solCantidad, solVehiculo, solNota, token]
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
        <div
          ref={formRef}
          className={
            "flex flex-col gap-2 rounded-xl bg-bg p-3" +
            (editItem ? " ring-1 ring-accent" : "")
          }
        >
          {editItem ? (
            // En edición la identidad (categoría/subcategoría) es fija: se muestra
            // como texto y no se puede cambiar (crearía otro item distinto).
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-accent">Editando item</p>
                <p className="font-semibold">
                  {editItem.category?.name ?? "—"}
                  {editItem.subcategory ? " · " + editItem.subcategory.name : ""}
                </p>
              </div>
              <button
                onClick={limpiarFormulario}
                className="shrink-0 text-xs font-semibold text-muted"
              >
                Cancelar edición
              </button>
            </div>
          ) : (
            <>
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
            </>
          )}
          {publicaMagnitud && (
            <div className="flex gap-2">
              <input
                className="field w-1/3"
                inputMode="numeric"
                placeholder="Cantidad"
                value={fCantidad}
                onChange={(e) => setFCantidad(e.target.value.replace(/[^0-9]/g, ""))}
              />
              <select
                className="field flex-1"
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
            </div>
          )}
          <input
            className="field"
            placeholder="Condición (ej. Se requiere receta médica)"
            value={fCondicion}
            onChange={(e) => setFCondicion(e.target.value)}
          />
          <textarea
            className="field min-h-[70px]"
            maxLength={280}
            placeholder="Comentario: qué hay exactamente (ej. acetaminofén 500mg, botellas de 1L). No incluyas telefonos."
            value={fNota}
            onChange={(e) => setFNota(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fDisponible} onChange={(e) => setFDisponible(e.target.checked)} />
            <span>Disponible</span>
          </label>
          <button onClick={guardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-50">
            {guardando ? "Guardando…" : editItem ? "Guardar cambios" : "Guardar item"}
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
                  {publicaMagnitud && it.magnitud
                    ? (it.cantidad ? it.cantidad + " " : "") + it.magnitud + " · "
                    : ""}
                  {it.disponible ? "Disponible" : "No hay"}
                </p>
                {it.nota && <p className="mt-1 text-xs text-white">💬 {it.nota}</p>}
                {it.condicion && <p className="mt-1 text-xs text-muted">⚠ {it.condicion}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {/* Reparto por rol: el admin edita el item completo (y agota/repone
                    con la casilla "Disponible"); el colaborador solo marca "no hay". */}
                {soloColaborador
                  ? it.disponible && (
                      <button onClick={() => agotar(it.id)} className="text-xs font-semibold text-danger">
                        Marcar “no hay”
                      </button>
                    )
                  : (
                      <button
                        onClick={() => iniciarEdicion(it)}
                        className="text-xs font-semibold text-accent"
                      >
                        Editar
                      </button>
                    )}
              </div>
            </div>

            {/* Reposición atada al item: exclusiva del colaborador. El admin pide a
                la red con "Crear solicitud" (arriba), que cubre este caso. */}
            {soloColaborador && !it.disponible && solicitarFor !== it.id && (
              <button
                onClick={() => setSolicitarFor(it.id)}
                className="mt-2 text-xs font-semibold text-accent"
              >
                ¿Solicitar más?
              </button>
            )}
            {soloColaborador && solicitarFor === it.id && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg bg-surface p-2">
                <div className="flex gap-2">
                  <input
                    className="field w-1/3"
                    inputMode="numeric"
                    placeholder="Cantidad"
                    value={solCantidad}
                    onChange={(e) => setSolCantidad(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <select
                    className="field flex-1"
                    value={solMagnitud}
                    onChange={(e) => setSolMagnitud(e.target.value as Magnitud)}
                  >
                    {MAGNITUD_ORDEN.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  className="field min-h-[60px]"
                  maxLength={280}
                  placeholder="Comentario del pedido (opcional). No incluyas telefonos."
                  value={solNota}
                  onChange={(e) => setSolNota(e.target.value)}
                />
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
