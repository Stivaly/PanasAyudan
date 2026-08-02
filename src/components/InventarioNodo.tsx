"use client";

// Inventario del nodo (issue #22). Dos modos:
//   * admin (soloColaborador=false): edición completa vía FormularioItem.
//   * colaborador (soloColaborador=true): solo marcar "no hay" y solicitar
//     reposición; no configura (coherente con 0030 y el criterio de aceptación).
// Al marcar agotado se ofrece crear la solicitud automática (solicitar_reposicion).
// Partido en FormularioItem / TarjetaItem / ModalBorrar (issue #80); aquí queda
// la carga, los mensajes y la orquestación entre piezas.

import { useState } from "react";
import FormularioItem from "@/components/FormularioItem";
import TarjetaItem from "@/components/TarjetaItem";
import ModalBorrar from "@/components/ModalBorrar";
import { marcarAgotado, eliminarInventario } from "@/lib/api";
import { useInventarioNodo } from "@/hooks/useInventarioNodo";
import { InventarioItem, NodeTipo } from "@/lib/types";

interface Props {
  nodeId: string;
  token: string;
  tipo: NodeTipo;
  soloColaborador?: boolean;
}

export default function InventarioNodo({ nodeId, token, tipo, soloColaborador = false }: Props) {
  const { items, error: cargaError, refrescar } = useInventarioNodo(nodeId, token);
  const publicaMagnitud = tipo !== "entrega"; // acopio | mixto muestran magnitud
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  // Item en edición: FormularioItem lo carga en sus campos; la identidad
  // (categoría/subcategoría) queda fija.
  const [editItem, setEditItem] = useState<InventarioItem | null>(null);
  // Item pendiente de confirmación de borrado (abre el modal "¿Estás seguro?").
  const [borrarItem, setBorrarItem] = useState<InventarioItem | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Anti doble submit (issue #53): id del item cuya RPC de "no hay" está en vuelo.
  const [agotando, setAgotando] = useState<string | null>(null);
  // Tarjeta con el formulario "¿Solicitar más?" abierto (solo uno a la vez).
  const [solicitarFor, setSolicitarFor] = useState<string | null>(null);

  const mostrarError = (mensaje: string) => {
    setExito(null);
    setError(mensaje);
  };

  const mostrarExito = (mensaje: string) => {
    setError(null);
    setExito(mensaje);
  };

  // Elimina el item tras confirmar en el modal (solo admin, revalidado en la RPC).
  const eliminar = async () => {
    if (!borrarItem) return;
    setBorrando(true);
    try {
      await eliminarInventario(borrarItem.id, token);
      // Si estabas editando justo ese item, cierra el formulario de edición.
      if (editItem?.id === borrarItem.id) setEditItem(null);
      setBorrarItem(null);
      refrescar();
      mostrarExito("Item eliminado.");
    } catch (e) {
      mostrarError(e instanceof Error ? e.message : "No se pudo eliminar el item.");
    } finally {
      setBorrando(false);
    }
  };

  const agotar = async (inventoryId: string) => {
    if (agotando === inventoryId) return;
    setError(null);
    setExito(null);
    setAgotando(inventoryId);
    try {
      const r = await marcarAgotado(inventoryId, token);
      refrescar();
      // La app ofrece de inmediato crear la solicitud de reposición.
      if (r.sugerir_solicitud) setSolicitarFor(inventoryId);
    } catch (e) {
      mostrarError(e instanceof Error ? e.message : "No se pudo marcar como agotado.");
    } finally {
      setAgotando(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <p className="text-sm font-semibold text-accent">Inventario del punto</p>
      {(error || cargaError) && (
        <p className="text-sm font-semibold text-danger">{error ?? cargaError}</p>
      )}
      {exito && <p className="text-sm font-semibold text-accent">{exito}</p>}

      {/* Alta/edición (solo admin) */}
      {!soloColaborador && (
        <FormularioItem
          key={editItem?.id ?? "alta"}
          nodeId={nodeId}
          token={token}
          tipo={tipo}
          editItem={editItem}
          onCancelarEdicion={() => setEditItem(null)}
          onGuardado={(mensaje) => {
            refrescar();
            setEditItem(null);
            mostrarExito(mensaje);
          }}
          onError={mostrarError}
        />
      )}

      {/* Lista de inventario */}
      {items.length === 0 ? (
        <p className="text-sm text-muted">Este punto aún no tiene inventario.</p>
      ) : (
        items.map((it) => (
          <TarjetaItem
            key={it.id}
            item={it}
            token={token}
            soloColaborador={soloColaborador}
            publicaMagnitud={publicaMagnitud}
            agotando={agotando === it.id}
            solicitarAbierto={solicitarFor === it.id}
            onAgotar={() => agotar(it.id)}
            onAbrirSolicitar={() => setSolicitarFor(it.id)}
            onCerrarSolicitar={() => setSolicitarFor(null)}
            onEditar={() => {
              setError(null);
              setExito(null);
              setSolicitarFor(null);
              setEditItem(it);
            }}
            onBorrar={() => setBorrarItem(it)}
            onExito={mostrarExito}
            onError={mostrarError}
          />
        ))
      )}

      {/* Modal de doble verificación antes de eliminar (solo admin). */}
      {borrarItem && (
        <ModalBorrar
          ocupado={borrando}
          onConfirmar={eliminar}
          onCancelar={() => setBorrarItem(null)}
          mensaje={
            <>
              Vas a eliminar del inventario{" "}
              <span className="font-semibold">
                {borrarItem.category?.name ?? "este item"}
                {borrarItem.subcategory ? " · " + borrarItem.subcategory.name : ""}
              </span>
              . Esta acción no se puede deshacer.
            </>
          }
        />
      )}
    </div>
  );
}
