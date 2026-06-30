"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRecogidasPendientes } from "@/hooks/useRecogidasPendientes";
import {
  completarRecogida,
  liberarRecogida,
  confirmarEntrega,
  getAportesVoluntario,
  validarTokenVoluntario,
} from "@/lib/api";
import {
  clearVolunteerToken,
  getVolunteerToken,
  supabase,
} from "@/lib/supabase";
import { AporteVoluntario } from "@/lib/types";
import Countdown from "@/components/Countdown";
import AccionesRecogidaVoluntario from "@/components/AccionesRecogidaVoluntario";
import SolicitudesDisponibles from "@/components/SolicitudesDisponibles";

interface Props {
  token: string;
  onSalir: () => void;
}

interface GrupoAporte {
  location_id: string;
  place_name: string;
  address: string | null;
  descripcion_lugar: string | null;
  totalDisponible: number;
  items: AporteVoluntario[];
}

function km(metros: number): string {
  if (!Number.isFinite(metros)) return "-";
  return metros < 1000 ? String(metros) + " m" : (metros / 1000).toFixed(1) + " km";
}

export default function PanelVoluntario({ token, onSalir }: Props) {
  const { recogidas, cargando, error, recargar } = useRecogidasPendientes(token);
  // Guard de sesión: revalida el token contra la BD en cada montaje del panel.
  // No renderizamos contenido hasta confirmar que el token sigue siendo válido,
  // para que un token falso o revocado en localStorage no pueda ver el panel.
  const [validandoSesion, setValidandoSesion] = useState(true);
  const [aportes, setAportes] = useState<AporteVoluntario[]>([]);
  const [cargandoAportes, setCargandoAportes] = useState(true);
  const [errorAportes, setErrorAportes] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const cargarAportes = useCallback(async () => {
    setCargandoAportes(true);
    try {
      const data = await getAportesVoluntario(token);
      // El panel solo lista aportes activos; los cerrados se gestionan (editar
      // datos históricos) desde la página de gestión del lugar.
      setAportes(data.filter((a) => a.aporte_status === "activo"));
      setErrorAportes(null);
    } catch (e) {
      setErrorAportes(e instanceof Error ? e.message : "No se pudieron cargar tus aportes.");
    } finally {
      setCargandoAportes(false);
    }
  }, [token]);

  // Guard de sesión al montar: lee el token de localStorage y lo revalida.
  // Sin token => vuelve a /voluntarios. Token inválido => lo borra y vuelve con
  // ?sesion=invalida. Usamos una redirección dura para remontar la página con
  // estado limpio (la misma ruta vía router conservaría el estado de React).
  useEffect(() => {
    let activo = true;
    const guardado = getVolunteerToken();
    if (!guardado) {
      window.location.replace("/voluntarios");
      return;
    }
    void validarTokenVoluntario(guardado).then((valido) => {
      if (!activo) return;
      if (!valido) {
        clearVolunteerToken();
        window.location.replace("/voluntarios?sesion=invalida");
        return;
      }
      setValidandoSesion(false);
    });
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (validandoSesion) return;
    void cargarAportes();

    const canal = supabase
      .channel("aportes_voluntario_panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aportes" },
        () => void cargarAportes()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aporte_items" },
        () => void cargarAportes()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [cargarAportes, validandoSesion]);

  const aportesPorLugar = useMemo(() => {
    const mapa = new Map<string, GrupoAporte>();
    for (const aporte of aportes) {
      const existente = mapa.get(aporte.location_id);
      if (existente) {
        existente.items.push(aporte);
        existente.totalDisponible += aporte.qty_disponible;
      } else {
        mapa.set(aporte.location_id, {
          location_id: aporte.location_id,
          place_name: aporte.place_name,
          address: aporte.address,
          descripcion_lugar: aporte.descripcion_lugar,
          totalDisponible: aporte.qty_disponible,
          items: [aporte],
        });
      }
    }
    return Array.from(mapa.values());
  }, [aportes]);

  const completar = async (id: string) => {
    setAviso(null);
    try {
      await completarRecogida(id, token);
      await Promise.all([recargar(), cargarAportes()]);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo completar.");
    }
  };

  const liberar = async (id: string) => {
    setAviso(null);
    try {
      await liberarRecogida(id);
      await Promise.all([recargar(), cargarAportes()]);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo liberar.");
    }
  };

  const confirmar = async (id: string) => {
    setAviso(null);
    setConfirmandoId(id);
    try {
      await confirmarEntrega(id, token);
      await Promise.all([recargar(), cargarAportes()]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setAviso(
        msg.includes("plazo_vencido")
          ? "El plazo para confirmar esta entrega ya venció."
          : "No se pudo confirmar la entrega."
      );
    } finally {
      setConfirmandoId(null);
    }
  };

  const salir = () => {
    clearVolunteerToken();
    onSalir();
  };

  // Mientras el guard revalida (o redirige), no exponemos el contenido del panel.
  if (validandoSesion) {
    return <p className="text-muted">Verificando sesión…</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Sesión activa</p>
          <h2 className="text-lg font-bold">Panel de voluntariado</h2>
        </div>
        <button onClick={salir} className="text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      <div className="rounded-xl border border-border bg-bg p-3 text-sm text-muted">
        Estás conectada/o como voluntaria/o. Aquí verás tus aportes publicados y las solicitudes pendientes para coordinar recogidas cercanas.
      </div>

      {aviso && <p className="text-sm font-semibold text-danger">{aviso}</p>}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Mis aportes</h3>
          <Link href="/dar" className="text-sm font-semibold text-accent">
            Publicar
          </Link>
        </div>

        {cargandoAportes && <p className="text-muted">Cargando tus aportes...</p>}
        {errorAportes && <p className="text-sm font-semibold text-danger">{errorAportes}</p>}
        {!cargandoAportes && aportesPorLugar.length === 0 && (
          <div className="rounded-xl bg-surface p-4 text-muted">
            <p>Aún no has publicado aportes.</p>
            <p className="mt-2 text-sm">Cuando publiques insumos, aparecerán aquí agrupados por dirección.</p>
          </div>
        )}

        {aportesPorLugar.map((grupo) => {
          const categorias = Array.from(new Set(grupo.items.map((item) => item.category_name)));
          return (
            <Link
              key={grupo.location_id}
              href={"/voluntarios/gestionar/" + grupo.location_id}
              className="card flex flex-col gap-3 active:bg-neutral-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{grupo.place_name}</p>
                  {grupo.address && <p className="text-xs text-muted">{grupo.address}</p>}
                  {grupo.descripcion_lugar && grupo.descripcion_lugar !== grupo.place_name && (
                    <p className="mt-1 text-xs text-muted">{grupo.descripcion_lugar}</p>
                  )}
                </div>
                <span className="badge shrink-0">
                  {grupo.totalDisponible} disp.
                </span>
              </div>

              <div className="flex flex-wrap gap-1">
                {categorias.map((c) => (
                  <span key={c} className="badge">
                    {c}
                  </span>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                {grupo.items.map((item) => (
                  <div key={item.item_id} className="rounded-xl bg-bg p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.item_descripcion}</p>
                        <span className="badge mt-1 inline-block">{item.category_name}</span>
                      </div>
                      <span className="badge shrink-0">
                        {item.qty_disponible}/{item.qty_approx}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </section>

      <SolicitudesDisponibles token={token} />

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-bold">Recogidas pendientes</h3>

        <div className="rounded-xl border border-danger bg-bg p-3 text-sm">
          <p className="font-semibold text-danger">⚠️ Confirma la entrega solo con pruebas</p>
          <p className="mt-1 text-muted">
            Cuando marques que el recogedor <strong>recogió</strong> el insumo, él tiene{" "}
            <strong>24 horas</strong> para entregarlo en su destino y enviarte por{" "}
            <strong>WhatsApp una foto</strong> donde se le vea claramente entregando.
          </p>
          <p className="mt-1 text-muted">
            Confirma la entrega en el sistema <strong>únicamente</strong> cuando hayas recibido
            esa prueba. Si el recogedor <strong>no entrega ni envía la foto</strong> dentro de
            las 24 horas, no la confirmes: su cédula será{" "}
            <strong>bloqueada del sistema</strong> y no podrá volver a solicitar nada.
          </p>
        </div>

        {cargando && <p className="text-muted">Cargando y ordenando por cercanía...</p>}
        {error && recogidas.length > 0 && <p className="text-sm font-semibold text-danger">{error}</p>}
        {!cargando && recogidas.length === 0 && (
          <div className="rounded-xl bg-surface p-4 text-muted">
            <p>No hay recogidas pendientes ahora mismo.</p>
            <p className="mt-2 text-sm">Cuando alguien solicite un insumo, aparecerá aquí con su contador y ubicación.</p>
          </div>
        )}

        {recogidas.map((r) => {
          return (
            <div key={r.recogida.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.descripcion}</p>
                  <p className="text-sm text-muted">{r.place_name}</p>
                </div>
                <span className="shrink-0 rounded-full bg-bg px-2 py-1 text-xs text-muted">
                  {km(r.metros)}
                </span>
              </div>

              <div className="rounded-xl bg-bg p-3 text-sm">
                <p>
                  <span className="text-muted">Va a buscar:</span> {r.recogida.nombre} {r.recogida.apellido}
                </p>
                <p>
                  <span className="text-muted">CI:</span> {r.recogida.cedula}
                  {r.recogida.placa_vehiculo && (
                    <>
                      {"  "}-{"  "}
                      <span className="text-muted">Placa:</span> {r.recogida.placa_vehiculo}
                    </>
                  )}
                </p>
                <p>
                  <span className="text-muted">Cantidad:</span> {r.recogida.qty_a_buscar}
                </p>
                {r.recogida.status === "pendiente" && (
                  <p>
                    <span className="text-muted">Tiempo para que lo busquen:</span> <Countdown hasta={r.recogida.reserved_until} />
                  </p>
                )}
              </div>

              <AccionesRecogidaVoluntario
                recogida={r.recogida}
                onCompletar={completar}
                onLiberar={liberar}
                onConfirmar={confirmar}
                confirmando={confirmandoId === r.recogida.id}
              />
            </div>
          );
        })}
      </section>
    </div>
  );
}
