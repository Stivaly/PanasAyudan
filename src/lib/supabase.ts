import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno."
  );
}

const DEFAULT_FETCH_TIMEOUT_MS = 15000;

// Envuelve fetch con un AbortSignal.timeout(). Si el caller ya pasó su propio
// signal, se respeta tal cual (no lo pisamos) en vez de asumir que nunca pasa.
export function fetchConTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  if (init?.signal) return fetch(input, init);
  // webviews viejos (chrome <103 / safari <16) no tienen AbortSignal.timeout;
  // mejor degradar al comportamiento anterior que romper todas las llamadas.
  if (typeof AbortSignal.timeout !== "function") return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

// Cliente público (sin token de voluntario). Lectura de mapa, stock, RPC públicas.
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  { auth: { persistSession: false }, global: { fetch: fetchConTimeout } }
);

const TOKEN_KEY = "panas_volunteer_token";

export function getVolunteerToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setVolunteerToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearVolunteerToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

// Cache de rol de la sesión (issue #17). Se resuelve UNA sola vez al ingresar el
// token y se guarda en sessionStorage (no en localStorage: vive solo mientras la
// pestaña esté abierta), separado del token persistente de arriba. Si el token
// guardado no coincide con el ingresado, el cache se considera inválido y el
// llamador debe volver a pedir el rol con obtenerRol().
const SESSION_ROLE_KEY = "panas_session_role";

export function getCachedRole(token: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_ROLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; role?: string };
    // El cache solo vale si es del mismo token; si cambió, se invalida.
    return parsed.token === token && parsed.role ? parsed.role : null;
  } catch {
    return null;
  }
}

export function setCachedRole(token: string, role: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_ROLE_KEY, JSON.stringify({ token, role }));
}

export function clearCachedRole(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_ROLE_KEY);
}

// Cliente autenticado por token: envía el header 'volunteer-token' en cada request.
// Las policies RLS y las RPC con token lo leen desde request.headers.
// Memoizado por token (issue #85): evita instanciar un SupabaseClient nuevo en
// cada llamada cuando el token no cambió.
const clientsPorToken = new Map<string, SupabaseClient>();

export function supabaseWithToken(token: string): SupabaseClient {
  const existente = clientsPorToken.get(token);
  if (existente) return existente;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { "volunteer-token": token }, fetch: fetchConTimeout },
  });
  clientsPorToken.set(token, client);
  return client;
}
