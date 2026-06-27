"use client";

import { useEffect, useState } from "react";
import { getWhatsappVoluntarioItem, reservarItem } from "@/lib/api";
import { getRecogedorLocal, getRecogedorToken, saveRecogedorLocal } from "@/lib/recogedor";
import { ItemConCategoria } from "@/lib/types";

export interface ReservaConfirmadaInfo {
  itemDescripcion: string;
  cantidad: number;
  whatsapp: string | null;
}

interface Props {
  item: ItemConCategoria;
  onReservada?: (info: ReservaConfirmadaInfo) => void | Promise<void>;
}

export default function ReservarItem({ item, onReservada }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [cedula, setCedula] = useState("");
  const [placa, setPlaca] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmada, setConfirmada] = useState(false);

  // Pre-rellena con los datos guardados en este dispositivo, si existen.
  useEffect(() => {
    const guardado = getRecogedorLocal();
    if (guardado) {
      setNombre(guardado.nombre);
      setApellido(guardado.apellido);
      setCedula(guardado.cedula);
    }
  }, []);

  const confirmar = async () => {
    setError(null);
    const cantidad = parseInt(qty, 10);

    if (!nombre.trim() || !apellido.trim() || !cedula.trim()) {
      setError("Nombre, apellido y cédula son obligatorios.");
      return;
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError("Indica una cantidad válida.");
      return;
    }
    if (cantidad > item.qty_disponible) {
      setError(`Solo hay ${item.qty_disponible} disponibles.`);
      return;
    }

    setEnviando(true);
    try {
      const datos = {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        cedula: cedula.trim(),
      };
      await reservarItem(item.id, cantidad, {
        ...datos,
        placa_vehiculo: placa.trim() || null,
        volunteer_id: null,
        recogedor_token: getRecogedorToken(),
      });
      // Identidad persistente del recogedor en este navegador.
      saveRecogedorLocal(datos);
      const whatsapp = await getWhatsappVoluntarioItem(item.id).catch(() => null);
      setConfirmada(true);
      setAbierto(false);
      await onReservada?.({
        itemDescripcion: item.descripcion,
        cantidad,
        whatsapp,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reservar.");
    } finally {
      setEnviando(false);
    }
  };

  if (confirmada) {
    return (
      <div className="rounded-xl border border-accent bg-bg p-3 text-sm">
        <p className="font-semibold text-accent">Solicitud registrada</p>
        <p className="mt-1 text-muted">Revisa arriba el contacto del voluntario y el tiempo disponible.</p>
      </div>
    );
  }

  if (item.qty_disponible <= 0) {
    return (
      <div className="rounded-xl border border-border bg-bg p-3 text-sm font-semibold text-muted">
        Sin disponibilidad por ahora
      </div>
    );
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="btn-primary w-full">
        Voy a buscar esto
      </button>
    );
  }

  return (
    <div className="card flex flex-col gap-3">
      <input className="field" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <input className="field" placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
      <input className="field" placeholder="Cédula" value={cedula} onChange={(e) => setCedula(e.target.value)} />
      <input className="field" placeholder="Placa del vehículo" value={placa} onChange={(e) => setPlaca(e.target.value)} />
      <input
        className="field"
        type="number"
        inputMode="numeric"
        min={1}
        max={item.qty_disponible}
        placeholder={`Cantidad a buscar (máx ${item.qty_disponible})`}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <div className="flex gap-2">
        <button onClick={() => setAbierto(false)} className="btn-ghost flex-1">
          Cancelar
        </button>
        <button onClick={confirmar} disabled={enviando} className="btn-primary flex-1 disabled:opacity-50">
          {enviando ? "Reservando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
