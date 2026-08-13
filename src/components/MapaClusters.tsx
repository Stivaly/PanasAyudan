"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps";
import { Coords } from "@/lib/types";
import Skeleton from "./Skeleton";

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

// Los estilos inline (el viejo MAPA_SOLO_BASE que ocultaba POIs) ya no se
// aplican: Google los ignora en cuanto el mapa declara un mapId, que es
// obligatorio para AdvancedMarkerElement. Ese estilo ahora se configura en la
// consola de Google Cloud sobre el Map ID, igual que el tema oscuro y que en
// MapaPicker.

// valor solo tiene sentido para clusters (cantidad de nodos agrupados); un
// nodo suelto no lleva número.
function pinSvg(valor?: number, pausado = false): string {
  const fontSize = valor != null && valor > 99 ? 14 : valor != null && valor > 9 ? 16 : 18;
  const texto =
    valor != null
      ? `<text x="24" y="29" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#fff">${valor}</text>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="56" viewBox="0 0 48 56">
    <defs>
      <linearGradient id="g" x1="10" y1="6" x2="38" y2="42" gradientUnits="userSpaceOnUse">
        <stop stop-color="${pausado ? "#fbbf24" : "#38bdf8"}"/>
        <stop offset="1" stop-color="${pausado ? "#f97316" : "#2563eb"}"/>
      </linearGradient>
      <filter id="s" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#0a0a0a" flood-opacity=".45"/>
      </filter>
    </defs>
    <path filter="url(#s)" d="M24 53c-2.9-5.1-17-17.2-17-30C7 13.1 14.6 6 24 6s17 7.1 17 17c0 12.8-14.1 24.9-17 30Z" fill="url(#g)" stroke="#0a0a0a" stroke-width="4"/>
    <circle cx="24" cy="23" r="13" fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>
    ${texto}
  </svg>`;
}

// AdvancedMarkerElement recibe un nodo del DOM, no una URL de icono. El marcador
// ancla el borde inferior del contenido en la coordenada, mientras que el icono
// viejo anclaba en (24,52) de un SVG de 48x56: los 4px de diferencia se
// compensan con el margen negativo para que la punta caiga en el mismo pixel.
function pinElement(valor?: number, pausado = false): HTMLElement {
  const cont = document.createElement("div");
  cont.style.marginBottom = "-4px";
  cont.style.lineHeight = "0";
  cont.innerHTML = pinSvg(valor, pausado);
  return cont;
}

export default function MapaClusters({ centro, nodos }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const centroAplicadoRef = useRef<Coords | null>(null);
  const idsAjustadosRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const router = useRouter();

  const inicializar = useCallback(async () => {
    setError(null);
    setCargando(true);
    try {
      await loadGoogleMaps();
      // El efecto de marcadores es síncrono: garantizamos acá que la librería
      // "marker" ya esté disponible antes de marcar el mapa como listo.
      await google.maps.importLibrary("marker");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el mapa.");
      return;
    } finally {
      setCargando(false);
    }
    if (!ref.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(ref.current, {
      center: centro,
      zoom: 13,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
      backgroundColor: "#0a0a0a",
      clickableIcons: false,
      mapId: MAP_ID,
    });
    centroAplicadoRef.current = centro;
    setMapReady(true);
  }, [centro]);

  useEffect(() => {
    // Carga inicial en efecto (intencional): dispara inicializar al montar o
    // al cambiar de centro.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void inicializar();
  }, [inicializar]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const previo = centroAplicadoRef.current;
    if (previo && previo.lat === centro.lat && previo.lng === centro.lng) return;
    centroAplicadoRef.current = centro;
    map.setCenter(centro);
  }, [centro]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const { AdvancedMarkerElement } = google.maps.marker;

    const markers = nodos.map((nodo) => {
      const marker = new AdvancedMarkerElement({
        position: { lat: nodo.lat, lng: nodo.lng },
        content: pinElement(undefined, nodo.pausado),
        title: nodo.nombre,
        // Sin gmpClickable el marcador avanzado no emite "click" (a diferencia
        // del Marker legacy, que era clickeable por defecto).
        gmpClickable: true,
        zIndex: 1,
      });
      marker.addListener("click", () => {
        router.push(`/nodo/${nodo.id}`);
      });
      return marker;
    });

    clustererRef.current?.clearMarkers();
    clustererRef.current = new MarkerClusterer({
      map,
      markers,
      renderer: {
        // El cluster va por encima de los pines sueltos (zIndex 1) y, entre
        // clusters, gana el que agrupa más nodos.
        render: ({ count, position }) =>
          new AdvancedMarkerElement({
            position,
            content: pinElement(count),
            zIndex: 1 + count,
          }),
      },
    });

    let zoomListener: google.maps.MapsEventListener | null = null;
    const idsActuales = nodos.map((nodo) => nodo.id).sort().join("|");
    if (nodos.length > 0 && idsActuales !== idsAjustadosRef.current) {
      idsAjustadosRef.current = idsActuales;
      const bounds = new google.maps.LatLngBounds();
      nodos.forEach((nodo) => bounds.extend({ lat: nodo.lat, lng: nodo.lng }));
      map.fitBounds(bounds);
      if (nodos.length === 1) {
        zoomListener = google.maps.event.addListenerOnce(map, "idle", () => {
          map.setZoom(15);
        });
      }
    }

    return () => {
      zoomListener?.remove();
      clustererRef.current?.clearMarkers();
      // El marcador avanzado se desmonta asignando map = null (no hay setMap).
      markers.forEach((m) => {
        m.map = null;
      });
    };
  }, [nodos, router, mapReady]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />
      {cargando && !mapReady && !error && <Skeleton className="absolute inset-0" />}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-bg/90 p-4">
          <div className="card border-danger flex max-w-xs flex-col items-center gap-2 text-center">
            <p className="text-sm font-semibold text-danger">{error}</p>
            <button onClick={() => void inicializar()} className="btn-ghost w-full text-sm">
              Reintentar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
