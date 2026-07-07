"use client";

import { useEffect, useRef, useState } from "react";
import PlacesAutocomplete from "./PlacesAutocomplete";
import MapaPicker from "./MapaPicker";
import { resolverCentro } from "@/lib/geo";
import { Coords, PlaceSeleccion } from "@/lib/types";

// Ubicación seleccionada para un nodo: coordenadas + dirección legible + el
// place_id de Google si vino del buscador (null si el pin se marcó a mano).
export interface UbicacionSeleccion {
  lat: number;
  lng: number;
  direccion: string;
  google_place_id: string | null;
}

interface Props {
  valor: UbicacionSeleccion | null;
  onChange: (u: UbicacionSeleccion | null) => void;
  allowManual?: boolean;
}

// Selector de ubicación reutilizable (issue #29): busca el lugar en Google
// (PlaceAutocompleteElement) o marca el pin a mano en el mapa (MapaPicker). El
// centro del mapa lo resuelve resolverCentro (IP -> GPS solo si ya autorizado):
// nunca dispara el prompt de permisos.
export default function UbicacionPicker({ valor, onChange, allowManual = true }: Props) {
  const [centro, setCentro] = useState<Coords | null>(null);
  const [manual, setManual] = useState(false);
  const [coordsManual, setCoordsManual] = useState<Coords | null>(null);
  const [direccionManual, setDireccionManual] = useState("");
  const centroPedido = useRef(false);

  // El centro solo se resuelve cuando el usuario abre el modo manual (evita
  // pegarle a la IP/GPS si va a usar el buscador de Google).
  useEffect(() => {
    if (!manual || centroPedido.current) return;
    centroPedido.current = true;
    resolverCentro().then(setCentro);
  }, [manual]);

  const elegirPlace = (p: PlaceSeleccion) => {
    onChange({
      lat: p.lat,
      lng: p.lng,
      direccion: p.address ?? p.place_name,
      google_place_id: p.google_place_id,
    });
  };

  const confirmarManual = () => {
    if (!coordsManual || !direccionManual.trim()) return;
    onChange({
      lat: coordsManual.lat,
      lng: coordsManual.lng,
      direccion: direccionManual.trim(),
      google_place_id: null,
    });
    setManual(false);
  };

  const limpiar = () => {
    onChange(null);
    setManual(false);
    setCoordsManual(null);
    setDireccionManual("");
  };

  if (valor) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-xl border border-border bg-bg p-3">
        <div>
          <p className="text-sm font-semibold">{valor.direccion}</p>
          <p className="text-xs text-muted">
            {valor.lat.toFixed(5)}, {valor.lng.toFixed(5)}
          </p>
        </div>
        <button type="button" onClick={limpiar} className="text-sm font-semibold text-muted">
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!manual ? (
        <>
          <PlacesAutocomplete onSelect={elegirPlace} />
          {allowManual && (
            <button
              type="button"
              onClick={() => setManual(true)}
              className="text-sm font-semibold text-accent underline self-start"
            >
              No lo encuentro, marcar en el mapa
            </button>
          )}
        </>
      ) : (
        <>
          {centro ? (
            <MapaPicker centro={centro} valor={coordsManual} onChange={setCoordsManual} />
          ) : (
            <p className="text-sm text-muted">Cargando mapa…</p>
          )}
          <input
            className="field"
            placeholder="Dirección o referencia del punto"
            value={direccionManual}
            onChange={(e) => setDireccionManual(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={confirmarManual}
              disabled={!coordsManual || !direccionManual.trim()}
              className="btn-primary text-sm disabled:opacity-50"
            >
              Usar esta ubicación
            </button>
            <button
              type="button"
              onClick={() => setManual(false)}
              className="btn-ghost text-sm"
            >
              Buscar en Google
            </button>
          </div>
        </>
      )}
    </div>
  );
}
