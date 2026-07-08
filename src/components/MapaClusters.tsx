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
  const fondo = pausado
    ? "linear-gradient(135deg,#fbbf24 0%,#f97316 100%)"
    : "linear-gradient(135deg,#38bdf8 0%,#2563eb 100%)";
  div.style.cssText =
    `background:${fondo};width:22px;height:22px;border-radius:9999px;` +
    "border:3px solid #0a0a0a;box-shadow:0 0 0 1px rgba(255,255,255,.45),0 8px 18px rgba(37,99,235,.35);cursor:pointer;";
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
    clustererRef.current = new MarkerClusterer({
      map,
      markers,
      renderer: {
        render: ({ count, position }) =>
          new google.maps.Marker({
            position,
            icon: {
              url:
                "data:image/svg+xml;charset=UTF-8," +
                encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
                    <defs>
                      <linearGradient id="g" x1="8" y1="6" x2="36" y2="38" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#38bdf8"/>
                        <stop offset="1" stop-color="#2563eb"/>
                      </linearGradient>
                    </defs>
                    <circle cx="22" cy="22" r="18" fill="url(#g)" stroke="#0a0a0a" stroke-width="4"/>
                    <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1"/>
                    <text x="22" y="27" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#fff">${count}</text>
                  </svg>`
                ),
              scaledSize: new google.maps.Size(44, 44),
            },
            zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
          }),
      },
    });

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
