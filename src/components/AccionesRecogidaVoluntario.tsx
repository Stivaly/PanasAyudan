"use client";

import Countdown from "@/components/Countdown";
import { Recogida } from "@/lib/types";

interface Props {
  recogida: Recogida;
  onCompletar: (id: string) => void;
  onLiberar: (id: string) => void;
  onConfirmar: (id: string) => void;
  confirmando?: boolean;
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Acciones del voluntario sobre una recogida según su estado:
//  - pendiente: marcar como recogido / liberar.
//  - completada sin confirmar y en plazo: countdown + confirmar entrega.
//  - completada sin confirmar y vencida: aviso de plazo vencido.
//  - confirmada: sello de entrega confirmada.
export default function AccionesRecogidaVoluntario({
  recogida,
  onCompletar,
  onLiberar,
  onConfirmar,
  confirmando,
}: Props) {
  if (recogida.status === "pendiente") {
    return (
      <div className="flex gap-2">
        <button onClick={() => onCompletar(recogida.id)} className="btn-primary flex-1">
          Marcar como recogido
        </button>
        <button onClick={() => onLiberar(recogida.id)} className="btn-danger flex-1">
          Liberar reserva
        </button>
      </div>
    );
  }

  if (recogida.status !== "completada") return null;

  if (recogida.confirmada_at) {
    return (
      <p className="text-sm font-semibold text-green-400">
        ✓ Entrega confirmada · {formatearFecha(recogida.confirmada_at)}
      </p>
    );
  }

  if (!recogida.confirmation_deadline) return null;

  const vencido = new Date(recogida.confirmation_deadline).getTime() < Date.now();
  if (vencido) {
    return (
      <p className="text-sm font-semibold text-danger">⚠ Plazo de confirmación vencido</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">Tiempo para confirmar entrega</span>
        <span className="font-bold">
          <Countdown hasta={recogida.confirmation_deadline} vencidoTexto="Vencido" />
        </span>
      </div>
      <button
        onClick={() => onConfirmar(recogida.id)}
        disabled={confirmando}
        className="btn-primary w-full disabled:opacity-50"
      >
        {confirmando ? "Confirmando..." : "Confirmar entrega recibida"}
      </button>
    </div>
  );
}
