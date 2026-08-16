"use client";

// Tarjeta de un item de inventario (issue #80, extraída de InventarioNodo).
// Incluye el mini-formulario "¿Solicitar más?" del colaborador; sus campos y
// la RPC solicitar_reposicion viven aquí. El padre decide qué tarjeta tiene
// el formulario abierto (solo hay uno a la vez).

import { useId, useState } from "react";
import CantidadMagnitud from "@/components/CantidadMagnitud";
import { ACCION_TEXTO } from "@/lib/estilos";
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

  // El colaborador puede quedarse sin acciones: cuando el item ya está en "no
  // hay" y el formulario de reposición está abierto no hay nada que ofrecer, y
  // la barra con su línea divisoria sobraría.
  const hayAcciones = soloColaborador
    ? item.disponible || !solicitarAbierto
    : true;

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

      {/* Las acciones van debajo, no al costado. Al costado eran una columna
          rígida que le robaba casi la mitad del ancho al texto del insumo: con
          "Marcar “no hay”" el título partía en dos líneas y la condición caía
          en una tira de ~55% del ancho (issue #157). Mismo patrón que usa la
          tarjeta de solicitud para Editar/Eliminar.

          Reparto por rol: el admin edita el item completo (y agota/repone con
          la casilla "Disponible"); el colaborador solo marca "no hay" y, si ya
          no hay, pide reposición. */}
      {hayAcciones && (
        <div className="mt-2 flex flex-wrap gap-3 border-t border-border pt-2">
          {soloColaborador ? (
            <>
              {item.disponible && (
                <button
                  onClick={onAgotar}
                  disabled={agotando}
                  className={`${ACCION_TEXTO} text-danger disabled:opacity-50`}
                >
                  {agotando ? "Marcando…" : "Marcar “no hay”"}
                </button>
              )}
              {/* Reposición atada al item: exclusiva del colaborador. El admin
                  pide a la red con "Crear solicitud" (arriba). */}
              {!item.disponible && !solicitarAbierto && (
                <button onClick={onAbrirSolicitar} className={`${ACCION_TEXTO} text-accent`}>
                  ¿Solicitar más?
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={onEditar} className={`${ACCION_TEXTO} text-accent`}>
                Editar
              </button>
              <button onClick={onBorrar} className={`${ACCION_TEXTO} text-danger`}>
                Eliminar
              </button>
            </>
          )}
        </div>
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
          {/* Ver FormularioItem: la advertencia sobre teléfonos va fija debajo,
              no en el placeholder que se corta y luego desaparece al escribir. */}
          <textarea
            id={`${idReposicion}-comentario`}
            className="field min-h-[60px]"
            maxLength={280}
            placeholder="Ej: 20 cajas para el ambulatorio"
            value={solNota}
            onChange={(e) => setSolNota(e.target.value)}
          />
          <p className="-mt-1 text-xs text-muted">Opcional. No incluyas teléfonos.</p>
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
