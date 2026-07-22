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

// Solo usa GPS si el permiso YA está concedido. Nunca dispara el prompt.
async function fromGpsIfGranted(): Promise<Coords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  try {
    if (navigator.permissions) {
      const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      if (status.state !== "granted") return null;
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return new Promise<Coords | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

// Cascada sin pedir nada al usuario. Devuelve siempre un centro válido.
export async function resolverCentro(): Promise<Coords> {
  const ip = await fromIp();
  const gps = await fromGpsIfGranted();
  return gps ?? ip ?? CARACAS;
}
