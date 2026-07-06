"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import EstadoCombobox from "@/components/EstadoCombobox";
import FiltroCategorias from "@/components/FiltroCategorias";
import ListaLugares from "@/components/ListaLugares";
import MisReservasActivas from "@/components/MisReservasActivas";
import { useItemsRealtime } from "@/hooks/useItemsRealtime";
import {
  getCategorias,
  getEstados,
  getCentrosAcopioPorEstado,
  getZonasRescatePorEstado,
} from "@/lib/api";
import { resolverCentro, CARACAS } from "@/lib/geo";
import {
  Category,
  CentroAcopio,
  Coords,
  EstadoVenezuela,
  ZonaRescate,
} from "@/lib/types";

const MapaClusters = dynamic(() => import("@/components/MapaClusters"), { ssr: false });

export default function Buscar() {
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [estadoActivo, setEstadoActivo] = useState<string | null>(null);
  const [centros, setCentros] = useState<CentroAcopio[]>([]);
  const [zonas, setZonas] = useState<ZonaRescate[]>([]);
  const [centroActivo, setCentroActivo] = useState<string | null>(null);
  const [zonaActiva, setZonaActiva] = useState<string | null>(null);
  const [verMapa, setVerMapa] = useState(false);
  const [centro, setCentro] = useState<Coords>(CARACAS);
  const { puntos, cargando } = useItemsRealtime(
    activa ?? undefined,
    estadoActivo ?? undefined,
    centroActivo ?? undefined,
    zonaActiva ?? undefined
  );

  useEffect(() => {
    getCategorias()
      .then(setCategorias)
      .catch(() => {});
    getEstados()
      .then(setEstados)
      .catch(() => {});
  }, []);

  // Al cambiar de estado: cargar centros/zonas de ese estado y resetear los
  // selects de centro y zona a "Todos".
  useEffect(() => {
    // Reset de selects dependientes al cambiar de estado + fetch. Efecto
    // intencional; no es un store síncrono para useSyncExternalStore.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCentroActivo(null);
    setZonaActiva(null);
    if (!estadoActivo) {
      setCentros([]);
      setZonas([]);
      return;
    }
    let activo = true;
    Promise.all([
      getCentrosAcopioPorEstado(estadoActivo),
      getZonasRescatePorEstado(estadoActivo),
    ])
      .then(([cs, zs]) => {
        if (!activo) return;
        setCentros(cs);
        setZonas(zs);
      })
      .catch(() => {
        if (!activo) return;
        setCentros([]);
        setZonas([]);
      });
    return () => {
      activo = false;
    };
  }, [estadoActivo]);

  useEffect(() => {
    if (verMapa) resolverCentro().then(setCentro);
  }, [verMapa]);

  const filtros = (
    <>
      <FiltroCategorias categorias={categorias} activa={activa} onChange={setActiva} />
      <EstadoCombobox
        estados={estados}
        estadoId={estadoActivo}
        onChange={setEstadoActivo}
        includeTodos
        label="Filtrar por estado"
        placeholder="Todos los estados"
      />
      {estadoActivo && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-muted">Centro de acopio</label>
          <select
            value={centroActivo ?? ""}
            onChange={(e) => setCentroActivo(e.target.value || null)}
            className="field"
          >
            <option value="">Todos los centros</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      {estadoActivo && zonas.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-muted">Zona de rescate</label>
          <select
            value={zonaActiva ?? ""}
            onChange={(e) => setZonaActiva(e.target.value || null)}
            className="field"
          >
            <option value="">Todas las zonas</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
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

      <MisReservasActivas />

      {cargando && <p className="text-muted">Cargando...</p>}

      {!cargando && puntos.length === 0 && (
        <p className="text-muted">No hay insumos disponibles con estos filtros.</p>
      )}

      {!cargando && puntos.length > 0 && <ListaLugares puntos={puntos} />}
    </main>
  );
}
