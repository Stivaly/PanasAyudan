"use client";

// Vista pública de búsqueda (issue #24): lista de nodos activos y verificados con
// sus categorías disponibles. Lista primero (definicion.md); el mapa se carga bajo
// demanda con dynamic import — sin ningún request de mapa hasta tocar "Ver en mapa".

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import BotonVolver from "@/components/BotonVolver";
import FiltrosBuscar from "@/components/FiltrosBuscar";
import ListaNodos from "@/components/ListaNodos";
import SkeletonListaNodos from "@/components/SkeletonListaNodos";
import type { NodoMapa } from "@/components/MapaClusters";
import { useNodosPublicos } from "@/hooks/useNodosPublicos";
import { getCategorias, getEstados } from "@/lib/api";
import { resolverCentro, CARACAS } from "@/lib/geo";
import { Category, Coords, EstadoVenezuela, statusVisible } from "@/lib/types";

const MapaClusters = dynamic(() => import("@/components/MapaClusters"), { ssr: false });

// Nodos por página en la lista: acota la altura para que no baje infinito.
const POR_PAGINA = 8;

export default function Buscar() {
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [estadoId, setEstadoId] = useState<string | null>(null);
  const [verMapa, setVerMapa] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [centroUsuario, setCentroUsuario] = useState<Coords>(CARACAS);
  const { nodos, cargando } = useNodosPublicos();

  useEffect(() => {
    getCategorias().then(setCategorias).catch(() => {});
    getEstados().then(setEstados).catch(() => {});
  }, []);

  // Filtra por estado (estado_id) y por macrocategoría disponible (slug).
  const nodosFiltrados = useMemo(() => {
    const categoriaSeleccionada = categorias.find((c) => c.slug === activa);
    return nodos.filter(
      (n) =>
        (!estadoId || n.estado_id === estadoId) &&
        (!activa ||
          n.categorias.some(
            (c) => c.slug === activa || (categoriaSeleccionada && c.id === categoriaSeleccionada.id)
          ))
    );
  }, [nodos, activa, estadoId, categorias]);

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

  // El mapa lleva a la persona hacia los puntos disponibles: el centro inicial es
  // el centroide de los marcadores (MapaClusters luego ajusta el encuadre con
  // fitBounds). Solo si no hay puntos se recurre a la ubicación del usuario.
  const centroPuntos = useMemo<Coords | null>(() => {
    if (marcadores.length === 0) return null;
    const suma = marcadores.reduce(
      (acc, m) => ({ lat: acc.lat + m.lat, lng: acc.lng + m.lng }),
      { lat: 0, lng: 0 }
    );
    return { lat: suma.lat / marcadores.length, lng: suma.lng / marcadores.length };
  }, [marcadores]);

  useEffect(() => {
    if (verMapa && !centroPuntos) resolverCentro().then(setCentroUsuario);
  }, [verMapa, centroPuntos]);

  const centro = centroPuntos ?? centroUsuario;

  // Reinicia a la primera página cuando cambian los filtros o la lista.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPagina(1);
  }, [activa, estadoId, nodosFiltrados.length]);

  const totalPaginas = Math.max(1, Math.ceil(nodosFiltrados.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = nodosFiltrados.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA
  );

  const filtros = (
    <FiltrosBuscar
      estados={estados}
      categorias={categorias}
      estadoId={estadoId}
      categoria={activa}
      onEstado={setEstadoId}
      onCategoria={setActiva}
    />
  );

  if (verMapa) {
    return (
      <main className="relative h-dvh w-full overflow-hidden">
        <MapaClusters
          key={`${estadoId ?? "todos"}-${activa ?? "todas"}-${marcadores.map((m) => m.id).join("|")}`}
          centro={centro}
          nodos={marcadores}
        />
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-bg/95 to-transparent pb-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 px-3 pb-2">
            <button
              onClick={() => setVerMapa(false)}
              className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              ← Lista
            </button>
            <span className="text-sm font-semibold text-muted">
              Mapa · {marcadores.length} punto{marcadores.length === 1 ? "" : "s"}
            </span>
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

      {cargando && <SkeletonListaNodos />}

      {!cargando && nodosFiltrados.length === 0 && (
        <p className="text-muted">No hay puntos de ayuda disponibles con este filtro.</p>
      )}

      {!cargando && nodosFiltrados.length > 0 && (
        <>
          <ListaNodos nodos={visibles} />

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="btn-ghost text-sm disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="text-xs font-semibold text-muted">
                Página {paginaActual} de {totalPaginas}
              </span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                className="btn-ghost text-sm disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
