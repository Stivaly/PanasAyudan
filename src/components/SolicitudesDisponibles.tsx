"use client";

// Sección del panel de voluntario (issue #19): lista las solicitudes que el
// voluntario PUEDE atender. El filtro de requiere_vehiculo/tiene_vehiculo y el
// de sobrante ya se aplican server-side (listar_solicitudes_disponibles), así
// que aquí no se muestra ningún estado "deshabilitado": las que requieren
// vehículo y no aplican simplemente no llegan. Nunca se expone ubicación de
// otros voluntarios.

import { useCallback, useEffect, useState } from "react";
import { listarSolicitudesDisponibles, responderSolicitudVoluntario } from "@/lib/api";
import { Magnitud, MAGNITUD_ORDEN, SolicitudDisponible } from "@/lib/types";

interface Props {
  token: string;
}

export default function SolicitudesDisponibles({ token }: Props) {
  const [solicitudes, setSolicitudes] = useState<SolicitudDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Solicitud en la que el voluntario está respondiendo (formulario abierto).
  const [respondiendoId, setRespondiendoId] = useState<string | null>(null);
  const [magnitud, setMagnitud] = useState<Magnitud>("unidades");
  const [tiempo, setTiempo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setSolicitudes(await listarSolicitudesDisponibles(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las solicitudes.");
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

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
      {!cargando && solicitudes.length === 0 && (
        <div className="rounded-xl bg-surface p-4 text-muted">
          <p>No hay solicitudes para ti ahora mismo.</p>
          <p className="mt-2 text-sm">
            Aquí aparecerán las solicitudes de puntos que puedes ayudar a cubrir.
          </p>
        </div>
      )}

      {solicitudes.map((s) => (
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

          {respondiendoId === s.id ? (
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
