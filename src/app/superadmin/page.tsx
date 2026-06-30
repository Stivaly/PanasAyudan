"use client";

// Panel superadmin (issue #18, mínimo). Por ahora solo expone el cierre
// permanente de un nodo, que es exclusivo de superadmin (un admin del nodo solo
// puede pausarlo). El panel de aprobación/gestión completo llega en otro issue.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cerrarNodo, crearAdmin } from "@/lib/api";
import { getVolunteerToken, clearVolunteerToken, clearCachedRole } from "@/lib/supabase";

export default function SuperadminPanel() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Crear administrador (issue #17): nombre + apellido son los únicos campos
  // obligatorios de crear_admin; el resto de la firma es opcional.
  const [adminNombre, setAdminNombre] = useState("");
  const [adminApellido, setAdminApellido] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [creandoAdmin, setCreandoAdmin] = useState(false);

  useEffect(() => {
    setToken(getVolunteerToken());
  }, []);

  // Cierra la sesión: limpia el token persistente y el cache de rol, y vuelve a
  // /voluntarios para poder ingresar con otra cuenta. Sin esto el superadmin
  // quedaría atrapado en su panel (su token lo re-redirige aquí al entrar).
  const salir = () => {
    clearVolunteerToken();
    clearCachedRole();
    router.push("/voluntarios");
  };

  const cerrar = async () => {
    if (!token) return;
    setMensaje(null);
    setError(null);
    if (!nodeId.trim()) {
      setError("Ingresa el ID del punto a cerrar.");
      return;
    }
    setEnviando(true);
    try {
      await cerrarNodo(nodeId.trim(), token);
      setMensaje("Punto cerrado permanentemente.");
      setNodeId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el punto.");
    } finally {
      setEnviando(false);
    }
  };

  const crear = async () => {
    if (!token) return;
    setAdminError(null);
    if (!adminNombre.trim() || !adminApellido.trim()) {
      setAdminError("Nombre y apellido son obligatorios.");
      return;
    }
    setCreandoAdmin(true);
    try {
      const nuevo = await crearAdmin(
        { nombre: adminNombre.trim(), apellido: adminApellido.trim() },
        token
      );
      // El token se muestra UNA sola vez; no se puede recuperar después.
      setAdminToken(nuevo.token);
      setAdminNombre("");
      setAdminApellido("");
    } catch (e) {
      // Mensaje tal cual lo devuelve el backend (ej. 'no_autorizado').
      setAdminError(e instanceof Error ? e.message : "No se pudo crear el admin.");
    } finally {
      setCreandoAdmin(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/voluntarios" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <h1 className="text-lg font-bold">Panel superadmin</h1>
        <button onClick={salir} className="ml-auto text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      <div className="card border-accent flex flex-col gap-3">
        <p className="text-sm font-semibold text-accent">Cerrar punto (permanente)</p>
        <input
          className="field"
          placeholder="ID del punto"
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
        />
        <p className="text-xs text-muted">
          El cierre es permanente y deja de aparecer en público. No tiene reapertura.
        </p>
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        {mensaje && <p className="text-sm font-semibold text-accent">{mensaje}</p>}
        <button onClick={cerrar} disabled={enviando} className="btn-primary w-full disabled:opacity-50">
          {enviando ? "Cerrando…" : "Cerrar punto"}
        </button>
      </div>

      {/* Crear administrador (issue #17) */}
      <div className="card border-accent flex flex-col gap-3">
        <p className="text-sm font-semibold text-accent">Crear administrador</p>
        {adminToken ? (
          <>
            <p className="text-sm text-muted">
              Guarda este token y entrégaselo al admin. No se vuelve a mostrar y no se
              puede recuperar.
            </p>
            <input className="field font-mono text-sm" type="text" value={adminToken} readOnly />
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(adminToken)}
              className="btn-ghost w-full"
            >
              Copiar token
            </button>
            <button type="button" onClick={() => setAdminToken(null)} className="btn-primary w-full">
              Crear otro admin
            </button>
          </>
        ) : (
          <>
            <input
              className="field"
              placeholder="Nombre"
              value={adminNombre}
              onChange={(e) => setAdminNombre(e.target.value)}
            />
            <input
              className="field"
              placeholder="Apellido"
              value={adminApellido}
              onChange={(e) => setAdminApellido(e.target.value)}
            />
            {adminError && <p className="text-sm font-semibold text-danger">{adminError}</p>}
            <button
              onClick={crear}
              disabled={creandoAdmin}
              className="btn-primary w-full disabled:opacity-50"
            >
              {creandoAdmin ? "Creando…" : "Crear admin"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
