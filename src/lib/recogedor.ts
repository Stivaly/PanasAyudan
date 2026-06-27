// Identidad local del recogedor (quien va a buscar insumos).
// No es un voluntario registrado ni hay autenticación: solo datos en
// localStorage + un token UUID permanente que identifica a este dispositivo.

export interface RecogedorLocal {
  nombre: string;
  apellido: string;
  cedula: string;
}

const DATA_KEY = "panas_recogedor";
const TOKEN_KEY = "panas_recogedor_token";

// Datos guardados del recogedor en este navegador, o null si nunca reservó.
export function getRecogedorLocal(): RecogedorLocal | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DATA_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RecogedorLocal>;
    if (
      typeof parsed?.nombre === "string" &&
      typeof parsed?.apellido === "string" &&
      typeof parsed?.cedula === "string"
    ) {
      return { nombre: parsed.nombre, apellido: parsed.apellido, cedula: parsed.cedula };
    }
    return null;
  } catch {
    return null;
  }
}

// Persiste los datos del recogedor para pre-rellenar próximas reservas.
export function saveRecogedorLocal(data: RecogedorLocal): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

// Token UUID permanente de este dispositivo. Se genera la primera vez que se
// necesita y nunca expira desde el frontend. Devuelve null solo en SSR.
export function getRecogedorToken(): string | null {
  if (typeof window === "undefined") return null;
  let token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}
