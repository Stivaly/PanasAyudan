"use client";

import { Category, ItemData } from "@/lib/types";

export const QTY_MAX = 999;

export interface ItemDraft {
  category_id: string;
  descripcion: string;
  qty_approx: number | "";
}

// Mensaje de error inline para la cantidad; null si es válida o está vacía.
function errorCantidad(qty: number | ""): string | null {
  if (qty === "") return null;
  if (qty < 1) return "La cantidad mínima es 1";
  if (qty > QTY_MAX) return `La cantidad máxima es ${QTY_MAX.toLocaleString("es-VE")}`;
  return null;
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
    const qty = typeof it.qty_approx === "number" ? it.qty_approx : NaN;
    if (
      !it.category_id ||
      !it.descripcion.trim() ||
      !Number.isInteger(qty) ||
      qty < 1 ||
      qty > QTY_MAX
    ) {
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

  // Cantidad máxima de dígitos que se pueden escribir (QTY_MAX tiene 3).
  const MAX_DIGITOS = String(QTY_MAX).length;

  // Bloquea cualquier tecla que no produzca un entero positivo y limita la
  // cantidad de dígitos a MAX_DIGITOS.
  const soloEnteros = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const esDigito = /^\d$/.test(e.key);
    if (
      !esDigito &&
      !["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
        e.key
      )
    ) {
      e.preventDefault();
      return;
    }
    // Si ya hay MAX_DIGITOS y no se está reemplazando una selección, bloquear.
    if (esDigito) {
      const input = e.currentTarget;
      const haySeleccion = (input.selectionStart ?? 0) !== (input.selectionEnd ?? 0);
      if (input.value.length >= MAX_DIGITOS && !haySeleccion) {
        e.preventDefault();
      }
    }
  };

  // Pega solo los dígitos del portapapeles, respetando la posición del cursor.
  // No usa execCommand: actualiza el estado directamente para no romper en
  // navegadores que no lo soportan.
  const alPegar = (idx: number, it: ItemDraft) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const soloDigitos = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!soloDigitos) return;
    const input = e.currentTarget;
    const actual = it.qty_approx === "" ? "" : String(it.qty_approx);
    const start = input.selectionStart ?? actual.length;
    const end = input.selectionEnd ?? actual.length;
    const nuevo = (actual.slice(0, start) + soloDigitos + actual.slice(end)).slice(0, MAX_DIGITOS);
    const parsed = parseInt(nuevo, 10);
    update(idx, { qty_approx: Number.isNaN(parsed) ? "" : parsed });
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
            min="1"
            max={QTY_MAX}
            step="1"
            value={it.qty_approx}
            onKeyDown={soloEnteros}
            onPaste={alPegar(idx, it)}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              update(idx, { qty_approx: Number.isNaN(parsed) ? "" : parsed });
            }}
            placeholder="Cantidad aprox."
            className="field"
          />
          {errorCantidad(it.qty_approx) && (
            <p className="text-sm font-semibold text-danger">{errorCantidad(it.qty_approx)}</p>
          )}
        </div>
      ))}

      <button type="button" onClick={add} className="btn-ghost w-full">
        + Agregar item
      </button>
    </div>
  );
}
