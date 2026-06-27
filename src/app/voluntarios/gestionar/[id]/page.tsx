"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRecogidasPendientes, RecogidaDetallada } from "@/hooks/useRecogidasPendientes";
import {
  getAportesVoluntario,
  completarRecogida,
  liberarRecogida,
  confirmarEntrega,
} from "@/lib/api";
import { getVolunteerToken } from "@/lib/supabase";
import { AporteVoluntario } from "@/lib/types";
import Countdown from "@/components/Countdown";
import AccionesRecogidaVoluntario from "@/components/AccionesRecogidaVoluntario";

export default function GestionarLugar() {
  const params = useParams<{ id: string }>();
  const locationId = params.id;

  const [token, setToken] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [aportes, setAportes] = useState<AporteVoluntario[]>([]);
  const [cargandoAportes, setCargandoAportes] = useState(true);
  const [errorAportes, setErrorAportes] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const { recogidas, error, recargar } = useRecogidasPendientes(token);

  useEffect(() => {
    setToken(getVolunteerToken());
    setVerificando(false);
  }, []);

  const cargarAportes = useCallback(async () => {
    if (!token) return;
    setCargandoAportes(true);
    try {
      const data = await getAportesVoluntario(token);
      setAportes(data.filter((a) => a.location_id === locationId));
      setErrorAportes(null);
    } catch (e) {
      setErrorAportes(e instanceof Error ? e.message : "No se pudieron cargar tus aportes.");
    } finally {
      setCargandoAportes(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    void cargarAportes();
  }, [cargarAportes]);

  // Solicitudes pendientes de este lugar, agrupadas por insumo (aporte_item).
  const solicitudesPorItem = useMemo(() => {
    const mapa = new Map<string, RecogidaDetallada[]>();
    for (const r of recogidas) {
      if (r.location_id !== locationId) continue;
      const lista = mapa.get(r.recogida.aporte_item_id);
      if (lista) lista.push(r);
      else mapa.set(r.recogida.aporte_item_id, [r]);
    }
    return mapa;
  }, [recogidas, locationId]);

  const placeName = aportes[0]?.place_name;

  const completar = async (id: string) => {
    if (!token) return;
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
    if (!token) return;
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

  if (verificando) {
    return <main className="grid min-h-dvh place-items-center text-muted">Verificando acceso...</main>;
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Link href="/voluntarios" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
            ←
          </Link>
          <h1 className="text-lg font-bold">Gestionar mis aportes</h1>
        </div>
        <div className="card border-accent">
          <p className="font-semibold text-accent">Solo voluntarios registrados</p>
          <p className="mt-2 text-sm text-muted">
            Para gestionar tus aportes y completar solicitudes debes entrar con tu token de voluntario.
          </p>
        </div>
        <Link href="/voluntarios" className="btn-primary w-full">
          Entrar como voluntario
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/voluntarios" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <div>
          <h1 className="text-lg font-bold">{placeName ?? "Gestionar mis aportes"}</h1>
          <p className="text-xs text-muted">Tus insumos y sus solicitudes pendientes</p>
        </div>
      </div>

      {aviso && <p className="text-sm font-semibold text-danger">{aviso}</p>}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
      {errorAportes && <p className="text-sm font-semibold text-danger">{errorAportes}</p>}

      {cargandoAportes && <p className="text-muted">Cargando tus aportes...</p>}

      {!cargandoAportes && aportes.length === 0 && (
        <div className="rounded-xl bg-surface p-4 text-muted">
          <p>No tienes aportes en este lugar.</p>
          <Link href="/dar" className="mt-2 inline-block text-sm font-semibold text-accent">
            Publicar un aporte
          </Link>
        </div>
      )}

      {aportes.map((insumo) => {
        const solicitudes = solicitudesPorItem.get(insumo.item_id) ?? [];
        return (
          <section key={insumo.item_id} className="card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{insumo.item_descripcion}</p>
                <span className="badge mt-1 inline-block">{insumo.category_name}</span>
              </div>
              <span className="badge shrink-0">
                {insumo.qty_disponible}/{insumo.qty_approx} disp.
              </span>
            </div>

            {solicitudes.length === 0 ? (
              <p className="rounded-xl bg-bg p-3 text-sm text-muted">
                Sin solicitudes pendientes en este insumo.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-accent">
                  {solicitudes.length} {solicitudes.length === 1 ? "solicitud" : "solicitudes"}
                </p>
                {solicitudes.map((r) => {
                  return (
                    <div key={r.recogida.id} className="flex flex-col gap-3 rounded-xl bg-bg p-3">
                      <div className="text-sm">
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
                            <span className="text-muted">Tiempo para que lo busquen:</span>{" "}
                            <Countdown hasta={r.recogida.reserved_until} />
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
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
