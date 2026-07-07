"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getEstados, listarNodosAdmin, pausarNodo } from "@/lib/api";
import { clearCachedRole, clearVolunteerToken } from "@/lib/supabase";
import EditarNodo from "@/components/EditarNodo";
import InventarioNodo from "@/components/InventarioNodo";
import SolicitudesNodo from "@/components/SolicitudesNodo";
import VerificarNodo from "@/components/VerificarNodo";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { EstadoVenezuela, NodoAdmin, TipoPausa, statusVisible } from "@/lib/types";

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
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

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
    getEstados().then(setEstados).catch(() => setEstados([]));
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

  const salir = () => {
    clearVolunteerToken();
    clearCachedRole();
    router.push("/voluntarios");
  };

  const pausar = async (tipoPausa: TipoPausa) => {
    if (!token || !activo) return;
    try {
      await pausarNodo(activo.id, tipoPausa, token);
      await cargar(token, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el punto.");
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
  const noOperativo = Boolean(activo?.pausado_recepcion || activo?.pausado_entrega);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/voluntarios" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          &larr;
        </Link>
        <h1 className="text-lg font-bold">Panel de punto</h1>
        <button onClick={salir} className="ml-auto text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {cargando ? (
        <p className="text-sm text-muted">Cargando puntos...</p>
      ) : nodos.length === 0 ? (
        <div className="card border-accent">
          <p className="text-sm text-muted">Aun no administras ningun punto.</p>
          <p className="mt-2 text-xs text-muted">
            El alta de nuevos puntos se gestiona desde solicitudes publicas y aprobacion de superadmin.
          </p>
        </div>
      ) : (
        <>
          {nodos.length > 1 && (
            <div className="card flex flex-col gap-2">
              <label className="text-sm font-semibold text-muted">Punto activo</label>
              <select
                className="field"
                value={selectedNodeId}
                onChange={(e) => setActiveNodeId(e.target.value)}
              >
                {nodos.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activo && (
            <div className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{activo.nombre}</p>
                  <p className="text-xs text-muted">{activo.direccion}</p>
                  <p className="mt-1 text-xs text-muted">Tipo: {activo.tipo}</p>
                </div>
                <span
                  className={
                    "rounded-full px-2 py-1 text-xs font-semibold " +
                    (vis === "activo"
                      ? "bg-accent/15 text-accent"
                      : vis === "pausado"
                      ? "bg-danger/15 text-danger"
                      : "bg-surface text-muted")
                  }
                >
                  {vis}
                </span>
              </div>

              {noOperativo && (
                <p className="text-xs font-semibold text-danger">
                  No operativo
                  {activo.pausado_recepcion ? " - recepcion pausada" : ""}
                  {activo.pausado_entrega ? " - entrega pausada" : ""}
                </p>
              )}

              <VerificarNodo
                nodeId={activo.id}
                token={token}
                verificado={activo.verificado}
                onVerificado={() => cargar(token)}
              />

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => pausar("recepcion")} className="btn-ghost text-sm">
                  Pausar recepcion
                </button>
                <button onClick={() => pausar("entrega")} className="btn-ghost text-sm">
                  Pausar entrega
                </button>
                <button onClick={() => pausar("ambas")} className="btn-ghost text-sm">
                  Pausar ambas
                </button>
                <button onClick={() => pausar("reactivar")} className="btn-ghost text-sm">
                  Reactivar
                </button>
              </div>

              <InventarioNodo nodeId={activo.id} token={token} tipo={activo.tipo} />
              <SolicitudesNodo nodeId={activo.id} token={token} />
              <EditarNodo
                nodo={activo}
                estados={estados}
                token={token}
                onSaved={() => cargar(token)}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
