"use client";

import Link from "next/link";
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
                <span className="shrink-0 rounded-full bg-bg px-2 py-1 text-xs text-muted">
                  {totalItems} {totalItems === 1 ? "item" : "items"}
                </span>
              </div>
              <span className="text-sm text-accent">{categorias.join(" - ")}</span>
              {p.location.estado && (
                <span className="text-xs font-semibold text-muted">{p.location.estado.nombre}</span>
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
