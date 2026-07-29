"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  listarSolicitudesDisponibles,
  marcarRetiroCompromiso,
  responderSolicitudVoluntario,
  verificarUbicacionVoluntario,
} from "@/lib/api";
import {
  CompromisoVoluntarioActivo,
  Magnitud,
  MAGNITUD_ORDEN,
  SolicitudDisponible,
} from "@/lib/types";
import { RealtimeTable, useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import {
  CONFIRMACION_HORAS,
  RANGO_VOLUNTARIO_KM,
  RETIRO_HORAS,
  TIEMPO_ESTIMADO_DEFECTO_MINUTOS,
  VERIFICACION_UBICACION_HORAS,
} from "@/lib/constantes";
import SkeletonLista from "./SkeletonLista";

interface Props {
  token: string;
}

// Realtime limita el operador "in." a 100 valores por filtro (documentado en
// https://supabase.com/docs/guides/realtime/postgres-changes). Se parte
// nodosEnRango en grupos de este tamano para no depender de que el rango del
// voluntario (ver RANGO_VOLUNTARIO_KM) se mantenga chico: si crece en el futuro y supera
// los 100 nodos, seguimos filtrando correctamente en vez de arriesgarnos a un
// comportamiento no documentado al pasar el limite.
const MAX_VALORES_FILTRO_IN = 100;

function enGrupos<T>(items: readonly T[], tamano: number): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    grupos.push(items.slice(i, i + tamano));
  }
  return grupos;
}

export default function SolicitudesDisponibles({ token }: Props) {
  // Solo hay un formulario abierto a la vez, pero el id se genera igual con
  // useId para no depender de eso si el diseno cambia.
  const cantidadId = useId();
  const [solicitudes, setSolicitudes] = useState<SolicitudDisponible[]>([]);
  const [compromisos, setCompromisos] = useState<CompromisoVoluntarioActivo[]>([]);
  const [volunteerId, setVolunteerId] = useState<string | null>(null);
  const [nodosEnRango, setNodosEnRango] = useState<string[]>([]);
  const [requiereVerificacion, setRequiereVerificacion] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [respondiendoId, setRespondiendoId] = useState<string | null>(null);
  const [magnitud, setMagnitud] = useState<Magnitud>("unidades");
  const [cantidad, setCantidad] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [retirandoId, setRetirandoId] = useState<string | null>(null);

  const cargar = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    try {
      const resp = await listarSolicitudesDisponibles(token);
      setSolicitudes(resp.solicitudes);
      setCompromisos(resp.compromisos ?? []);
      setVolunteerId(resp.volunteer_id);
      // Reusa la referencia anterior si el conjunto de nodos no cambio: el RPC
      // no garantiza el mismo orden entre llamadas, y json_agg() en la
      // migracion no tiene ORDER BY, asi que comparamos como conjunto (no por
      // posicion) para no disparar un re-render/resuscripcion de Realtime
      // innecesaria cuando el contenido es identico (issue #83).
      setNodosEnRango((prev) => {
        const next = resp.nodos_en_rango ?? [];
        const mismoConjunto =
          prev.length === next.length && new Set([...prev, ...next]).size === prev.length;
        return mismoConjunto ? prev : next;
      });
      setRequiereVerificacion(resp.requiere_verificacion);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los traslados.");
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    // Carga inicial async en efecto; cargar controla el estado de carga.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const realtimeTables = useMemo<RealtimeTable[]>(() => {
    const tables: RealtimeTable[] = [];

    // Solo nos importan cambios en solicitudes/compromisos de nodos dentro de
    // nuestro rango (issue #83); si no hay ninguno, no hace falta suscribirse.
    for (const grupo of enGrupos(nodosEnRango, MAX_VALORES_FILTRO_IN)) {
      const filtroNodos = `in.(${grupo.join(",")})`;
      tables.push(
        { table: "solicitudes", filter: `node_id_origen=${filtroNodos}` },
        // compromisos_nodo tiene dos lados relevantes (quien surte, quien
        // pidio); Realtime no soporta un OR entre columnas en un solo filtro,
        // asi que se suscribe la misma tabla dos veces, una por cada lado.
        { table: "compromisos_nodo", filter: `node_id_compromete=${filtroNodos}` },
        { table: "compromisos_nodo", filter: `node_id_destino=${filtroNodos}` }
      );
    }

    if (volunteerId) {
      tables.push({
        table: "compromisos_voluntario",
        filter: `volunteer_id=eq.${volunteerId}`,
      });
    }

    return tables;
  }, [volunteerId, nodosEnRango]);

  useRealtimeRefresh(
    "solicitudes_disponibles_changes",
    realtimeTables,
    () => void cargar(false),
    Boolean(token) && Boolean(volunteerId)
  );

  const verificar = async () => {
    setError(null);
    setVerificando(true);
    try {
      await verificarUbicacionVoluntario(token);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo verificar tu ubicacion.");
    } finally {
      setVerificando(false);
    }
  };

  const abrir = (s: SolicitudDisponible) => {
    setRespondiendoId(s.id);
    setMagnitud(s.magnitud);
    setCantidad("");
    setError(null);
  };

  const responder = async (s: SolicitudDisponible) => {
    setError(null);
    const cant = Number(cantidad);
    if (!cantidad.trim() || !Number.isInteger(cant) || cant <= 0) {
      setError("Indica la cantidad (numero entero mayor a cero).");
      return;
    }
    if (cant > s.cantidad_disponible) {
      setError(`Solo quedan ${s.cantidad_disponible} ${s.magnitud} disponibles para transportar.`);
      return;
    }
    setEnviando(true);
    try {
      await responderSolicitudVoluntario(
        s.solicitud_id,
        magnitud,
        cant,
        TIEMPO_ESTIMADO_DEFECTO_MINUTOS,
        token,
        s.compromiso_nodo_id
      );
      setRespondiendoId(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo tomar el traslado.");
    } finally {
      setEnviando(false);
    }
  };

  const marcarRetiro = async (id: string) => {
    setError(null);
    setRetirandoId(id);
    try {
      await marcarRetiroCompromiso(id, token);
      await cargar(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar el retiro.");
    } finally {
      setRetirandoId(null);
    }
  };

  const fechaCorta = (valor: string | null) => {
    if (!valor) return "";
    return new Intl.DateTimeFormat("es-VE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(valor));
  };

  const retiroTexto = (direccion?: string | null, nombre?: string | null) =>
    direccion?.trim() || nombre?.trim() || "Direccion de retiro no disponible";

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">Traslados disponibles</h3>

      {cargando && <SkeletonLista />}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {!cargando && requiereVerificacion && (
        <div className="rounded-xl border border-accent bg-bg p-4">
          <p className="font-semibold text-accent">Verifica tu ubicacion para operar</p>
          <p className="mt-1 text-sm text-muted">
            Confirma donde estas una sola vez para poder tomar traslados cercanos. Tu ubicacion
            no se guarda: solo se usa para saber tu municipio, y la verificacion vale{" "}
            {VERIFICACION_UBICACION_HORAS} horas.
          </p>
          <div className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm font-semibold text-fg">
            Rango operativo: {RANGO_VOLUNTARIO_KM.conVehiculo} km maximo si tienes vehiculo
            registrado; {RANGO_VOLUNTARIO_KM.sinVehiculo} km maximo sin vehiculo.
          </div>
          <div className="mt-3 rounded-xl border border-danger bg-danger/15 p-3 text-sm font-bold text-danger">
            Esta verificacion debe hacerse desde un celular con ubicacion activa.
          </div>
          <button
            onClick={verificar}
            disabled={verificando}
            className="btn-primary mt-3 w-full disabled:opacity-50"
          >
            {verificando ? "Verificando..." : "Verificar mi ubicacion"}
          </button>
        </div>
      )}

      {!cargando && !requiereVerificacion && compromisos.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase text-muted">Mis traslados activos</p>
          {compromisos.map((c) => (
            <div key={c.id} className="rounded-xl bg-bg p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {c.category_name}
                    {c.subcategoria ? " - " + c.subcategoria : ""}
                  </p>
                  <p className="text-xs text-muted">
                    Retiro: {retiroTexto(c.nodo_origen_direccion, c.nodo_origen_nombre)}
                  </p>
                  {c.nodo_origen_nombre && (
                    <p className="text-xs text-muted">Centro: {c.nodo_origen_nombre}</p>
                  )}
                  <p className="text-xs text-muted">Entrega: {c.nodo_nombre}</p>
                  <p className="mt-1 text-xs text-muted">
                    Reservado: {c.cantidad ? `${c.cantidad} ` : ""}{c.magnitud}
                  </p>
                  {c.status === "pendiente" && c.reservado_until && (
                    <p className="mt-1 text-xs text-muted">
                      Retirar antes de {fechaCorta(c.reservado_until)}
                    </p>
                  )}
                  {c.status === "retirado" && c.entrega_deadline && (
                    <p className="mt-1 text-xs text-muted">
                      El centro receptor debe confirmar antes de {fechaCorta(c.entrega_deadline)}
                    </p>
                  )}
                  {c.atrasado_4h && (
                    <p className="mt-1 text-xs font-semibold text-danger">
                      Vencio el plazo de retiro de {RETIRO_HORAS} horas.
                    </p>
                  )}
                  {c.atrasado_24h && (
                    <p className="mt-1 text-xs font-semibold text-danger">
                      El centro receptor aun no confirma luego de {CONFIRMACION_HORAS} horas.
                    </p>
                  )}
                </div>
                <span className="badge shrink-0">{c.status}</span>
              </div>
              {c.status === "pendiente" && !c.atrasado_4h && (
                <button
                  onClick={() => marcarRetiro(c.id)}
                  disabled={retirandoId === c.id}
                  className="btn-primary mt-3 w-full text-sm disabled:opacity-50"
                >
                  {retirandoId === c.id ? "Marcando..." : "Marcar como retirado"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!cargando && !requiereVerificacion && solicitudes.length === 0 && (
        <div className="rounded-xl bg-surface p-4 text-muted">
          <p>No hay traslados disponibles para ti ahora mismo.</p>
          <p className="mt-2 text-sm">
            Aqui apareceran inventarios que otro centro ya ofrecio, pero que aun no tienen transporte.
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
                  {s.subcategoria ? " - " + s.subcategoria : ""}
                </p>
                <p className="text-xs text-muted">
                  Retiro: {retiroTexto(s.nodo_origen_direccion, s.nodo_origen_nombre)}
                </p>
                {s.nodo_origen_nombre && (
                  <p className="text-xs text-muted">Centro: {s.nodo_origen_nombre}</p>
                )}
                <p className="text-xs text-muted">Entrega: {s.nodo_nombre}</p>
                <p className="mt-1 text-xs text-muted">
                  Disponible para transportar: {s.cantidad_disponible} {s.magnitud}
                  {s.cantidad ? ` de ${s.cantidad}` : ""}
                  {s.requiere_vehiculo ? " - requiere vehiculo" : ""}
                </p>
                {s.nota && <p className="mt-1 text-xs text-fg">{s.nota}</p>}
              </div>
              <span className="badge shrink-0">{s.compromiso_status}</span>
            </div>

            {!s.en_rango ? (
              <div className="rounded-xl bg-bg p-3">
                <button disabled className="btn-primary w-full text-sm opacity-50" aria-disabled>
                  Tomar traslado
                </button>
                <p className="mt-2 text-center text-xs text-muted">
                  Acercate mas para poder tomar este traslado.
                </p>
              </div>
            ) : respondiendoId === s.id ? (
              <div className="flex flex-col gap-2 rounded-xl bg-bg p-3">
                <label htmlFor={cantidadId} className="text-xs font-semibold text-muted">
                  Cantidad que puedo llevar
                </label>
                <div className="flex gap-2">
                  <input
                    id={cantidadId}
                    className="field w-1/3"
                    inputMode="numeric"
                    placeholder={`Max ${s.cantidad_disponible}`}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <select
                    aria-label="Magnitud"
                    className="field flex-1"
                    value={magnitud}
                    onChange={(e) => setMagnitud(e.target.value as Magnitud)}
                  >
                    {MAGNITUD_ORDEN.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted">
                  Al comprometerte, tienes {RETIRO_HORAS} horas para retirar. Despues del
                  retiro, el centro receptor tiene {CONFIRMACION_HORAS} horas para confirmar
                  la recepcion.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => responder(s)}
                    disabled={enviando}
                    className="btn-primary flex-1 text-sm disabled:opacity-50"
                  >
                    {enviando ? "Enviando..." : "Tomar traslado"}
                  </button>
                  <button onClick={() => setRespondiendoId(null)} className="btn-ghost flex-1 text-sm">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => abrir(s)} className="btn-primary text-sm">
                Tomar traslado
              </button>
            )}
          </div>
        ))}
    </section>
  );
}
