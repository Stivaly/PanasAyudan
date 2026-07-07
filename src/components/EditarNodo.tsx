"use client";

// Edición de los datos de un nodo por su admin (issue #29). Los campos de texto
// (nombre, tipo, dirección, estado, horario, descripción) se editan libremente.
// La ubicación es aparte: cambiar el pin devuelve el nodo a 'inactivo' y exige
// re-verificar el GPS (VerificarNodo, ya renderizado en la tarjeta del panel).

import { useState } from "react";
import { editarNodo } from "@/lib/api";
import EstadoCombobox from "./EstadoCombobox";
import UbicacionPicker, { UbicacionSeleccion } from "./UbicacionPicker";
import { EditarNodoDatos, EstadoVenezuela, NodeTipo, NodoAdmin } from "@/lib/types";

interface Props {
  nodo: NodoAdmin;
  estados: EstadoVenezuela[];
  token: string;
  onSaved: () => void;
}

export default function EditarNodo({ nodo, estados, token, onSaved }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(nodo.nombre);
  const [tipo, setTipo] = useState<NodeTipo>(nodo.tipo);
  const [direccion, setDireccion] = useState(nodo.direccion);
  const [estadoId, setEstadoId] = useState<string | null>(nodo.estado_id);
  const [horario, setHorario] = useState(nodo.horario ?? "");
  const [descripcion, setDescripcion] = useState(nodo.descripcion ?? "");
  const [cambiarUbi, setCambiarUbi] = useState(false);
  const [nuevaUbi, setNuevaUbi] = useState<UbicacionSeleccion | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Al abrir, re-sincroniza los campos con los datos actuales del nodo (por si
  // se recargó la lista tras un guardado previo).
  const abrir = () => {
    setNombre(nodo.nombre);
    setTipo(nodo.tipo);
    setDireccion(nodo.direccion);
    setEstadoId(nodo.estado_id);
    setHorario(nodo.horario ?? "");
    setDescripcion(nodo.descripcion ?? "");
    setCambiarUbi(false);
    setNuevaUbi(null);
    setError(null);
    setAviso(null);
    setAbierto(true);
  };

  const guardar = async () => {
    setError(null);
    setAviso(null);
    if (!nombre.trim()) {
      setError("El nombre del punto es obligatorio.");
      return;
    }
    if (!estadoId) {
      setError("El estado es obligatorio.");
      return;
    }
    const direccionFinal = nuevaUbi ? nuevaUbi.direccion : direccion.trim();
    if (!direccionFinal) {
      setError("La dirección del punto es obligatoria.");
      return;
    }

    const datos: EditarNodoDatos = {
      nombre: nombre.trim(),
      tipo,
      direccion: direccionFinal,
      estado_id: estadoId,
      horario: horario.trim() || null,
      descripcion: descripcion.trim() || null,
    };
    // Solo se envían coordenadas si el admin eligió una ubicación nueva: así una
    // edición de texto no dispara la re-verificación por accidente.
    if (nuevaUbi) {
      datos.lat = nuevaUbi.lat;
      datos.lng = nuevaUbi.lng;
      datos.google_place_id = nuevaUbi.google_place_id;
    }

    setGuardando(true);
    try {
      const coordsCambiaron = await editarNodo(nodo.id, datos, token);
      onSaved();
      if (coordsCambiaron) {
        setAviso(
          "Cambiaste la ubicación: el punto quedó inactivo. Verifica el GPS desde el lugar nuevo para reactivarlo."
        );
      } else {
        setAbierto(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) {
    return (
      <button onClick={abrir} className="btn-ghost text-sm">
        Editar datos
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-3">
      <p className="text-sm font-semibold text-accent">Editar datos del punto</p>

      <input className="field" placeholder="Nombre del punto" value={nombre} onChange={(e) => setNombre(e.target.value)} />

      <select className="field" value={tipo} onChange={(e) => setTipo(e.target.value as NodeTipo)}>
        <option value="acopio">Acopio</option>
        <option value="entrega">Entrega</option>
        <option value="mixto">Mixto</option>
      </select>

      <EstadoCombobox
        estados={estados}
        estadoId={estadoId}
        onChange={setEstadoId}
        label="Estado"
        placeholder="Elige un estado"
      />

      <input className="field" placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />

      <input className="field" placeholder="Horario (ej: L-V 9am-5pm)" value={horario} onChange={(e) => setHorario(e.target.value)} />

      <textarea
        className="field min-h-16"
        placeholder="Descripción o referencias del punto (opcional)"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />

      {!cambiarUbi ? (
        <button
          type="button"
          onClick={() => setCambiarUbi(true)}
          className="text-sm font-semibold text-accent underline self-start"
        >
          Cambiar ubicación en el mapa
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-danger">
            Cambiar la ubicación devuelve el punto a inactivo hasta re-verificar el GPS.
          </p>
          <UbicacionPicker valor={nuevaUbi} onChange={setNuevaUbi} />
        </div>
      )}

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
      {aviso && <p className="text-sm font-semibold text-danger">{aviso}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
        <button onClick={() => setAbierto(false)} className="btn-ghost text-sm">
          Cerrar
        </button>
      </div>
    </div>
  );
}
