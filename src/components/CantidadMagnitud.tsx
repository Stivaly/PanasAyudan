"use client";

// Par cantidad + magnitud (issue #77).
//
// Estaba repetido en cinco bloques de cuatro componentes: el mismo input
// numérico que filtra dígitos, el mismo select de MAGNITUD_ORDEN y la misma
// validación de "entero mayor a cero" escrita al lado. Las copias ya diferían en
// detalles chicos —una tenía nombre accesible en el select y otra no, unas
// mostraban "Max N" y otras no— que es justo como empieza a divergir una UI.
//
// El componente solo dibuja y filtra la entrada; la validación vive aparte, en
// validarCantidad, porque cada flujo la corre en su propio momento y algunos
// suman reglas extra (por ejemplo, no exceder lo disponible).

import { useId } from "react";
import { MAGNITUD_ORDEN, Magnitud } from "@/lib/types";

interface Props {
  cantidad: string;
  onCantidad: (valor: string) => void;
  magnitud: Magnitud | "";
  onMagnitud: (magnitud: Magnitud | "") => void;
  // Solo para el placeholder ("Max 10"): el tope real lo valida quien llama,
  // que es el único que sabe qué mensaje dar cuando se pasa.
  max?: number | null;
  // Si se pasa, el select admite quedarse sin magnitud y muestra este texto como
  // opción vacía (el alta de inventario acepta items sin magnitud).
  opcionVacia?: string;
  label?: string;
  labelClassName?: string;
  className?: string;
}

export default function CantidadMagnitud({
  cantidad,
  onCantidad,
  magnitud,
  onMagnitud,
  max = null,
  opcionVacia,
  label,
  labelClassName = "text-xs font-semibold text-muted",
  className = "flex gap-2",
}: Props) {
  const cantidadId = useId();

  return (
    <>
      {label && (
        <label htmlFor={cantidadId} className={labelClassName}>
          {label}
        </label>
      )}
      <div className={className}>
        <input
          id={cantidadId}
          className="field w-1/3"
          inputMode="numeric"
          placeholder={max != null && max > 0 ? `Max ${max}` : "Cantidad"}
          value={cantidad}
          onChange={(e) => onCantidad(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <select
          aria-label="Magnitud"
          className="field flex-1"
          value={magnitud}
          onChange={(e) => onMagnitud(e.target.value as Magnitud | "")}
        >
          {opcionVacia && <option value="">{opcionVacia}</option>}
          {MAGNITUD_ORDEN.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
