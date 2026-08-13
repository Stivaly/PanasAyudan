"use client";

// Tarjeta de una solicitud del nodo (issue #80, extraída de SolicitudesNodo).
// Presentacional: cabecera, chips Pedido/Comprometido/Falta, compromisos y el
// strip inline de confirmación de borrado. Los estados vienen de lib/solicitudes.

import FilaCompromiso from "@/components/FilaCompromiso";
import {
  comprometido,
  estadoNodo,
  estadoSolicitud,
  estadoVoluntario,
  falta,
} from "@/lib/solicitudes";
import { SolicitudNodo } from "@/lib/types";

interface Props {
  s: SolicitudNodo;
  eliminando: boolean;
  borrando: boolean;
  onEditar: () => void;
  onPedirEliminar: () => void;
  onConfirmarEliminar: () => void;
  onCancelarEliminar: () => void;
}

export default function TarjetaSolicitud({
  s,
  eliminando,
  borrando,
  onEditar,
  onPedirEliminar,
  onConfirmarEliminar,
  onCancelarEliminar,
}: Props) {
  return (
    <div className="rounded-xl bg-bg p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {s.category_name}
            {s.subcategoria ? " - " + s.subcategoria : ""}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
            <span className="rounded-lg bg-surface px-2 py-1 text-muted">
              Pedido: <strong className="text-fg">{s.cantidad ?? 0} {s.magnitud}</strong>
            </span>
            <span className="rounded-lg bg-surface px-2 py-1 text-muted">
              Comprometido: <strong className="text-fg">{comprometido(s)} {s.magnitud}</strong>
            </span>
            <span className="rounded-lg bg-surface px-2 py-1 text-muted">
              Falta: <strong className="text-fg">{falta(s)} {s.magnitud}</strong>
            </span>
          </div>
          {s.requiere_vehiculo && (
            <p className="mt-1 text-xs text-muted">Requiere vehículo</p>
          )}
          {s.nota && <p className="mt-1 text-xs text-fg">{s.nota}</p>}
        </div>
        <span className="badge shrink-0">{estadoSolicitud(s)}</span>
      </div>

      {(s.compromisos_voluntario.length > 0 || s.compromisos_nodo.length > 0) && (
        <div className="mt-2 flex flex-col gap-2">
          {s.compromisos_voluntario.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted">Voluntarios</p>
              {s.compromisos_voluntario.map((c) => (
                <FilaCompromiso
                  key={c.id}
                  derecha={
                    <span className="shrink-0 text-xs font-semibold text-muted">
                      {estadoVoluntario(c)}
                    </span>
                  }
                >
                  {c.nombre || "Voluntario"} - {c.cantidad ? `${c.cantidad} ` : ""}{c.magnitud}
                </FilaCompromiso>
              ))}
            </div>
          )}

          {s.compromisos_nodo.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted">Centros</p>
              {s.compromisos_nodo.map((c) => (
                <FilaCompromiso
                  key={c.id}
                  derecha={
                    <span className="shrink-0 text-xs font-semibold text-muted">
                      {estadoNodo(c)}
                    </span>
                  }
                >
                  {c.nodo_nombre || "Otro centro"} - {c.cantidad ? `${c.cantidad} ` : ""}{c.magnitud} -{" "}
                  {c.tiene_transporte ? "transporte propio" : "sin transporte propio"}
                </FilaCompromiso>
              ))}
            </div>
          )}
        </div>
      )}

      {s.status === "abierta" &&
        (eliminando ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <span className="text-xs text-danger">Eliminar esta solicitud?</span>
            <button
              onClick={onConfirmarEliminar}
              disabled={borrando}
              className="text-xs font-semibold text-danger disabled:opacity-50"
            >
              {borrando ? "Eliminando…" : "Si, eliminar"}
            </button>
            <button
              onClick={onCancelarEliminar}
              disabled={borrando}
              className="text-xs font-semibold text-muted disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="mt-2 flex gap-3 border-t border-border pt-2">
            <button onClick={onEditar} className="text-xs font-semibold text-accent">
              Editar
            </button>
            <button onClick={onPedirEliminar} className="text-xs font-semibold text-danger">
              Eliminar
            </button>
          </div>
        ))}
    </div>
  );
}
