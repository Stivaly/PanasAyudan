"use client";

// Formulario crear/editar de solicitudes del nodo (issue #80, extraído de
// SolicitudesNodo). Dueño de su propio estado: campos, taxonomía encadenada y
// las RPCs crear/editar. El padre pasa la solicitud en edición y callbacks.
//
// El padre lo monta con key={editando?.id ?? "nueva"}: al cambiar de solicitud
// (o salir de edición) el componente se remonta y los useState toman los
// valores de la solicitud, sin efectos de sembrado.

import { useEffect, useId, useRef, useState } from "react";
import AvisoCarga from "@/components/AvisoCarga";
import CantidadMagnitud from "@/components/CantidadMagnitud";
import { crearSolicitud, editarSolicitud } from "@/lib/api";
import { validarCantidad } from "@/lib/validaciones";
import { useCategoriasEncadenadas } from "@/hooks/useCategoriasEncadenadas";
import { Magnitud, SolicitudNodo } from "@/lib/types";

interface Props {
  nodeId: string;
  token: string;
  editando: SolicitudNodo | null;
  onGuardado: () => void;
  onCancelar: () => void;
  onError: (mensaje: string) => void;
}

export default function FormularioSolicitud({
  nodeId,
  token,
  editando,
  onGuardado,
  onCancelar,
  onError,
}: Props) {
  const idForm = useId();
  const {
    categorias,
    categoriasError,
    subcategorias,
    subcategoriasError,
    categoryId,
    setCategoryId,
    subcategoryId,
    setSubcategoryId,
    reset: resetCategoria,
  } = useCategoriasEncadenadas(true, editando?.category_id ?? "");
  const [magnitud, setMagnitud] = useState<Magnitud>(editando?.magnitud ?? "unidades");
  const [cantidad, setCantidad] = useState(editando?.cantidad ? String(editando.cantidad) : "");
  const [nota, setNota] = useState(editando?.nota ?? "");
  const [requiereVehiculo, setRequiereVehiculo] = useState(editando?.requiere_vehiculo ?? false);
  const [creando, setCreando] = useState(false);
  // Subcategoría pendiente de seleccionar hasta que cargue la lista encadenada.
  const [subPendiente, setSubPendiente] = useState<string | null>(
    editando?.subcategory_id ?? null
  );
  const formRef = useRef<HTMLDivElement>(null);

  // Tras crear una solicitud el componente no se remonta (la key sigue en
  // "nueva"): se limpia a mano.
  const limpiar = () => {
    setSubPendiente(null);
    resetCategoria();
    setMagnitud("unidades");
    setCantidad("");
    setNota("");
    setRequiereVehiculo(false);
  };

  // Al entrar en edición (montaje con solicitud), lleva el formulario a la vista.
  useEffect(() => {
    if (editando) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editando]);

  useEffect(() => {
    if (subPendiente && subcategorias.some((s) => s.id === subPendiente)) {
      // Sincroniza el selector con la subcategoria pendiente ya cargada.
      setSubcategoryId(subPendiente);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubPendiente(null);
    }
  }, [subPendiente, subcategorias, setSubcategoryId]);

  const guardar = async () => {
    if (!categoryId) {
      onError("Elige una categoría para la solicitud.");
      return;
    }
    const check = validarCantidad(cantidad);
    if (!check.valida) {
      onError(check.error ?? "Cantidad inválida.");
      return;
    }
    const cant = check.cantidad;
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
      if (editando) {
        await editarSolicitud(editando.id, datos, token);
      } else {
        await crearSolicitud(nodeId, datos, token);
      }
      limpiar();
      onGuardado();
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : editando
          ? "No se pudo editar la solicitud."
          : "No se pudo crear la solicitud."
      );
    } finally {
      setCreando(false);
    }
  };

  return (
    <>
      <div>
        <p className="text-sm font-semibold text-accent">
          {editando ? "Editar solicitud" : "Pedir insumos"}
        </p>
        <p className="mt-1 text-xs text-muted">
          {editando
            ? "Corrige los datos del pedido. Solo se pueden editar solicitudes abiertas sin compromisos."
            : "Crea pedidos para este punto y revisa quien ya prometio ayuda."}
        </p>
      </div>

      <div ref={formRef} className="flex flex-col gap-2 rounded-xl bg-bg p-3">
        <label htmlFor={`${idForm}-categoria`} className="text-sm font-semibold text-muted">
          Categoría
        </label>
        <select
          id={`${idForm}-categoria`}
          className="field"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Categoría...</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {categoriasError && (
          <AvisoCarga>
            No se pudieron cargar las categorías. Recarga para intentar de nuevo.
          </AvisoCarga>
        )}
        <label htmlFor={`${idForm}-subcategoria`} className="text-sm font-semibold text-muted">
          Subcategoría
        </label>
        <select
          id={`${idForm}-subcategoria`}
          className="field"
          value={subcategoryId}
          onChange={(e) => setSubcategoryId(e.target.value)}
          disabled={!categoryId || subcategorias.length === 0}
        >
          <option value="">Subcategoría (opcional)...</option>
          {subcategorias.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {subcategoriasError && (
          <AvisoCarga>
            No se pudieron cargar las subcategorías. El campo es opcional; puedes continuar.
          </AvisoCarga>
        )}
        <CantidadMagnitud
          label="Cantidad y magnitud"
          labelClassName="text-sm font-semibold text-muted"
          cantidad={cantidad}
          onCantidad={setCantidad}
          magnitud={magnitud}
          onMagnitud={(m) => setMagnitud(m as Magnitud)}
        />
        <label htmlFor={`${idForm}-comentario`} className="text-sm font-semibold text-muted">
          Comentario
        </label>
        {/* Ver FormularioItem: la advertencia sobre teléfonos va fija debajo,
            no en el placeholder que se corta y luego desaparece al escribir. */}
        <textarea
          id={`${idForm}-comentario`}
          className="field min-h-[70px]"
          maxLength={280}
          placeholder="Ej: insulina NPH 100UI"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <p className="-mt-1 text-xs text-muted">
          Describe qué se necesita exactamente. No incluyas teléfonos.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={requiereVehiculo}
            onChange={(e) => setRequiereVehiculo(e.target.checked)}
          />
          <span>Requiere vehículo</span>
        </label>
        <div className="flex gap-2">
          <button
            onClick={guardar}
            disabled={creando}
            className="btn-primary flex-1 text-sm disabled:opacity-50"
          >
            {creando ? "Guardando..." : editando ? "Guardar cambios" : "Crear solicitud"}
          </button>
          {editando && (
            <button
              onClick={onCancelar}
              disabled={creando}
              className="btn-ghost text-sm disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </>
  );
}
