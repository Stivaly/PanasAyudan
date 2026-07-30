"use client";

// Selector de centro de acopio de un estado (issue #76). Los cuatro estados que
// puede tener la lista —cargando, falló la carga, no hay centros, y la lista en
// sí— estaban escritos dos veces, y la copia del registro de voluntario no
// distinguía el fallo de red del estado vacío.

import { useId } from "react";
import AvisoCarga from "@/components/AvisoCarga";
import Skeleton from "@/components/Skeleton";
import { CentroAcopio } from "@/lib/types";

interface Props {
  centros: CentroAcopio[];
  valor: string;
  onChange: (centroId: string) => void;
  cargando: boolean;
  error: boolean;
  label?: string;
  // El texto de la opción vacía dice si elegir centro es obligatorio o no.
  placeholder?: string;
}

export default function SelectorCentro({
  centros,
  valor,
  onChange,
  cargando,
  error,
  label = "Centro de acopio",
  placeholder = "Seleccionar centro",
}: Props) {
  const selectId = useId();

  return (
    <>
      <label htmlFor={selectId} className="text-sm font-semibold text-muted">
        {label}
      </label>
      {cargando ? (
        <Skeleton className="h-[52px] w-full" />
      ) : error ? (
        <AvisoCarga>No se pudieron cargar los centros de acopio de este estado.</AvisoCarga>
      ) : centros.length === 0 ? (
        <p className="text-muted text-sm">
          No hay centros de acopio registrados en este estado todavía.
        </p>
      ) : (
        <select
          id={selectId}
          className="field"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
