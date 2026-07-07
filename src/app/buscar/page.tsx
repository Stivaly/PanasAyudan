"use client";

// Vista pública de búsqueda (issue #24): lista de nodos activos y verificados con
// sus categorías disponibles. Lista primero (definicion.md); el mapa se carga bajo
// demanda con dynamic import — sin ningún request de mapa hasta tocar "Ver en mapa".

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import BotonVolver from "@/components/BotonVolver";
import FiltroCategorias from "@/components/FiltroCategorias";
import ListaNodos from "@/components/ListaNodos";
import type { NodoMapa } from "@/components/MapaClusters";
import { useNodosPublicos } from "@/hooks/useNodosPublicos";
import { getCategorias } from "@/lib/api";
import { resolverCentro, CARACAS } from "@/lib/geo";
import { Category, Coords, statusVisible } from "@/lib/types";

const MapaClusters = dynamic(() => import("@/components/MapaClusters"), { ssr: false });

export default function Buscar() {
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [verMapa, setVerMapa] = useState(false);
  const [centro, setCentro] = useState<Coords>(CARACAS);
  const { nodos, cargando } = useNodosPublicos();

  useEffect(() => {
    getCategorias()
      .then(setCategorias)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (verMapa) resolverCentro().then(setCentro);
  }, [verMapa]);

  // Filtra por macrocategoría disponible (slug). Sin filtro => todos.
  const nodosFiltrados = useMemo(() => {
    if (!activa) return nodos;
    return nodos.filter((n) => n.categorias.some((c) => c.slug === activa));
  }, [nodos, activa]);

  // Marcadores del mapa: solo nodos con coordenadas, sin contador de stock.
  const marcadores = useMemo<NodoMapa[]>(
    () =>
      nodosFiltrados
        .filter((n) => n.lat !== null && n.lng !== null)
        .map((n) => ({
          id: n.id,
          lat: n.lat as number,
          lng: n.lng as number,
          nombre: n.nombre,
          pausado: statusVisible(n) === "pausado",
        })),
    [nodosFiltrados]
  );

  const filtros = (
    <FiltroCategorias categorias={categorias} activa={activa} onChange={setActiva} />
  );

  if (verMapa) {
    return (
      <main className="relative h-dvh w-full overflow-hidden">
        <MapaClusters centro={centro} nodos={marcadores} />
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
          <div className="px-3">{filtros}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <BotonVolver />
        <h1 className="text-lg font-bold">Puntos de ayuda</h1>
      </div>

      {filtros}

      <button onClick={() => setVerMapa(true)} className="btn-ghost w-full">
        Ver en mapa
      </button>

      {cargando && <p className="text-muted">Cargando...</p>}

      {!cargando && nodosFiltrados.length === 0 && (
        <p className="text-muted">No hay puntos de ayuda disponibles con este filtro.</p>
      )}

      {!cargando && nodosFiltrados.length > 0 && <ListaNodos nodos={nodosFiltrados} />}
    </main>
  );
}
