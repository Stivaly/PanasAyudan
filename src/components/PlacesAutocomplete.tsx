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

  const iniciar = async () => {
    if (montadoRef.current || cargando || !contRef.current) return;
    setCargando(true);
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
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      {!activo && (
        <input
          type="text"
          readOnly
          placeholder={cargando ? "Cargando…" : "Busca el lugar en Google"}
          className="field"
          onFocus={iniciar}
        />
      )}
      <div ref={contRef} />
    </div>
  );
}
