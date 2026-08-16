"use client";

// Formulario de alta/edición de items de inventario del admin (issue #80,
// extraído de InventarioNodo). Dueño de su propio estado: campos, taxonomía
// encadenada y la RPC upsert_inventario. El padre solo pasa el item en
// edición y recibe callbacks de resultado.
//
// El padre lo monta con key={editItem?.id ?? "alta"}: al cambiar de item (o
// salir de edición) el componente se remonta y los useState toman los valores
// del item, sin efectos de sembrado.

import { useEffect, useId, useRef, useState } from "react";
import AvisoCarga from "@/components/AvisoCarga";
import CantidadMagnitud from "@/components/CantidadMagnitud";
import { upsertInventario } from "@/lib/api";
import { validarCantidad } from "@/lib/validaciones";
import { useCategoriasEncadenadas } from "@/hooks/useCategoriasEncadenadas";
import { InventarioItem, Magnitud, NodeTipo } from "@/lib/types";

interface Props {
  nodeId: string;
  token: string;
  tipo: NodeTipo;
  editItem: InventarioItem | null;
  onCancelarEdicion: () => void;
  onGuardado: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}

export default function FormularioItem({
  nodeId,
  token,
  tipo,
  editItem,
  onCancelarEdicion,
  onGuardado,
  onError,
}: Props) {
  const publicaMagnitud = tipo !== "entrega"; // acopio | mixto muestran magnitud
  const idAlta = useId();
  const {
    categorias,
    categoriasError,
    subcategorias,
    subcategoriasError,
    categoryId: fCategory,
    setCategoryId: setFCategory,
    subcategoryId: fSubcategory,
    setSubcategoryId: setFSubcategory,
    reset: resetCategoria,
  } = useCategoriasEncadenadas();
  const [fDisponible, setFDisponible] = useState(editItem?.disponible ?? true);
  const [fMagnitud, setFMagnitud] = useState<Magnitud | "">(editItem?.magnitud ?? "");
  const [fCantidad, setFCantidad] = useState(
    editItem?.cantidad != null ? String(editItem.cantidad) : ""
  );
  const [fCondicion, setFCondicion] = useState(editItem?.condicion ?? "");
  const [fNota, setFNota] = useState(editItem?.nota ?? "");
  const [guardando, setGuardando] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  // Tras guardar un alta el componente no se remonta (la key sigue en "alta"):
  // se limpia a mano.
  const limpiar = () => {
    resetCategoria();
    setFDisponible(true);
    setFMagnitud("");
    setFCantidad("");
    setFCondicion("");
    setFNota("");
  };

  // Al entrar en edición (montaje con item), lleva el formulario a la vista.
  useEffect(() => {
    if (editItem) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editItem]);

  const guardar = async () => {
    // En edición la categoría/subcategoría vienen del item; en alta, de los selects.
    const categoryId = editItem ? editItem.category_id : fCategory;
    const subcategoryId = editItem ? editItem.subcategory_id : (fSubcategory || null);
    if (!categoryId) {
      onError("Elige una categoría para el item.");
      return;
    }
    if (tipo === "acopio" && !fMagnitud) {
      onError("Un centro de acopio debe indicar la magnitud del item.");
      return;
    }
    // La cantidad es obligatoria cuando el item lleva magnitud (acopio | mixto).
    const magnitudFinal = publicaMagnitud ? (fMagnitud || null) : null;
    const checkCantidad = validarCantidad(fCantidad);
    if (magnitudFinal && !checkCantidad.valida) {
      onError(checkCantidad.error ?? "Cantidad inválida.");
      return;
    }
    const cant = checkCantidad.cantidad;
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
      const editando = editItem !== null;
      limpiar();
      onGuardado(editando ? "Cambios guardados." : "Item guardado.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo guardar el item.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      ref={formRef}
      className={
        "flex flex-col gap-2 rounded-xl bg-bg p-3" + (editItem ? " ring-1 ring-accent" : "")
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
          <button onClick={onCancelarEdicion} className="shrink-0 text-xs font-semibold text-muted">
            Cancelar edición
          </button>
        </div>
      ) : (
        <>
          <label htmlFor={`${idAlta}-categoria`} className="text-sm font-semibold text-muted">
            Categoría
          </label>
          <select
            id={`${idAlta}-categoria`}
            className="field"
            value={fCategory}
            onChange={(e) => setFCategory(e.target.value)}
          >
            <option value="">Categoría…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {categoriasError && (
            <AvisoCarga>
              No se pudieron cargar las categorías. Recarga para intentar de nuevo.
            </AvisoCarga>
          )}
          <label htmlFor={`${idAlta}-subcategoria`} className="text-sm font-semibold text-muted">
            Subcategoría
          </label>
          <select
            id={`${idAlta}-subcategoria`}
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
          {subcategoriasError && (
            <AvisoCarga>
              No se pudieron cargar las subcategorías. El campo es opcional; puedes continuar.
            </AvisoCarga>
          )}
        </>
      )}
      {publicaMagnitud && (
        <CantidadMagnitud
          label="Cantidad y magnitud"
          labelClassName="text-sm font-semibold text-muted"
          cantidad={fCantidad}
          onCantidad={setFCantidad}
          magnitud={fMagnitud}
          onMagnitud={setFMagnitud}
          opcionVacia={tipo === "acopio" ? "Magnitud…" : "Magnitud (opcional)…"}
        />
      )}
      <label htmlFor={`${idAlta}-condicion`} className="text-sm font-semibold text-muted">
        Condición
      </label>
      <input
        id={`${idAlta}-condicion`}
        className="field"
        placeholder="Condición (ej. Se requiere receta médica)"
        value={fCondicion}
        onChange={(e) => setFCondicion(e.target.value)}
      />
      <label htmlFor={`${idAlta}-comentario`} className="text-sm font-semibold text-muted">
        Comentario
      </label>
      {/* La advertencia sobre teléfonos sale del placeholder y pasa a texto
          fijo debajo (#164). En el placeholder se cortaba a media frase en
          móvil, y encima desaparecía al escribir la primera letra: justo cuando
          hace falta. Ahora se lee siempre, mientras la persona escribe. */}
      <textarea
        id={`${idAlta}-comentario`}
        className="field min-h-[70px]"
        maxLength={280}
        placeholder="Ej: acetaminofén 500mg, botellas de 1L"
        value={fNota}
        onChange={(e) => setFNota(e.target.value)}
      />
      <p className="-mt-1 text-xs text-muted">
        Describe qué hay exactamente. No incluyas teléfonos.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={fDisponible} onChange={(e) => setFDisponible(e.target.checked)} />
        <span>Disponible</span>
      </label>
      <button onClick={guardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-50">
        {guardando ? "Guardando…" : editItem ? "Guardar cambios" : "Guardar item"}
      </button>
    </div>
  );
}
