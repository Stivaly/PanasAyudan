"use client";

import { useEffect, useId, useState } from "react";
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

function normalizar(valor: string) {
  return valor.trim().toLocaleLowerCase("es-VE");
}

export default function EstadoCombobox({
  estados,
  estadoId,
  onChange,
  includeTodos = false,
  label = "Estado",
  placeholder = "Busca o elige un estado",
  required = false,
}: Props) {
  const datalistId = useId();
  const seleccionado = estados.find((estado) => estado.id === estadoId) ?? null;
  const [texto, setTexto] = useState(includeTodos ? "Todos los estados" : "");

  useEffect(() => {
    if (seleccionado) {
      setTexto(seleccionado.nombre);
      return;
    }
  }, [includeTodos, seleccionado]);

  const cambiarTexto = (valor: string) => {
    setTexto(valor);
    const limpio = normalizar(valor);

    if (includeTodos && (!limpio || limpio === normalizar("Todos los estados"))) {
      onChange(null);
      return;
    }

    const match = estados.find((estado) => normalizar(estado.nombre) === limpio);
    onChange(match?.id ?? null);
  };

  const sinCoincidencia = texto.trim() !== "" && !seleccionado && !(includeTodos && normalizar(texto) === normalizar("Todos los estados"));

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-muted">{label}</label>
      <input
        type="text"
        list={datalistId}
        value={texto}
        onChange={(e) => cambiarTexto(e.target.value)}
        onFocus={() => {
          if (includeTodos && texto === "Todos los estados") setTexto("");
        }}
        onBlur={() => {
          if (includeTodos && texto.trim() === "") {
            setTexto("Todos los estados");
            onChange(null);
          }
        }}
        placeholder={placeholder}
        required={required}
        className="field"
      />
      <datalist id={datalistId}>
        {includeTodos && <option value="Todos los estados" />}
        {estados.map((estado) => (
          <option key={estado.id} value={estado.nombre} />
        ))}
      </datalist>
      {sinCoincidencia && (
        <p className="text-xs text-muted">Elige una opción de la lista para aplicar este estado.</p>
      )}
    </div>
  );
}
