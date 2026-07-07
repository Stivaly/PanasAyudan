"use client";

// Cola de solicitudes de registro de nodo (issue #21), sección del panel
// /superadmin. Muestra las pendientes con todos sus datos, un enlace wa.me al
// teléfono del solicitante, y botones Aprobar (revela el token del nuevo admin
// UNA sola vez) y Rechazar con motivo. El formulario público de solicitud y la
// edición del nodo por su admin viven en #29.

import { useCallback, useEffect, useState } from "react";
import {
  listarSolicitudesRegistro,
  aprobarSolicitudRegistro,
  rechazarSolicitudRegistro,
} from "@/lib/api";
import { SolicitudRegistroNodo } from "@/lib/types";

interface Props {
  token: string;
}

const TIPO_LABEL: Record<string, string> = {
  acopio: "Acopio",
  entrega: "Entrega",
  mixto: "Mixto",
};

export default function SolicitudesRegistroNodo({ token }: Props) {
  const [solicitudes, setSolicitudes] = useState<SolicitudRegistroNodo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  // Token del admin recién creado: se muestra UNA vez, indexado por solicitud.
  const [tokenGenerado, setTokenGenerado] = useState<{ id: string; token: string } | null>(null);
  // Motivo de rechazo en edición (solicitud abierta para rechazar).
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  // No hace setState síncrono: solo en los callbacks async (then/catch/finally),
  // para no disparar renders en cascada al llamarlo desde el efecto.
  const cargar = useCallback(() => {
    listarSolicitudesRegistro(token)
      .then(setSolicitudes)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar las solicitudes."))
      .finally(() => setCargando(false));
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const aprobar = async (id: string) => {
    setError(null);
    setProcesando(id);
    try {
      const res = await aprobarSolicitudRegistro(id, token);
      // El token del admin no se vuelve a mostrar ni se puede recuperar.
      setTokenGenerado({ id, token: res.admin_token });
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aprobar la solicitud.");
    } finally {
      setProcesando(null);
    }
  };

  const rechazar = async (id: string) => {
    setError(null);
    setProcesando(id);
    try {
      await rechazarSolicitudRegistro(id, motivo.trim(), token);
      setRechazando(null);
      setMotivo("");
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo rechazar la solicitud.");
    } finally {
      setProcesando(null);
    }
  };

  const pendientes = solicitudes.filter((s) => s.status === "pendiente");

  return (
    <div className="card border-accent flex flex-col gap-3">
      <p className="text-sm font-semibold text-accent">
        Solicitudes de registro ({pendientes.length} pendientes)
      </p>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {cargando ? (
        <p className="text-sm text-muted">Cargando solicitudes…</p>
      ) : pendientes.length === 0 ? (
        <p className="text-sm text-muted">No hay solicitudes pendientes.</p>
      ) : (
        pendientes.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{s.nombre_nodo}</p>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                {TIPO_LABEL[s.tipo] ?? s.tipo}
              </span>
            </div>

            {s.direccion && <p className="text-sm text-muted">{s.direccion}</p>}
            {s.horarios && <p className="text-sm text-muted">Horarios: {s.horarios}</p>}
            {s.mensaje && <p className="text-sm">{s.mensaje}</p>}
            {s.audio_url && (
              <a
                href={s.audio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-accent underline"
              >
                Escuchar audio adjunto
              </a>
            )}

            <p className="text-sm">
              Solicita: <span className="font-semibold">{s.solicitante_nombre}</span>
            </p>
            <a
              href={`https://wa.me/${s.solicitante_telefono}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost w-full text-center"
            >
              WhatsApp al solicitante
            </a>

            {tokenGenerado?.id === s.id ? (
              <>
                <p className="text-sm text-accent">
                  Aprobada. Guarda este token y entrégaselo al nuevo admin por WhatsApp.
                  No se vuelve a mostrar y no se puede recuperar.
                </p>
                <input
                  className="field font-mono text-sm"
                  type="text"
                  value={tokenGenerado.token}
                  readOnly
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(tokenGenerado.token)}
                  className="btn-ghost w-full"
                >
                  Copiar token
                </button>
                <p className="text-xs text-muted">
                  El nodo nace inactivo: el admin debe verificar su GPS en el punto para
                  que aparezca en público.
                </p>
              </>
            ) : rechazando === s.id ? (
              <>
                <input
                  className="field"
                  placeholder="Motivo del rechazo (opcional)"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => rechazar(s.id)}
                    disabled={procesando === s.id}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {procesando === s.id ? "Rechazando…" : "Confirmar rechazo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRechazando(null);
                      setMotivo("");
                    }}
                    className="btn-ghost w-full"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => aprobar(s.id)}
                  disabled={procesando === s.id}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {procesando === s.id ? "Aprobando…" : "Aprobar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRechazando(s.id);
                    setMotivo("");
                  }}
                  disabled={procesando === s.id}
                  className="btn-ghost w-full disabled:opacity-50"
                >
                  Rechazar
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
