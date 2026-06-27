"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps";
import { Coords } from "@/lib/types";

interface Props {
  centro: Coords;
  valor: Coords | null;
  onChange: (coords: Coords) => void;
}

function aCoords(
  p:
    | google.maps.LatLng
    | google.maps.LatLngLiteral
    | google.maps.LatLngAltitude
    | null
    | undefined
): Coords | null {
  if (!p) return null;
  const lat = typeof p.lat === "function" ? p.lat() : p.lat;
  const lng = typeof p.lng === "function" ? p.lng() : p.lng;
  return { lat, lng };
}

// Mapa de referencia para ubicar el lugar a mano. El pin arranca en el centro
// resuelto (IP/GPS) y el usuario lo ajusta tocando o arrastrando.
export default function MapaPicker({ centro, valor, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    let cancelado = false;
    const inicial = valor ?? centro;

    (async () => {
      await loadGoogleMaps();
      const { AdvancedMarkerElement } = (await google.maps.importLibrary(
        "marker"
      )) as google.maps.MarkerLibrary;
      if (cancelado || !ref.current || mapRef.current) return;

      const map = new google.maps.Map(ref.current, {
        center: inicial,
        zoom: 15,
        mapId: MAP_ID,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        backgroundColor: "#0a0a0a",
      });
      mapRef.current = map;

      const marker = new AdvancedMarkerElement({
        map,
        position: inicial,
        gmpDraggable: true,
      });
      markerRef.current = marker;
      onChange(inicial);

      const fijar = (coords: Coords | null) => {
        if (!coords) return;
        marker.position = coords;
        onChange(coords);
      };

      map.addListener("click", (e: google.maps.MapMouseEvent) =>
        fijar(aCoords(e.latLng))
      );
      marker.addListener("dragend", () => fijar(aCoords(marker.position)));
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div ref={ref} className="h-56 w-full" />
    </div>
  );
}
