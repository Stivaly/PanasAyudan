"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import EstadoCombobox from "@/components/EstadoCombobox";
import FiltroCategorias from "@/components/FiltroCategorias";
import ListaLugares from "@/components/ListaLugares";
import { useItemsRealtime } from "@/hooks/useItemsRealtime";
import { getCategorias, getEstados } from "@/lib/api";
import { resolverCentro, CARACAS } from "@/lib/geo";
import { Category, Coords, EstadoVenezuela } from "@/lib/types";

const MapaClusters = dynamic(() => import("@/components/MapaClusters"), { ssr: false });

export default function Buscar() {
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [estadoActivo, setEstadoActivo] = useState<string | null>(null);
  const [verMapa, setVerMapa] = useState(false);
  const [centro, setCentro] = useState<Coords>(CARACAS);
  const { puntos, cargando } = useItemsRealtime(activa ?? undefined, estadoActivo ?? undefined);

  useEffect(() => {
    getCategorias()
      .then(setCategorias)
      .catch(() => {});
    getEstados()
      .then(setEstados)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (verMapa) resolverCentro().then(setCentro);
  }, [verMapa]);

  const filtros = (
    <>
      <EstadoCombobox
        estados={estados}
        estadoId={estadoActivo}
        onChange={setEstadoActivo}
        includeTodos
        label="Filtrar por estado"
        placeholder="Todos los estados"
      />
      <FiltroCategorias categorias={categorias} activa={activa} onChange={setActiva} />
    </>
  );

  if (verMapa) {
    return (
      <main className="relative h-dvh w-full overflow-hidden">
        <MapaClusters centro={centro} puntos={puntos} />
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-bg/95 to-transparent pb-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 px-3 pb-2">
            <button
              onClick={() => setVerMapa(false)}
              className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              ← Lista
            </button>
            <span className="text-sm font-semibold text-muted">Mapa</span>
          </div>
          <div className="flex flex-col gap-2 px-3">{filtros}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <h1 className="text-lg font-bold">Buscar insumos</h1>
      </div>

      {filtros}

      <button onClick={() => setVerMapa(true)} className="btn-ghost w-full">
        Ver en mapa
      </button>

      {cargando && <p className="text-muted">Cargando...</p>}

      {!cargando && puntos.length === 0 && (
        <p className="text-muted">No hay insumos disponibles con estos filtros.</p>
      )}

      {!cargando && puntos.length > 0 && <ListaLugares puntos={puntos} />}
    </main>
  );
}
