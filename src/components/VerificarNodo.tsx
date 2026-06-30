"use client";

import { useState } from "react";
import { verificarNodo } from "@/lib/api";

type Resultado = "ok" | "lejos" | "error" | null;

// Pantalla simple de verificación GPS de un nodo. Pide la geolocalización del
// navegador UNA sola vez al presionar "Verificar" (no la mantiene encendida
// después: mismo criterio de batería del voluntario). No revela la distancia
// exacta para no filtrar la ubicación precisa del nodo.
export default function VerificarNodo({
  nodeId,
  token,
  verificado,
  onVerificado,
}: {
  nodeId: string;
  token: string;
  verificado: boolean;
  onVerificado?: () => void;
}) {
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);
  const [mensaje, setMensaje] = useState<string>("");

  const verificar = () => {
    setResultado(null);
    setMensaje("");
    if (!("geolocation" in navigator)) {
      setResultado("error");
      setMensaje("Tu navegador no permite obtener la ubicación.");
      return;
    }
    setCargando(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const dentro = await verificarNodo(
            nodeId,
            pos.coords.latitude,
            pos.coords.longitude,
            token
          );
          if (dentro) {
            setResultado("ok");
            setMensaje("Nodo verificado y activado.");
            onVerificado?.();
          } else {
            setResultado("lejos");
            setMensaje("Estás a más de 200 m del nodo. Acércate e intenta de nuevo.");
          }
        } catch (e) {
          setResultado("error");
          setMensaje(e instanceof Error ? e.message : "No se pudo verificar el nodo.");
        } finally {
          setCargando(false);
        }
      },
      () => {
        setCargando(false);
        setResultado("error");
        setMensaje("No pudimos obtener tu ubicación. Activa el GPS y permite el acceso.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  if (verificado) {
    return <p className="text-sm font-semibold text-accent">✓ Verificado por ti</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={verificar}
        disabled={cargando}
        className="btn-primary w-full disabled:opacity-50"
      >
        {cargando ? "Obteniendo ubicación…" : "Verificar con mi ubicación"}
      </button>
      {resultado && (
        <p
          className={
            resultado === "ok"
              ? "text-sm font-semibold text-accent"
              : "text-sm font-semibold text-danger"
          }
        >
          {mensaje}
        </p>
      )}
    </div>
  );
}
