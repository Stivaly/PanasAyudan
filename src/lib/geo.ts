import { fetchConTimeout } from "./fetchConTimeout";
import { Coords } from "./types";

export const CARACAS: Coords = { lat: 10.4806, lng: -66.9036 };

async function fromIp(): Promise<Coords | null> {
  try {
    const res = await fetchConTimeout("https://ip-api.com/json", { cache: "no-store" }, 5000);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status === "success" && typeof data.lat === "number" && typeof data.lon === "number") {
      return { lat: data.lat, lng: data.lon };
    }
    return null;
  } catch {
    return null;
  }
}

// Solo consulta el estado del permiso. Nunca dispara el prompt.
async function permisoGpsConcedido(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.geolocation || !navigator.permissions) {
    return false;
  }
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state === "granted";
  } catch {
    return false;
  }
}

async function fromGps(): Promise<Coords | null> {
  return new Promise<Coords | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

// Cascada sin pedir nada al usuario. Devuelve siempre un centro válido. Si el
// permiso de GPS ya está concedido, corta directo a GPS sin esperar el fetch
// de IP; solo recurre a IP cuando no hay GPS disponible o falla.
export async function resolverCentro(): Promise<Coords> {
  if (await permisoGpsConcedido()) {
    const gps = await fromGps();
    if (gps) return gps;
  }
  const ip = await fromIp();
  return ip ?? CARACAS;
}
