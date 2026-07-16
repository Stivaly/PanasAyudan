"use client";

import { useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps";
import { PlaceSeleccion } from "@/lib/types";

interface Props {
  onSelect: (place: PlaceSeleccion) => void;
}

interface GmpSelectEvent {
  placePrediction: { toPlace: () => google.maps.places.Place };
}

// Places API (nuevo): PlaceAutocompleteElement. La clase legacy Autocomplete
// no funciona con API keys nuevas. Carga diferida: Google solo se toca cuando
// el usuario enfoca el campo para empezar a escribir.
export default function PlacesAutocomplete({ onSelect }: Props) {
  const contRef = useRef<HTMLDivElement>(null);
  const montadoRef = useRef(false);
  const [cargando, setCargando] = useState(false);
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iniciar = async () => {
    if (montadoRef.current || cargando || !contRef.current) return;
    setCargando(true);
    setError(null);
    try {
      await loadGoogleMaps();
      const { PlaceAutocompleteElement } = (await google.maps.importLibrary(
        "places"
      )) as google.maps.PlacesLibrary;

      const el = new PlaceAutocompleteElement({
        includedRegionCodes: ["ve"],
        requestedLanguage: "es",
        requestedRegion: "VE",
      });
      el.style.width = "100%";

      el.addEventListener("gmp-select", async (event: Event) => {
        const { placePrediction } = event as unknown as GmpSelectEvent;
        const place = placePrediction.toPlace();
        await place.fetchFields({
          fields: ["id", "displayName", "formattedAddress", "location"],
        });
        if (!place.id || !place.location) return;
        onSelect({
          google_place_id: place.id,
          place_name: place.displayName ?? place.formattedAddress ?? "Lugar",
          lat: place.location.lat(),
          lng: place.location.lng(),
          address: place.formattedAddress ?? null,
        });
      });

      contRef.current.innerHTML = "";
      contRef.current.appendChild(el);
      montadoRef.current = true;
      setActivo(true);
      (el as unknown as HTMLElement).focus?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el buscador de lugares.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      {!activo && !error && (
        <input
          type="text"
          readOnly
          placeholder={cargando ? "Cargando…" : "Busca el lugar en Google"}
          className="field"
          onFocus={iniciar}
        />
      )}
      {error && (
        <div className="card border-danger flex flex-col gap-2">
          <p className="text-sm font-semibold text-danger">{error}</p>
          <button onClick={() => void iniciar()} className="btn-ghost text-sm">
            Reintentar
          </button>
        </div>
      )}
      <div ref={contRef} />
    </div>
  );
}
