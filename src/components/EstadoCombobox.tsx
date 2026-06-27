"use client";

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
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-muted">{label}</label>
      <select
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
            {estado.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
