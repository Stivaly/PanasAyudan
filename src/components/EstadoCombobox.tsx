"use client";

import { useId } from "react";
import { formatEstadoNombre } from "@/lib/estados";
import { EstadoVenezuela } from "@/lib/types";

interface Props {
  estados: EstadoVenezuela[];
  estadoId: string | null;
  onChange: (estadoId: string | null) => void;
  includeTodos?: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export default function EstadoCombobox({
  estados,
  estadoId,
  onChange,
  includeTodos = false,
  label = "Estado",
  placeholder = "Elige un estado",
  required = false,
}: Props) {
  // useId y no un literal: este combobox se monta varias veces en la misma
  // pantalla (registro de voluntario, panel de superadmin), y dos ids iguales
  // harían que el label apunte siempre al primer select.
  const selectId = useId();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-sm font-semibold text-muted">
        {label}
      </label>
      <select
        id={selectId}
        value={estadoId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        required={required}
        className="field"
      >
        {includeTodos ? (
          <option value="">Todos los estados</option>
        ) : (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {estados.map((estado) => (
          <option key={estado.id} value={estado.id}>
            {formatEstadoNombre(estado.nombre)}
          </option>
        ))}
      </select>
    </div>
  );
}
