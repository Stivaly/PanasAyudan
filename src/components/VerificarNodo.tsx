"use client";

import { useState } from "react";
import { verificarNodo } from "@/lib/api";

type Resultado = "ok" | "lejos" | "error" | null;

const PRECISION_OBJETIVO_METROS = 50;
const PRECISION_MAXIMA_METROS = 200;
const TIEMPO_MUESTREO_MS = 20000;

function obtenerMejorPosicion(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let mejor: GeolocationPosition | null = null;
    let watchId: number | null = null;
    let terminado = false;

    const finalizar = (pos?: GeolocationPosition) => {
      if (terminado) return;
      terminado = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (pos ?? mejor) {
        resolve(pos ?? mejor!);
      } else {
        reject(new Error("sin_ubicacion"));
      }
    };

    const timer = window.setTimeout(() => finalizar(), TIEMPO_MUESTREO_MS);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!mejor || pos.coords.accuracy < mejor.coords.accuracy) {
          mejor = pos;
        }
        if (pos.coords.accuracy <= PRECISION_OBJETIVO_METROS) {
          window.clearTimeout(timer);
          finalizar(pos);
        }
      },
      (err) => {
        window.clearTimeout(timer);
        if (mejor) {
          finalizar();
          return;
        }
        reject(err);
      },
      { enableHighAccuracy: true, timeout: TIEMPO_MUESTREO_MS, maximumAge: 0 }
    );
  });
}

// Pantalla simple de verificación GPS de un nodo. Pide la geolocalización del
// navegador al presionar "Verificar" y toma una muestra corta para quedarse con
// la lectura mas precisa. No revela la distancia exacta para no filtrar la
// ubicación precisa del nodo.
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
    obtenerMejorPosicion()
      .then(async (pos) => {
        const precision = Math.round(pos.coords.accuracy);
        if (precision > PRECISION_MAXIMA_METROS) {
          setResultado("error");
          setMensaje(
            `El GPS reportó baja precisión (±${precision} m). Quédate al aire libre, espera unos segundos e intenta de nuevo.`
          );
          return;
        }

        const dentro = await verificarNodo(
          nodeId,
          pos.coords.latitude,
          pos.coords.longitude,
          token
        );
        if (dentro) {
          setResultado("ok");
          setMensaje("Punto verificado y activado.");
          onVerificado?.();
        } else {
          setResultado("lejos");
          setMensaje(
            `La lectura GPS fue ±${precision} m, pero quedó fuera del rango permitido. Revisa que el punto elegido en Google Maps sea exactamente el sitio y prueba otra vez al aire libre.`
          );
        }
      })
      .catch((e) => {
        setResultado("error");
        setMensaje(
          e instanceof Error && e.message !== "sin_ubicacion"
            ? e.message
            : "No pudimos obtener tu ubicación. Activa el GPS y permite el acceso."
        );
      })
      .finally(() => setCargando(false));
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
        {cargando ? "Buscando señal GPS precisa…" : "Verificar con mi ubicación"}
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
