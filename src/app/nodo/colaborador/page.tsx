"use client";

// Panel de colaborador (issue #17 fijó el routing; issue #22 lo hace operativo):
// el colaborador ve el inventario de su(s) nodo(s) y solo puede marcar "no hay" y
// solicitar reposición — no configura items ni condiciones (eso es del admin).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listarNodosMiembro } from "@/lib/api";
import { getVolunteerToken, clearVolunteerToken, clearCachedRole } from "@/lib/supabase";
import InventarioNodo from "@/components/InventarioNodo";
import { NodoMiembro } from "@/lib/types";

export default function ColaboradorPanel() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [nodos, setNodos] = useState<NodoMiembro[]>([]);

  useEffect(() => {
    const t = getVolunteerToken();
    // Lectura de token + carga inicial en el mismo efecto (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t);
    if (t) {
      listarNodosMiembro(t).then(setNodos).catch(() => setNodos([]));
    }
  }, []);

  // Cierra la sesión y vuelve a /voluntarios para entrar con otra cuenta.
  const salir = () => {
    clearVolunteerToken();
    clearCachedRole();
    router.push("/voluntarios");
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/voluntarios" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <h1 className="text-lg font-bold">Panel de colaborador</h1>
        <button onClick={salir} className="ml-auto text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      {nodos.length === 0 ? (
        <div className="card border-accent">
          <p className="text-sm text-muted">Aún no colaboras en ningún punto.</p>
        </div>
      ) : (
        nodos.map((n) => (
          <div key={n.id} className="card flex flex-col gap-3">
            <div>
              <p className="font-semibold">{n.nombre}</p>
              <p className="text-xs text-muted">{n.direccion}</p>
              <p className="mt-1 text-xs text-muted">Tipo: {n.tipo}</p>
            </div>
            {token && <InventarioNodo nodeId={n.id} token={token} tipo={n.tipo} soloColaborador />}
          </div>
        ))
      )}
    </main>
  );
}
