// localStorage puede lanzar en modo privado/storage bloqueado (Safari privado,
// cuota agotada, política de cookies, etc.). Estas envolturas devuelven
// null/no-op en vez de romper el flujo del componente que las llama.
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignorar: no hay forma de persistir, pero no debe romper el flujo.
  }
}
