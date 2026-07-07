"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listarNodosMiembro } from "@/lib/api";
import { clearCachedRole, clearVolunteerToken } from "@/lib/supabase";
import InventarioNodo from "@/components/InventarioNodo";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { NodoMiembro } from "@/lib/types";

const REALTIME_TABLES = [
  { table: "centros_acopio" },
  { table: "node_admins" },
  { table: "node_collaborators" },
];

export default function ColaboradorPanel() {
  const router = useRouter();
  const guard = useRoleGuard(["colaborador"]);
  const token = guard.token;
  const [nodos, setNodos] = useState<NodoMiembro[]>([]);
  const [activeNodeId, setActiveNodeId] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback((t: string, mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    return listarNodosMiembro(t)
      .then((data) => {
        setNodos(data);
        setError(null);
      })
      .catch((e) => {
        setNodos([]);
        setError(e instanceof Error ? e.message : "No se pudieron cargar tus puntos.");
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    // Carga inicial al obtener el token validado por el guard (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar(token);
  }, [cargar, token]);

  useRealtimeRefresh(
    "nodos_miembro_changes",
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

  if (guard.loading || !token) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4">
        <p className="text-sm text-muted">Verificando acceso...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/voluntarios" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          &larr;
        </Link>
        <h1 className="text-lg font-bold">Panel de colaborador</h1>
        <button onClick={salir} className="ml-auto text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {cargando ? (
        <p className="text-sm text-muted">Cargando puntos...</p>
      ) : nodos.length === 0 ? (
        <div className="card border-accent">
          <p className="text-sm text-muted">Aun no colaboras en ningun punto.</p>
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
              <div>
                <p className="font-semibold">{activo.nombre}</p>
                <p className="text-xs text-muted">{activo.direccion}</p>
                <p className="mt-1 text-xs text-muted">Tipo: {activo.tipo}</p>
              </div>
              <InventarioNodo nodeId={activo.id} token={token} tipo={activo.tipo} soloColaborador />
            </div>
          )}
        </>
      )}
    </main>
  );
}
