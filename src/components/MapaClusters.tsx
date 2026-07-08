"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { loadGoogleMaps } from "@/lib/maps";
import { Coords } from "@/lib/types";

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

const MAPA_SOLO_BASE: google.maps.MapTypeStyle[] = [
  { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ saturation: -65 }, { lightness: 18 }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ saturation: -55 }, { lightness: 28 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ saturation: -45 }, { lightness: 10 }] },
];

function pinSvg(valor: number, pausado = false): string {
  const fontSize = valor > 99 ? 14 : valor > 9 ? 16 : 18;
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
    <text x="24" y="29" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#fff">${valor}</text>
  </svg>`;
}

function pinIcon(valor: number, pausado = false): google.maps.Icon {
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(pinSvg(valor, pausado)),
    scaledSize: new google.maps.Size(48, 56),
    anchor: new google.maps.Point(24, 52),
  };
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
      if (cancelado || !ref.current || mapRef.current) return;
      mapRef.current = new google.maps.Map(ref.current, {
        center: centro,
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        backgroundColor: "#0a0a0a",
        clickableIcons: false,
        styles: MAPA_SOLO_BASE,
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
    if (!mapReady || !map) return;

    const markers = nodos.map((nodo) => {
      const marker = new google.maps.Marker({
        position: { lat: nodo.lat, lng: nodo.lng },
        icon: pinIcon(1, nodo.pausado),
        title: nodo.nombre,
        zIndex: Number(google.maps.Marker.MAX_ZINDEX) + 1,
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
        render: ({ count, position }) =>
          new google.maps.Marker({
            position,
            icon: pinIcon(count),
            zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
          }),
      },
    });

    let zoomListener: google.maps.MapsEventListener | null = null;
    if (nodos.length > 0) {
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
      markers.forEach((m) => m.setMap(null));
    };
  }, [nodos, router, mapReady]);

  return <div ref={ref} className="h-full w-full" />;
}
