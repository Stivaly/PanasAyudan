// Formato de presentación de estados de Venezuela (solo front, sin tocar BD).
// Distrito Capital y Miranda conforman el área metropolitana de Caracas, así que
// en las listas se muestran con el prefijo "Caracas - " para orientar al usuario.
// Idempotente: no vuelve a prefijar si el nombre ya lo trae.

const CON_CARACAS = new Set(["distrito capital", "miranda"]);

export function formatEstadoNombre(nombre: string): string {
  if (!nombre) return nombre;
  if (nombre.startsWith("Caracas - ")) return nombre;
  return CON_CARACAS.has(nombre.trim().toLowerCase()) ? `Caracas - ${nombre}` : nombre;
}
