// Validaciones reutilizables para datos del recogedor (cédula y placa).

export interface ResultadoValidacion {
  valida: boolean;
  error?: string;
}

// Rango plausible de cédulas venezolanas de personas vivas y ya asignadas.
// Por debajo del mínimo: números muy bajos (titulares fallecidos hace décadas
// o cédulas inventadas como 111.111). Por encima del máximo: números que la
// emisión aún no ha alcanzado para personas naturales (empresas/RIF o inexistentes).
export const CEDULA_MIN = 1_000_000;
export const CEDULA_MAX = 40_000_000;

// Valida una cédula venezolana: solo dígitos, 6-8 y dentro del rango vigente.
export function validarCedula(valor: string): ResultadoValidacion {
  const limpio = limpiarCedula(valor);
  if (/[^\d]/.test(valor.replace(/\./g, ""))) {
    return { valida: false, error: "Solo números, sin puntos ni guiones." };
  }
  if (limpio.length < 6 || limpio.length > 8) {
    return { valida: false, error: "La cédula debe tener entre 6 y 8 dígitos." };
  }
  const numero = Number(limpio);
  if (numero < CEDULA_MIN) {
    return { valida: false, error: "Ese número de cédula es demasiado bajo. Revisa que esté completo." };
  }
  if (numero > CEDULA_MAX) {
    return { valida: false, error: "Ese número de cédula aún no ha sido asignado en Venezuela. Revísalo." };
  }
  return { valida: true };
}

// Aplica formato con puntos separadores de miles: 1234567 → '1.234.567'.
export function formatearCedula(valor: string): string {
  const limpio = limpiarCedula(valor);
  if (!limpio) return "";
  return limpio.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Elimina puntos y cualquier no-dígito. Para enviar a BD y localStorage.
export function limpiarCedula(valor: string): string {
  return valor.replace(/\D/g, "");
}

// Valida una placa de vehículo particular venezolano (formato vigente o anterior).
export function validarPlaca(valor: string): ResultadoValidacion {
  const placa = formatearPlaca(valor);
  // Formato vigente desde 2008: AB123CD (2L + 3N + 2L).
  const vigente = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
  // Formato anterior 1982-2008: ABC123 o ABC123D (3L + 3N + 1L opcional).
  const anterior = /^[A-Z]{3}\d{3}[A-Z]?$/;
  if (vigente.test(placa) || anterior.test(placa)) {
    return { valida: true };
  }
  return {
    valida: false,
    error: "Formato de placa no reconocido. Ejemplos: AB123CD o ABC123",
  };
}

// Elimina espacios y guiones, convierte a uppercase.
export function formatearPlaca(valor: string): string {
  return valor.replace(/[\s-]/g, "").toUpperCase();
}
