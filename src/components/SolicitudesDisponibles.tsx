"use client";

// Sección del panel de voluntario: lista las solicitudes que el voluntario PUEDE
// atender. El filtro de requiere_vehiculo/tiene_vehiculo y el de sobrante se
// aplican server-side (listar_solicitudes_disponibles). Issue #20 agrega la
// operación por ubicación:
//   * Si el voluntario no tiene una zona vigente (nunca verificó o venció el
//     plazo de 24h), la RPC devuelve requiere_verificacion=true: se bloquea SOLO
//     esta lista con un botón "Verificar mi ubicación" (el resto del panel sigue).
//   * Las solicitudes fuera de rango (en_rango=false) SÍ se muestran, pero con el
//     botón deshabilitado (definicion.md: se ven, no se pueden tomar).
// Nunca se expone ni se guarda la ubicación de ningún voluntario.

import { useCallback, useEffect, useState } from "react";
import {
  listarSolicitudesDisponibles,
  responderSolicitudVoluntario,
  verificarUbicacionVoluntario,
} from "@/lib/api";
import { Magnitud, MAGNITUD_ORDEN, SolicitudDisponible } from "@/lib/types";

interface Props {
  token: string;
}

export default function SolicitudesDisponibles({ token }: Props) {
  const [solicitudes, setSolicitudes] = useState<SolicitudDisponible[]>([]);
  const [requiereVerificacion, setRequiereVerificacion] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  // Solicitud en la que el voluntario está respondiendo (formulario abierto).
  const [respondiendoId, setRespondiendoId] = useState<string | null>(null);
  const [magnitud, setMagnitud] = useState<Magnitud>("unidades");
  const [tiempo, setTiempo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const resp = await listarSolicitudesDisponibles(token);
      setSolicitudes(resp.solicitudes);
      setRequiereVerificacion(resp.requiere_verificacion);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las solicitudes.");
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    // Carga inicial async en efecto (cargar marca "cargando"; intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const verificar = async () => {
    setError(null);
    setVerificando(true);
    try {
      await verificarUbicacionVoluntario(token);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo verificar tu ubicación.");
    } finally {
      setVerificando(false);
    }
  };

  const abrir = (id: string) => {
    setRespondiendoId(id);
    setMagnitud("unidades");
    setTiempo("");
    setError(null);
  };

  const responder = async (id: string) => {
    setError(null);
    const minutos = Number(tiempo);
    if (!tiempo.trim() || !(minutos > 0)) {
      setError("Indica un tiempo estimado en minutos (mayor a cero).");
      return;
    }
    setEnviando(true);
    try {
      await responderSolicitudVoluntario(id, magnitud, minutos, token);
      setRespondiendoId(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la respuesta.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">Solicitudes disponibles</h3>

      {cargando && <p className="text-muted">Cargando solicitudes…</p>}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {!cargando && requiereVerificacion && (
        <div className="rounded-xl border border-accent bg-bg p-4">
          <p className="font-semibold text-accent">Verifica tu ubicación para operar</p>
          <p className="mt-1 text-sm text-muted">
            Confirma dónde estás una sola vez para poder tomar solicitudes cercanas. Tu ubicación
            no se guarda: solo se usa para saber tu municipio, y la verificación vale 24 horas.
          </p>
          <button
            onClick={verificar}
            disabled={verificando}
            className="btn-primary mt-3 w-full disabled:opacity-50"
          >
            {verificando ? "Verificando…" : "Verificar mi ubicación"}
          </button>
        </div>
      )}

      {!cargando && !requiereVerificacion && solicitudes.length === 0 && (
        <div className="rounded-xl bg-surface p-4 text-muted">
          <p>No hay solicitudes para ti ahora mismo.</p>
          <p className="mt-2 text-sm">
            Aquí aparecerán las solicitudes de puntos que puedes ayudar a cubrir.
          </p>
        </div>
      )}

      {!requiereVerificacion &&
        solicitudes.map((s) => (
          <div key={s.id} className="card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {s.category_name}
                  {s.subcategoria ? " · " + s.subcategoria : ""}
                </p>
                <p className="text-xs text-muted">Punto: {s.nodo_nombre}</p>
                <p className="mt-1 text-xs text-muted">
                  Falta cubrir: {s.sobrante} · magnitud pedida: {s.magnitud}
                  {s.requiere_vehiculo ? " · requiere vehículo" : ""}
                </p>
              </div>
              <span className="badge shrink-0">{s.status}</span>
            </div>

            {!s.en_rango ? (
              <div className="rounded-xl bg-bg p-3">
                <button disabled className="btn-primary w-full text-sm opacity-50" aria-disabled>
                  Responder
                </button>
                <p className="mt-2 text-center text-xs text-muted">
                  Acércate más — alguien más cercano podría tomarla
                </p>
              </div>
            ) : respondiendoId === s.id ? (
              <div className="flex flex-col gap-2 rounded-xl bg-bg p-3">
                <label className="text-xs font-semibold text-muted">Magnitud que puedo llevar</label>
                <select
                  className="field"
                  value={magnitud}
                  onChange={(e) => setMagnitud(e.target.value as Magnitud)}
                >
                  {MAGNITUD_ORDEN.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  className="field"
                  inputMode="numeric"
                  placeholder="Tiempo estimado (minutos)"
                  value={tiempo}
                  onChange={(e) => setTiempo(e.target.value.replace(/[^0-9]/g, ""))}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => responder(s.id)}
                    disabled={enviando}
                    className="btn-primary flex-1 text-sm disabled:opacity-50"
                  >
                    {enviando ? "Enviando…" : "Comprometerme"}
                  </button>
                  <button onClick={() => setRespondiendoId(null)} className="btn-ghost flex-1 text-sm">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => abrir(s.id)} className="btn-primary text-sm">
                Responder
              </button>
            )}
          </div>
        ))}
    </section>
  );
}
