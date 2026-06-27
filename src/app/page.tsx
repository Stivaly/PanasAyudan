"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getVolunteerToken } from "@/lib/supabase";
import SeccionImpacto from "@/components/SeccionImpacto";

export default function Home() {
  const [tieneToken, setTieneToken] = useState(false);

  useEffect(() => {
    setTieneToken(Boolean(getVolunteerToken()));
  }, []);
  return (
    <main className="relative flex min-h-dvh w-full flex-col bg-bg px-4 py-8">
      <Link
        href="/voluntarios"
        className="absolute right-4 top-4 rounded-full border border-border bg-surface/90 px-4 py-2 text-sm font-semibold text-white"
      >
        Voluntarios
      </Link>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3">
        <header className="mb-5 text-center">
          <p className="mb-3 text-sm font-semibold text-accent" aria-label="Venezuela">
            🇻🇪 Venezuela se ayuda
          </p>
          <h1 className="text-3xl font-bold text-white">Panas Ayudan</h1>
          <p className="mt-2 text-base text-muted">
            Coordina la búsqueda y traslado de insumos entre centros de acopio y zonas de rescate.
          </p>
        </header>

        <div className="card border-accent bg-surface/80">
          <p className="text-lg font-bold text-white">En una emergencia, la ayuda cerca vale doble.</p>
          <p className="mt-2 text-sm text-muted">
            Facilita que centros de acopio o equipos de rescate encuentren insumos disponibles y los movilicen a zonas con necesidad.
          </p>
        </div>

        {tieneToken ? (
          <Link href="/dar" className="btn-primary w-full shadow-lg">
            Tengo algo para dar
          </Link>
        ) : (
          <div className="rounded-xl border border-border bg-bg p-3 text-sm text-muted">
            Para publicar insumos debes registrarte como voluntario primero.
          </div>
        )}
        <Link href="/buscar" className="btn-ghost w-full shadow-lg">
          Necesito buscar algo
        </Link>
        <p className="mt-1 text-center text-xs text-muted">
          ¿Coordinas recogidas en tu zona?{" "}
          <Link href="/voluntarios" className="font-semibold text-accent underline">
            Entra como voluntario
          </Link>
        </p>
      </div>

      <SeccionImpacto />
    </main>
  );
}
