"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { reservarItem, verificarCedulaBloqueada } from "@/lib/api";
import { getRecogedorLocal, getRecogedorToken, saveRecogedorLocal } from "@/lib/recogedor";
import {
  validarCedula,
  formatearCedula,
  limpiarCedula,
  validarPlaca,
  formatearPlaca,
} from "@/lib/validaciones";
import { ItemConCategoria } from "@/lib/types";

interface Props {
  item: ItemConCategoria;
  // Se llama tras una reserva exitosa; el padre decide a dónde navegar.
  onReservada?: () => void | Promise<void>;
}

export default function ReservarItem({ item, onReservada }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [cedula, setCedula] = useState("");
  const [placa, setPlaca] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorCedula, setErrorCedula] = useState<string | null>(null);
  const [errorPlaca, setErrorPlaca] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);

  // Pre-rellena con los datos guardados en este dispositivo, si existen.
  // Si la cédula guardada está bloqueada, no se permite reservar.
  useEffect(() => {
    const guardado = getRecogedorLocal();
    if (!guardado) return;
    setNombre(guardado.nombre);
    setApellido(guardado.apellido);
    setCedula(formatearCedula(guardado.cedula));
    setPlaca(guardado.placa_vehiculo ?? "");
    const cedulaLimpia = limpiarCedula(guardado.cedula);
    if (cedulaLimpia) {
      verificarCedulaBloqueada(cedulaLimpia).then(setBloqueada).catch(() => {});
    }
  }, []);

  const confirmar = async () => {
    setError(null);
    setErrorCedula(null);
    setErrorPlaca(null);
    const cantidad = parseInt(qty, 10);

    if (!nombre.trim() || !apellido.trim()) {
      setError("Nombre y apellido son obligatorios.");
      return;
    }

    const cedulaCheck = validarCedula(cedula);
    if (!cedulaCheck.valida) {
      setErrorCedula(cedulaCheck.error ?? "Cédula inválida.");
      return;
    }

    const placaCheck = validarPlaca(placa);
    if (!placaCheck.valida) {
      setErrorPlaca(placaCheck.error ?? "Placa inválida.");
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
      const cedulaLimpia = limpiarCedula(cedula);
      const placaLimpia = formatearPlaca(placa);
      const datos = {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        cedula: cedulaLimpia,
      };
      await reservarItem(item.id, cantidad, {
        ...datos,
        placa_vehiculo: placaLimpia,
        volunteer_id: null,
        recogedor_token: getRecogedorToken(),
      });
      // Identidad persistente del recogedor en este navegador.
      saveRecogedorLocal({ ...datos, placa_vehiculo: placaLimpia });
      setAbierto(false);
      // El padre redirige (a /mis-recogidas); no mostramos pantalla intermedia.
      await onReservada?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("cedula_bloqueada")) {
        setBloqueada(true);
        setAbierto(false);
      } else if (msg.includes("Stock insuficiente") || msg.includes("stock")) {
        setError("No se pudo guardar tu reserva porque otra persona la solicitó primero.");
      } else {
        setError(msg || "No se pudo guardar tu reserva. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  };

  if (bloqueada) {
    return (
      <div className="rounded-xl border border-danger bg-bg p-3 text-sm">
        <p className="font-semibold text-danger">
          Tu cédula tiene una reserva sin cumplir. Ve a{" "}
          <Link href="/mis-recogidas" className="underline">
            Mis recogidas
          </Link>{" "}
          para ver el detalle.
        </p>
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
      <div className="flex flex-col gap-1">
        <input
          className="field"
          type="text"
          inputMode="numeric"
          placeholder="Cédula"
          value={cedula}
          onChange={(e) => setCedula(formatearCedula(e.target.value))}
        />
        {errorCedula && <p className="text-sm font-semibold text-danger">{errorCedula}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <input
          className="field"
          placeholder="Ej: AB123CD"
          value={placa}
          onChange={(e) => setPlaca(formatearPlaca(e.target.value))}
        />
        <p className="text-xs text-muted">Formato: AB123CD (vigente) o ABC123 (anterior)</p>
        {errorPlaca && <p className="text-sm font-semibold text-danger">{errorPlaca}</p>}
      </div>
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

      <div className="rounded-xl border border-danger bg-bg p-3 text-sm">
        <p className="font-semibold text-danger">⚠️ Compromiso al reservar</p>
        <p className="mt-1 text-muted">
          Debes entregar el insumo y confirmarle al voluntario por{" "}
          <strong>WhatsApp con una foto</strong> donde se te vea claramente en el lugar
          entregando, dentro de las <strong>24 horas</strong> siguientes a la recogida. Si no
          entregas ni envías la prueba, tu cédula será{" "}
          <strong>bloqueada</strong> y no podrás volver a solicitar nada.
        </p>
      </div>

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
