export const DEFAULT_FETCH_TIMEOUT_MS = 15000;

// Envuelve fetch con un AbortSignal.timeout(). Si el caller ya pasó su propio
// signal, se respeta tal cual (no lo pisamos) en vez de asumir que nunca pasa.
export function fetchConTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  if (init?.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
