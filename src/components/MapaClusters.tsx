"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps";
import { Coords } from "@/lib/types";

// Marcador de un nodo en el mapa público (issue #24). Sin contador de stock: el
// modelo de nodos no expone cantidades. Un nodo pausado se pinta en ámbar.
export interface NodoMapa {
  id: string;
  lat: number;
  lng: number;
  nombre: string;
  pausado: boolean;
}

interface Props {
  centro: Coords;
  nodos: NodoMapa[];
}

// Pin circular (sin número). Verde = operativo, ámbar = pausado.
function pin(pausado: boolean): HTMLDivElement {
  const div = document.createElement("div");
  const color = pausado ? "#f59e0b" : "#22c55e";
  div.style.cssText =
    `background:${color};width:20px;height:20px;border-radius:9999px;` +
    "border:3px solid #0a0a0a;box-shadow:0 0 0 1px rgba(255,255,255,.35);cursor:pointer;";
  return div;
}

export default function MapaClusters({ centro, nodos }: Props) {
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

    const markers = nodos.map((nodo) => {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: nodo.lat, lng: nodo.lng },
        content: pin(nodo.pausado),
        title: nodo.nombre,
      });
      marker.content?.addEventListener("click", () => {
        router.push(`/nodo/${nodo.id}`);
      });
      return marker;
    });

    clustererRef.current?.clearMarkers();
    clustererRef.current = new MarkerClusterer({ map, markers });

    // Ajusta el encuadre para que se vean todos los nodos.
    let zoomListener: google.maps.MapsEventListener | null = null;
    if (nodos.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      nodos.forEach((nodo) => bounds.extend({ lat: nodo.lat, lng: nodo.lng }));
      map.fitBounds(bounds);
      // Con un solo nodo, fitBounds acerca demasiado: fija un zoom razonable.
      if (nodos.length === 1) {
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
  }, [nodos, router, mapReady]);

  return <div ref={ref} className="h-full w-full" />;
}
