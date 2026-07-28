"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getEstados, listarNodosAdmin, pausarNodo } from "@/lib/api";
import { clearCachedRole, clearVolunteerToken } from "@/lib/supabase";
import AvisoCarga from "@/components/AvisoCarga";
import EditarNodo from "@/components/EditarNodo";
import Skeleton from "@/components/Skeleton";
import EstadoMovimientosNodo from "@/components/EstadoMovimientosNodo";
import InventarioNodo from "@/components/InventarioNodo";
import NodoTabBar, { NodoTab } from "@/components/NodoTabBar";
import SolicitudesEntreCentros from "@/components/SolicitudesEntreCentros";
import SolicitudesNodo from "@/components/SolicitudesNodo";
import VerificarNodo from "@/components/VerificarNodo";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { EstadoVenezuela, NodoAdmin, TipoPausa, pausadoRelevante, statusVisible } from "@/lib/types";

const REALTIME_TABLES = [
  { table: "centros_acopio" },
  { table: "node_admins" },
];

export default function NodoAdminPanel() {
  const router = useRouter();
  const guard = useRoleGuard(["admin"]);
  const token = guard.token;
  const [nodos, setNodos] = useState<NodoAdmin[]>([]);
  const [activeNodeId, setActiveNodeId] = useState("");
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [estadosError, setEstadosError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<NodoTab>("estado");

  const cargar = useCallback(
    async (t: string, mostrarCarga = true) => {
      if (mostrarCarga) setCargando(true);
      try {
        const data = await listarNodosAdmin(t);
        setNodos(data);
        setError(null);
      } catch (e) {
        setNodos([]);
        setError(e instanceof Error ? e.message : "No se pudieron cargar tus puntos.");
      } finally {
        setCargando(false);
      }
    },
    []
  );

  useEffect(() => {
    getEstados()
      .then((lista) => {
        setEstados(lista);
        setEstadosError(false);
      })
      .catch(() => setEstadosError(true));
  }, []);

  useEffect(() => {
    if (!token) return;
    // Carga inicial al obtener el token validado por el guard (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar(token);
  }, [cargar, token]);

  useRealtimeRefresh(
    "nodos_admin_changes",
    REALTIME_TABLES,
    () => {
      if (token) void cargar(token, false);
    },
    Boolean(token)
  );

  const selectedNodeId =
    activeNodeId && nodos.some((n) => n.id === activeNodeId) ? activeNodeId : nodos[0]?.id ?? "";

  const activo = useMemo(
    () => nodos.find((n) => n.id === selectedNodeId) ?? null,
    [selectedNodeId, nodos]
  );
  const pendienteVerificacion = Boolean(activo && !activo.verificado);

  const salir = () => {
    clearVolunteerToken();
    clearCachedRole();
    router.push("/voluntarios");
  };

  const [pausando, setPausando] = useState<TipoPausa | null>(null);

  const CONFIRMACION_PAUSA: Record<TipoPausa, string> = {
    recepcion: "Pausar la recepcion de este punto?",
    entrega: "Pausar la entrega de este punto?",
    ambas: "Pausar recepcion y entrega de este punto?",
    reactivar: "Reactivar este punto?",
  };

  const pausar = async (tipoPausa: TipoPausa) => {
    if (!token || !activo || pausando) return;
    if (!window.confirm(CONFIRMACION_PAUSA[tipoPausa])) return;
    setPausando(tipoPausa);
    try {
      await pausarNodo(activo.id, tipoPausa, token);
      await cargar(token, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el punto.");
    } finally {
      setPausando(null);
    }
  };

  if (guard.loading || !token) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4">
        <p className="text-sm text-muted">Verificando acceso...</p>
      </main>
    );
  }

  const vis = activo ? statusVisible(activo) : null;
  const estadoLabel = pendienteVerificacion ? "pendiente GPS" : vis;
  const tabVisible = pendienteVerificacion && !["estado", "ajustes"].includes(tab) ? "estado" : tab;
  // Un acopio solo recibe y una entrega solo da: cada tipo opera una mitad (o
  // ambas, si es mixto). Los controles y avisos se acotan a lo que aplica.
  const operaRecepcion = activo ? activo.tipo !== "entrega" : false;
  const operaEntrega = activo ? activo.tipo !== "acopio" : false;
  const noOperativo = activo ? pausadoRelevante(activo) : false;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          &larr;
        </Link>
        <h1 className="text-lg font-bold">Panel de punto</h1>
        <button onClick={salir} className="ml-auto text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      {error && (
        <div className="card border-danger">
          <p className="text-sm font-semibold text-danger">{error}</p>
          <button onClick={() => cargar(token)} className="btn-ghost mt-2 w-full text-sm">
            Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <div className="card flex flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ) : nodos.length === 0 ? (
        <div className="card border-accent">
          <p className="text-sm text-muted">Aun no administras ningun punto.</p>
          <p className="mt-2 text-xs text-muted">
            El alta de nuevos puntos se gestiona desde solicitudes publicas y aprobacion de superadmin.
          </p>
        </div>
      ) : (
        activo && (
          <>
            {/* Barra de contexto: nombre + estado + selector, siempre visible sobre
                cualquier pestaña para no perder de vista sobre qué punto se opera. */}
            <div className="card flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{activo.nombre}</p>
                  <p className="truncate text-xs text-muted">{activo.direccion}</p>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-1 text-xs font-semibold " +
                    (pendienteVerificacion
                      ? "bg-danger/15 text-danger"
                      : vis === "activo"
                      ? "bg-accent/15 text-accent"
                      : vis === "pausado"
                      ? "bg-danger/15 text-danger"
                      : "bg-surface text-muted")
                  }
                >
                  {estadoLabel}
                </span>
              </div>
              {pendienteVerificacion && (
                <p className="text-xs font-semibold text-danger">
                  Verifica la ubicación del punto para habilitar inventario, pedidos y coordinación con centros cercanos.
                </p>
              )}
              {noOperativo && (
                <p className="text-xs font-semibold text-danger">
                  No operativo
                  {operaRecepcion && activo.pausado_recepcion ? " - recepcion pausada" : ""}
                  {operaEntrega && activo.pausado_entrega ? " - entrega pausada" : ""}
                </p>
              )}
              {nodos.length > 1 && (
                <select
                  className="field mt-1"
                  value={selectedNodeId}
                  onChange={(e) => setActiveNodeId(e.target.value)}
                >
                  {nodos.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {tabVisible === "estado" && (
              <div className="card flex flex-col gap-3">
                <p className="text-xs text-muted">Tipo: {activo.tipo}</p>
                <VerificarNodo
                  nodeId={activo.id}
                  token={token}
                  verificado={activo.verificado}
                  onVerificado={() => cargar(token, false)}
                />
                {!pendienteVerificacion && (
                  <div className="grid grid-cols-2 gap-2">
                    {operaRecepcion && (
                      <button
                        onClick={() => pausar("recepcion")}
                        disabled={pausando !== null}
                        className="btn-ghost text-sm disabled:opacity-50"
                      >
                        {pausando === "recepcion" ? "Pausando…" : "Pausar recepcion"}
                      </button>
                    )}
                    {operaEntrega && (
                      <button
                        onClick={() => pausar("entrega")}
                        disabled={pausando !== null}
                        className="btn-ghost text-sm disabled:opacity-50"
                      >
                        {pausando === "entrega" ? "Pausando…" : "Pausar entrega"}
                      </button>
                    )}
                    {/* Pausar ambas solo tiene sentido en un mixto: opera las dos mitades. */}
                    {operaRecepcion && operaEntrega && (
                      <button
                        onClick={() => pausar("ambas")}
                        disabled={pausando !== null}
                        className="btn-ghost text-sm disabled:opacity-50"
                      >
                        {pausando === "ambas" ? "Pausando…" : "Pausar ambas"}
                      </button>
                    )}
                    <button
                      onClick={() => pausar("reactivar")}
                      disabled={pausando !== null}
                      className="btn-ghost text-sm disabled:opacity-50"
                    >
                      {pausando === "reactivar" ? "Reactivando…" : "Reactivar"}
                    </button>
                  </div>
                )}
                {!pendienteVerificacion && <EstadoMovimientosNodo nodeId={activo.id} token={token} />}
              </div>
            )}

            {tabVisible === "inventario" && (
              <div className="card">
                <InventarioNodo nodeId={activo.id} token={token} tipo={activo.tipo} />
              </div>
            )}

            {tabVisible === "pedir" && (
              <div className="card">
                <SolicitudesNodo nodeId={activo.id} token={token} />
              </div>
            )}

            {tabVisible === "cercanos" && (
              <div className="card">
                <SolicitudesEntreCentros nodeId={activo.id} token={token} />
              </div>
            )}

            {tabVisible === "ajustes" && (
              <div className="card flex flex-col gap-2">
                {estadosError && (
                  <AvisoCarga>
                    No se pudieron cargar los estados. El selector de estado puede no mostrar opciones.
                  </AvisoCarga>
                )}
                <EditarNodo
                  nodo={activo}
                  estados={estados}
                  token={token}
                  onSaved={() => cargar(token, false)}
                />
              </div>
            )}

            <NodoTabBar
              active={tabVisible}
              onChange={setTab}
              alertas={{ estado: noOperativo || pendienteVerificacion }}
              disabled={{
                inventario: pendienteVerificacion,
                pedir: pendienteVerificacion,
                cercanos: pendienteVerificacion,
              }}
            />
          </>
        )
      )}
    </main>
  );
}
