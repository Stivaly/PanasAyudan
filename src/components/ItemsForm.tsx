"use client";

import { Category, ItemData } from "@/lib/types";

export interface ItemDraft {
  category_id: string;
  descripcion: string;
  qty_approx: string;
}

interface Props {
  categorias: Category[];
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
}

export function draftVacio(categorias: Category[]): ItemDraft {
  return {
    category_id: categorias[0]?.id ?? "",
    descripcion: "",
    qty_approx: "",
  };
}

export function draftsValidos(items: ItemDraft[]): ItemData[] | null {
  const limpios: ItemData[] = [];
  for (const it of items) {
    const qty = parseInt(it.qty_approx, 10);
    if (!it.category_id || !it.descripcion.trim() || !Number.isFinite(qty) || qty <= 0) {
      return null;
    }
    limpios.push({
      category_id: it.category_id,
      descripcion: it.descripcion.trim(),
      qty_approx: qty,
    });
  }
  return limpios.length > 0 ? limpios : null;
}

export default function ItemsForm({ categorias, items, onChange }: Props) {
  const update = (idx: number, patch: Partial<ItemDraft>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const add = () => {
    onChange([...items, draftVacio(categorias)]);
  };

  return (
    <div className="flex flex-col gap-4">
      {items.map((it, idx) => (
        <div key={idx} className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">Item {idx + 1}</span>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-sm font-semibold text-danger"
              >
                Quitar
              </button>
            )}
          </div>

          <select
            value={it.category_id}
            onChange={(e) => update(idx, { category_id: e.target.value })}
            className="field"
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={it.descripcion}
            onChange={(e) => update(idx, { descripcion: e.target.value })}
            placeholder="Descripción (ej: cajas de agua 5L)"
            className="field"
          />

          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={it.qty_approx}
            onChange={(e) => update(idx, { qty_approx: e.target.value })}
            placeholder="Cantidad aprox."
            className="field"
          />
        </div>
      ))}

      <button type="button" onClick={add} className="btn-ghost w-full">
        + Agregar item
      </button>
    </div>
  );
}
