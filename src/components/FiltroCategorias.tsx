"use client";

import { Category } from "@/lib/types";

interface Props {
  categorias: Category[];
  activa: string | null;
  onChange: (slug: string | null) => void;
}

export default function FiltroCategorias({ categorias, activa, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2 py-2">
      <button
        onClick={() => onChange(null)}
        className={`rounded-full px-4 py-2 text-sm font-semibold ${
          activa === null ? "bg-accent text-black" : "border border-border bg-surface text-white"
        }`}
      >
        Todas
      </button>
      {categorias.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.slug)}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            activa === cat.slug
              ? "bg-accent text-black"
              : "border border-border bg-surface text-white"
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
