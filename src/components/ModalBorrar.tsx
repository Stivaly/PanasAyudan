"use client";

// Modal genérico de doble verificación antes de borrar (issue #80, extraído de
// InventarioNodo). Foco inicial en "Sí, eliminar", cierre con Escape o click
// fuera (bloqueados mientras la RPC está en vuelo).

import { ReactNode, useEffect, useRef } from "react";

interface Props {
  mensaje: ReactNode;
  ocupado: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export default function ModalBorrar({ mensaje, ocupado, onConfirmar, onCancelar }: Props) {
  const confirmarRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmarRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocupado) onCancelar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ocupado, onCancelar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 sm:items-center"
      onClick={() => !ocupado && onCancelar()}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-semibold text-danger">¿Estás seguro?</p>
        <p className="mt-2 text-sm">{mensaje}</p>
        <div className="mt-5 flex gap-2">
          <button
            ref={confirmarRef}
            onClick={onConfirmar}
            disabled={ocupado}
            className="btn-danger flex-1 text-sm disabled:opacity-50"
          >
            {ocupado ? "Eliminando…" : "Sí, eliminar"}
          </button>
          <button
            onClick={onCancelar}
            disabled={ocupado}
            className="btn-ghost flex-1 text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
