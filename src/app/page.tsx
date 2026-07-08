"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useVolunteerToken } from "@/hooks/useVolunteerToken";
import { obtenerRol } from "@/lib/api";
import { getCachedRole, setCachedRole } from "@/lib/supabase";
import { VolunteerRole } from "@/lib/types";
import SeccionImpacto from "@/components/SeccionImpacto";

const ModalBienvenida = dynamic(() => import("@/components/ModalBienvenida"), {
  ssr: false,
});

export default function Home() {
  const token = useVolunteerToken();
  const tieneToken = token !== null;
  const [role, setRole] = useState<VolunteerRole | null>(null);

  useEffect(() => {
    if (!token) {
      // Sin token, la sesion local vuelve al estado anonimo.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRole(null);
      return;
    }
    const cached = getCachedRole(token) as VolunteerRole | null;
    if (cached) {
      // El rol cacheado evita una llamada remota en la portada.
      setRole(cached);
      return;
    }
    let activo = true;
    obtenerRol(token)
      .then((r) => {
        if (!activo) return;
        setCachedRole(token, r);
        setRole(r);
      })
      .catch(() => {
        if (activo) setRole(null);
      });
    return () => {
      activo = false;
    };
  }, [token]);

  const panel = useMemo(() => {
    if (role === "admin") return { href: "/nodo", label: "Ir al panel de mi centro" };
    if (role === "colaborador") return { href: "/nodo/colaborador", label: "Ir al panel colaborador" };
    if (role === "superadmin") return { href: "/superadmin", label: "Ir al panel superadmin" };
    return { href: "/voluntarios", label: "Ir a mi panel voluntario" };
  }, [role]);

  return (
    <main className="relative flex min-h-dvh w-full flex-col bg-bg px-4 py-8">
      <ModalBienvenida />
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("abrir-bienvenida"))}
        className="absolute left-4 top-4 rounded-full border border-border bg-surface/90 px-4 py-2 text-sm font-semibold text-white"
      >
        Como funciona
      </button>
      <Link
        href={tieneToken ? panel.href : "/voluntarios"}
        className="absolute right-4 top-4 rounded-full border border-border bg-surface/90 px-4 py-2 text-sm font-semibold text-white"
      >
        {tieneToken ? "Mi panel" : "Entrar o registrarme"}
      </Link>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3">
        <header className="mb-5 text-center">
          <p className="mb-3 text-sm font-semibold text-accent" aria-label="Venezuela">
            Venezuela se ayuda
          </p>
          <h1 className="text-3xl font-bold text-white">Panas Ayudan</h1>
          <p className="mt-2 text-base text-muted">
            Coordina la busqueda y traslado de insumos entre centros de acopio y zonas de rescate.
          </p>
        </header>

        <div className="card border-accent bg-surface/80">
          <p className="text-lg font-bold text-white">En una emergencia, la ayuda cerca vale doble.</p>
          <p className="mt-2 text-sm text-muted">
            Facilita que centros de acopio o equipos de rescate encuentren insumos disponibles y los movilicen a zonas con necesidad.
          </p>
        </div>

        {tieneToken && (
          <div className="rounded-xl border border-green-400/40 bg-green-500/10 p-3 text-sm">
            <p className="font-semibold text-green-100">Sesion activa</p>
            <Link href={panel.href} className="mt-1 inline-block font-semibold text-accent underline">
              {panel.label}
            </Link>
          </div>
        )}

        {tieneToken ? (
          <Link href={panel.href} className="btn-primary w-full shadow-lg">
            {panel.label}
          </Link>
        ) : (
          <div className="rounded-xl border border-border bg-bg p-3 text-sm text-muted">
            Para publicar insumos primero debes crear una cuenta o entrar con tu codigo de acceso.
          </div>
        )}
        <Link href="/buscar" className="btn-ghost w-full shadow-lg">
          Necesito buscar algo
        </Link>
        <p className="mt-1 text-center text-xs text-muted">
          Coordinas recogidas en tu zona?{" "}
          <Link href="/voluntarios" className="font-semibold text-accent underline">
            Usa tu codigo de acceso
          </Link>
        </p>
        <p className="text-center text-xs text-muted">
          Tienes un centro de acopio o entrega?{" "}
          <Link href="/registrar-nodo" className="font-semibold text-accent underline">
            Registralo aqui
          </Link>
        </p>
      </div>

      <SeccionImpacto />
    </main>
  );
}
