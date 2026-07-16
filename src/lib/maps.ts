import { Coords } from "./types";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY as string;

// Map ID requerido por AdvancedMarkerElement. El tema oscuro se configura en
// la consola de Google Cloud sobre este Map ID (los styles inline se ignoran
// cuando hay mapId). DEMO_MAP_ID sirve para probar (con estilo claro de Google).
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

let loaderPromise: Promise<typeof google> | null = null;

const MAPS_LOAD_TIMEOUT_MS = 15000;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps solo carga en el cliente."));
  }
  const w = window as unknown as { google?: typeof google } & Record<string, unknown>;
  if (w.google?.maps) {
    return Promise.resolve(w.google);
  }
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const cbName = "__panas_gmaps_cb";

    const timeoutId = setTimeout(() => {
      reject(new Error("Tiempo de espera agotado al cargar Google Maps."));
    }, MAPS_LOAD_TIMEOUT_MS);

    w[cbName] = () => {
      clearTimeout(timeoutId);
      resolve(w.google as typeof google);
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${API_KEY}` +
      `&libraries=places,geometry,marker&language=es&region=VE&callback=${cbName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error("No se pudo cargar Google Maps."));
    };
    document.head.appendChild(script);
  });

  // Si falla (timeout o error de red), no dejamos la promesa rechazada
  // cacheada para siempre: un reintento del usuario debe volver a intentar
  // cargar el script, no recibir el mismo error de forma indefinida.
  loaderPromise.catch(() => {
    loaderPromise = null;
  });

  return loaderPromise;
}

export interface DistanciaResultado {
  destino: Coords;
  metros: number;
  segundos: number;
}

// Calcula distancia/tiempo desde un origen a varios destinos (en lotes de 25).
export async function calcularDistancias(
  origen: Coords,
  destinos: Coords[]
): Promise<DistanciaResultado[]> {
  if (destinos.length === 0) return [];
  await loadGoogleMaps();
  const service = new google.maps.DistanceMatrixService();
  const out: DistanciaResultado[] = [];

  for (let i = 0; i < destinos.length; i += 25) {
    const lote = destinos.slice(i, i + 25);
    const respuesta = await new Promise<google.maps.DistanceMatrixResponse | null>(
      (resolve) => {
        service.getDistanceMatrix(
          {
            origins: [new google.maps.LatLng(origen.lat, origen.lng)],
            destinations: lote.map((d) => new google.maps.LatLng(d.lat, d.lng)),
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (res, status) => resolve(status === "OK" ? res : null)
        );
      }
    );

    const fila = respuesta?.rows?.[0]?.elements ?? [];
    lote.forEach((destino, idx) => {
      const el = fila[idx];
      out.push({
        destino,
        metros: el?.status === "OK" ? el.distance.value : Number.POSITIVE_INFINITY,
        segundos: el?.status === "OK" ? el.duration.value : Number.POSITIVE_INFINITY,
      });
    });
  }

  return out;
}
