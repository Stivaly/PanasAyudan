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
            Mueve insumos desde donde sobran hacia donde hacen falta.
          </p>
        </header>

        <div className="card border-accent bg-surface/80">
          <p className="text-lg font-bold text-white">En una emergencia, la ayuda cerca vale doble.</p>
          <p className="mt-2 text-sm text-muted">
            Publica lo que tienes para dar, o búscalo en el mapa y ve a buscarlo.
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
