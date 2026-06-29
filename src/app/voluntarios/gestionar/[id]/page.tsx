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
  getCategorias,
  editarAporteItem,
  eliminarAporteItem,
} from "@/lib/api";
import { getVolunteerToken } from "@/lib/supabase";
import { AporteVoluntario, Category } from "@/lib/types";
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

  // Categorías para el selector del formulario de edición inline.
  const [categorias, setCategorias] = useState<Category[]>([]);

  // Edición inline: item en edición, su formulario, error y estado de guardado.
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    category_id: string;
    descripcion: string;
    qty_approx: number;
  }>({ category_id: "", descripcion: "", qty_approx: 1 });
  const [editError, setEditError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Eliminación inline: confirmación abierta, estado de borrado, aviso de bloqueo.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [bloqueoId, setBloqueoId] = useState<string | null>(null);

  const { recogidas, error, recargar } = useRecogidasPendientes(token);

  useEffect(() => {
    setToken(getVolunteerToken());
    setVerificando(false);
  }, []);

  useEffect(() => {
    void getCategorias()
      .then(setCategorias)
      .catch(() => setCategorias([]));
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

  const abrirEdicion = (insumo: AporteVoluntario) => {
    const cat = categorias.find((c) => c.name === insumo.category_name);
    setConfirmDeleteId(null);
    setBloqueoId(null);
    setEditError(null);
    setEditId(insumo.item_id);
    setEditForm({
      category_id: cat?.id ?? "",
      descripcion: insumo.item_descripcion,
      qty_approx: insumo.qty_approx,
    });
  };

  const cancelarEdicion = () => {
    setEditId(null);
    setEditError(null);
  };

  const guardarEdicion = async (insumo: AporteVoluntario) => {
    if (!token) return;
    setEditError(null);
    setGuardando(true);
    try {
      await editarAporteItem(insumo.item_id, token, {
        descripcion: editForm.descripcion.trim(),
        category_id: editForm.category_id,
        qty_approx: editForm.qty_approx,
      });
      // Replicamos el recálculo del backend para refrescar sin reload:
      // disponible = nuevo_qty - (qty_approx_anterior - qty_disponible_anterior).
      const reservado = insumo.qty_approx - insumo.qty_disponible;
      const nuevaDisp =
        editForm.qty_approx !== insumo.qty_approx
          ? editForm.qty_approx - reservado
          : insumo.qty_disponible;
      const nuevaCat = categorias.find((c) => c.id === editForm.category_id);
      setAportes((prev) =>
        prev.map((a) =>
          a.item_id === insumo.item_id
            ? {
                ...a,
                item_descripcion: editForm.descripcion.trim(),
                category_name: nuevaCat?.name ?? a.category_name,
                qty_approx: editForm.qty_approx,
                qty_disponible: nuevaDisp,
              }
            : a
        )
      );
      setEditId(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (insumo: AporteVoluntario) => {
    if (!token) return;
    setEliminando(true);
    try {
      await eliminarAporteItem(insumo.item_id, token);
      setConfirmDeleteId(null);
      setAportes((prev) => prev.filter((a) => a.item_id !== insumo.item_id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("reservas pendientes")) {
        // Hay recogidas pendientes: cerrar la confirmación y mostrar el aviso
        // con enlace al panel donde puede liberarlas.
        setConfirmDeleteId(null);
        setBloqueoId(insumo.item_id);
      } else {
        setAviso(msg || "No se pudo eliminar el item.");
        setConfirmDeleteId(null);
      }
    } finally {
      setEliminando(false);
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

            {/* Acciones: editar / eliminar el insumo */}
            {editId === insumo.item_id ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">Categoría</span>
                  <select
                    value={editForm.category_id}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, category_id: e.target.value }))
                    }
                    className="rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">Descripción</span>
                  <input
                    type="text"
                    value={editForm.descripcion}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, descripcion: e.target.value }))
                    }
                    className="rounded-lg border border-border bg-surface px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">Cantidad aproximada</span>
                  <input
                    type="number"
                    min={1}
                    value={editForm.qty_approx}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        qty_approx: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="rounded-lg border border-border bg-surface px-3 py-2"
                  />
                </label>
                {editError && <p className="text-sm font-semibold text-danger">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => void guardarEdicion(insumo)}
                    disabled={guardando || !editForm.descripcion.trim() || !editForm.category_id}
                    className="btn-primary flex-1 disabled:opacity-60"
                  >
                    {guardando ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button
                    onClick={cancelarEdicion}
                    disabled={guardando}
                    className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : confirmDeleteId === insumo.item_id ? (
              <div className="flex flex-col gap-3 rounded-xl border border-danger bg-bg p-3">
                <p className="text-sm font-semibold">
                  ¿Eliminar este item? Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void eliminar(insumo)}
                    disabled={eliminando}
                    className="flex-1 rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {eliminando ? "Eliminando..." : "Sí, eliminar"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={eliminando}
                    className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
                  >
                    No, volver
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => abrirEdicion(insumo)}
                  className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
                >
                  Editar
                </button>
                {insumo.aporte_status !== "cerrado" && (
                  <button
                    onClick={() => {
                      setBloqueoId(null);
                      setConfirmDeleteId(insumo.item_id);
                    }}
                    className="flex-1 rounded-xl border border-danger px-3 py-2 text-sm font-semibold text-danger"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            )}

            {bloqueoId === insumo.item_id && (
              <p className="rounded-xl border border-danger bg-bg p-3 text-sm text-danger">
                Hay reservas pendientes sobre este item. Libéralas primero desde el{" "}
                <Link href="/voluntarios" className="font-semibold underline">
                  panel de recogidas
                </Link>
                .
              </p>
            )}

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
