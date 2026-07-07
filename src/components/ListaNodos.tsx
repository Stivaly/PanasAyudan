"use client";

// Lista pública de nodos (issue #24). Vista por defecto de /buscar: nombre, badge de
// estado (pausado con su granularidad) y las macrocategorías disponibles. Sin
// cantidades, sin contactos. Al tocar un nodo se navega a su detalle /nodo/[id].

import Link from "next/link";
import { NodoPublico, descripcionPausa, statusVisible } from "@/lib/types";

interface Props {
  nodos: NodoPublico[];
}

const TIPO_LABEL: Record<string, string> = {
  acopio: "Centro de acopio",
  entrega: "Punto de entrega",
  mixto: "Acopio y entrega",
};

export default function ListaNodos({ nodos }: Props) {
  return (
    <ul className="flex flex-col gap-3">
      {nodos.map((n) => {
        const pausa = descripcionPausa(n);
        const pausado = statusVisible(n) === "pausado";
        return (
          <li key={n.id}>
            <Link
              href={`/nodo/${n.id}`}
              className="card flex flex-col gap-2 active:bg-neutral-800"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{n.nombre}</span>
                {pausado ? (
                  <span className="badge shrink-0 border-amber-500 text-amber-400">
                    Pausado{pausa ? `: ${pausa}` : ""}
                  </span>
                ) : (
                  <span className="badge shrink-0 border-accent text-accent">Operativo</span>
                )}
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {TIPO_LABEL[n.tipo] ?? n.tipo}
              </span>
              {n.categorias.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {n.categorias.map((c) => (
                    <span key={c.id} className="badge">
                      {c.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted">Sin categorías publicadas por ahora.</span>
              )}
              {n.direccion && <span className="text-xs text-muted">{n.direccion}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
