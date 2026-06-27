"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps";
import { Coords } from "@/lib/types";
import { PuntoMapa } from "@/hooks/useItemsRealtime";

interface Props {
  centro: Coords;
  puntos: PuntoMapa[];
}

// Badge circular verde con la suma de stock disponible del lugar.
function badge(total: number): HTMLDivElement {
  const div = document.createElement("div");
  div.textContent = String(total);
  div.style.cssText =
    "background:#22c55e;color:#000;font-weight:700;font-size:13px;" +
    "width:34px;height:34px;border-radius:9999px;display:flex;" +
    "align-items:center;justify-content:center;border:2px solid #0a0a0a;cursor:pointer;";
  return div;
}

export default function MapaClusters({ centro, puntos }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelado = false;
    (async () => {
      await loadGoogleMaps();
      await google.maps.importLibrary("marker");
      if (cancelado || !ref.current || mapRef.current) return;
      mapRef.current = new google.maps.Map(ref.current, {
        center: centro,
        zoom: 13,
        mapId: MAP_ID,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        backgroundColor: "#0a0a0a",
      });
      setMapReady(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [centro]);

  useEffect(() => {
    mapRef.current?.setCenter(centro);
  }, [centro]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !google.maps.marker?.AdvancedMarkerElement) return;

    const markers = puntos.map((punto) => {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: punto.location.lat, lng: punto.location.lng },
        content: badge(punto.totalDisponible),
        title: punto.location.place_name,
      });
      marker.content?.addEventListener("click", () => {
        router.push(`/lugar/${punto.location.id}`);
      });
      return marker;
    });

    clustererRef.current?.clearMarkers();
    clustererRef.current = new MarkerClusterer({ map, markers });

    // Ajusta el encuadre para que se vean todos los puntos.
    let zoomListener: google.maps.MapsEventListener | null = null;
    if (puntos.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      puntos.forEach((punto) => {
        bounds.extend({ lat: punto.location.lat, lng: punto.location.lng });
      });
      map.fitBounds(bounds);
      // Con un solo punto, fitBounds acerca demasiado: fija un zoom razonable.
      if (puntos.length === 1) {
        zoomListener = google.maps.event.addListenerOnce(map, "idle", () => {
          map.setZoom(15);
        });
      }
    }

    return () => {
      zoomListener?.remove();
      clustererRef.current?.clearMarkers();
      markers.forEach((m) => (m.map = null));
    };
  }, [puntos, router, mapReady]);

  return <div ref={ref} className="h-full w-full" />;
}
