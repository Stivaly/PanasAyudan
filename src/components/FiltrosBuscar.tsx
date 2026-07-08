"use client";

// Barra de filtros compacta de /buscar (issue #24). Reemplaza la nube de píldoras
// (que crecía en vertical con las 10 macrocategorías) por dos desplegables en una
// sola fila: estado de Venezuela + categoría. Ocupa una línea en móvil.

import { formatEstadoNombre } from "@/lib/estados";
import { Category, EstadoVenezuela } from "@/lib/types";

interface Props {
  estados: EstadoVenezuela[];
  categorias: Category[];
  estadoId: string | null;
  categoria: string | null;
  onEstado: (id: string | null) => void;
  onCategoria: (slug: string | null) => void;
}

export default function FiltrosBuscar({
  estados,
  categorias,
  estadoId,
  categoria,
  onEstado,
  onCategoria,
}: Props) {
  return (
    <div className="flex gap-2">
      <select
        className="field flex-1"
        value={estadoId ?? ""}
        onChange={(e) => onEstado(e.target.value || null)}
        aria-label="Filtrar por estado"
      >
        <option value="">Todo el país</option>
        {estados.map((e) => (
          <option key={e.id} value={e.id}>
            {formatEstadoNombre(e.nombre)}
          </option>
        ))}
      </select>
      <select
        className="field flex-1"
        value={categoria ?? ""}
        onChange={(e) => onCategoria(e.target.value || null)}
        aria-label="Filtrar por categoría"
      >
        <option value="">Todas las categorías</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
