"use client";

import Link from "next/link";
import { formatEstadoNombre } from "@/lib/estados";
import { PuntoMapa } from "@/hooks/useItemsRealtime";

interface Props {
  puntos: PuntoMapa[];
}

export default function ListaLugares({ puntos }: Props) {
  return (
    <ul className="flex flex-col gap-3">
      {puntos.map((p) => {
        const categorias = Array.from(
          new Set(p.items.map((i) => i.item.category.name))
        );
        const totalItems = p.items.length;
        return (
          <li key={p.location.id}>
            <Link
              href={`/lugar/${p.location.id}`}
              className="card flex flex-col gap-1 active:bg-neutral-800"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{p.location.place_name}</span>
                <span className="badge shrink-0">
                  {totalItems} {totalItems === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {categorias.map((c) => (
                  <span key={c} className="badge">
                    {c}
                  </span>
                ))}
              </div>
              {p.location.estado && (
                <span className="badge self-start">{formatEstadoNombre(p.location.estado.nombre)}</span>
              )}
              {p.location.address && (
                <span className="text-xs text-muted">{p.location.address}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
