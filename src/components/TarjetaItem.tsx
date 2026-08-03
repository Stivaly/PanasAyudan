"use client";

// Tarjeta de un item de inventario (issue #80, extraída de InventarioNodo).
// Incluye el mini-formulario "¿Solicitar más?" del colaborador; sus campos y
// la RPC solicitar_reposicion viven aquí. El padre decide qué tarjeta tiene
// el formulario abierto (solo hay uno a la vez).

import { useId, useState } from "react";
import CantidadMagnitud from "@/components/CantidadMagnitud";
import { solicitarReposicion } from "@/lib/api";
import { validarCantidad } from "@/lib/validaciones";
import { InventarioItem, Magnitud } from "@/lib/types";

interface Props {
  item: InventarioItem;
  token: string;
  soloColaborador: boolean;
  publicaMagnitud: boolean;
  agotando: boolean;
  solicitarAbierto: boolean;
  onAgotar: () => void;
  onAbrirSolicitar: () => void;
  onCerrarSolicitar: () => void;
  onEditar: () => void;
  onBorrar: () => void;
  onExito: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}

export default function TarjetaItem({
  item,
  token,
  soloColaborador,
  publicaMagnitud,
  agotando,
  solicitarAbierto,
  onAgotar,
  onAbrirSolicitar,
  onCerrarSolicitar,
  onEditar,
  onBorrar,
  onExito,
  onError,
}: Props) {
  const idReposicion = useId();
  const [solMagnitud, setSolMagnitud] = useState<Magnitud>("unidades");
  const [solCantidad, setSolCantidad] = useState("");
  const [solVehiculo, setSolVehiculo] = useState(false);
  const [solNota, setSolNota] = useState("");
  // Anti doble submit (issue #53): flag de la RPC de reposición en vuelo.
  const [solicitando, setSolicitando] = useState(false);

  const solicitar = async () => {
    if (solicitando) return;
    const check = validarCantidad(solCantidad);
    if (!check.valida) {
      onError(check.error ?? "Cantidad inválida.");
      return;
    }
    const cant = check.cantidad;
    setSolicitando(true);
    try {
      await solicitarReposicion(item.id, solMagnitud, cant, solVehiculo, token, solNota.trim() || null);
      setSolVehiculo(false);
      setSolMagnitud("unidades");
      setSolCantidad("");
      setSolNota("");
      onCerrarSolicitar();
      onExito("Solicitud de reposicion creada.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo crear la solicitud.");
    } finally {
      setSolicitando(false);
    }
  };

  return (
    <div className="rounded-xl bg-bg p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {item.category?.name ?? "—"}
            {item.subcategory ? " · " + item.subcategory.name : ""}
          </p>
          <p className="text-xs text-muted">
            {publicaMagnitud && item.magnitud
              ? (item.cantidad ? item.cantidad + " " : "") + item.magnitud + " · "
              : ""}
            {item.disponible ? "Disponible" : "No hay"}
          </p>
          {item.nota && <p className="mt-1 text-xs text-fg">💬 {item.nota}</p>}
          {item.condicion && <p className="mt-1 text-xs text-muted">⚠ {item.condicion}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* Reparto por rol: el admin edita el item completo (y agota/repone
              con la casilla "Disponible"); el colaborador solo marca "no hay". */}
          {soloColaborador
            ? item.disponible && (
                <button
                  onClick={onAgotar}
                  disabled={agotando}
                  className="text-xs font-semibold text-danger disabled:opacity-50"
                >
                  {agotando ? "Marcando…" : "Marcar “no hay”"}
                </button>
              )
            : (
                <>
                  <button onClick={onEditar} className="text-xs font-semibold text-accent">
                    Editar
                  </button>
                  <button onClick={onBorrar} className="text-xs font-semibold text-danger">
                    Eliminar
                  </button>
                </>
              )}
        </div>
      </div>

      {/* Reposición atada al item: exclusiva del colaborador. El admin pide a
          la red con "Crear solicitud" (arriba), que cubre este caso. */}
      {soloColaborador && !item.disponible && !solicitarAbierto && (
        <button onClick={onAbrirSolicitar} className="mt-2 text-xs font-semibold text-accent">
          ¿Solicitar más?
        </button>
      )}
      {soloColaborador && solicitarAbierto && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-surface p-2">
          <CantidadMagnitud
            label="Cantidad y magnitud"
            cantidad={solCantidad}
            onCantidad={setSolCantidad}
            magnitud={solMagnitud}
            onMagnitud={(m) => setSolMagnitud(m as Magnitud)}
          />
          <label htmlFor={`${idReposicion}-comentario`} className="text-xs font-semibold text-muted">
            Comentario
          </label>
          <textarea
            id={`${idReposicion}-comentario`}
            className="field min-h-[60px]"
            maxLength={280}
            placeholder="Comentario del pedido (opcional). No incluyas telefonos."
            value={solNota}
            onChange={(e) => setSolNota(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={solVehiculo} onChange={(e) => setSolVehiculo(e.target.checked)} />
            <span>Requiere vehículo</span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={solicitar}
              disabled={solicitando}
              className="btn-primary text-xs disabled:opacity-50"
            >
              {solicitando ? "Solicitando…" : "Solicitar"}
            </button>
            <button
              onClick={onCerrarSolicitar}
              disabled={solicitando}
              className="btn-ghost text-xs disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
