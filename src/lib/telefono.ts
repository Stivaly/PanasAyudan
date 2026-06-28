// Normaliza y valida un número de WhatsApp venezolano.
// Devuelve el número en formato 58XXXXXXXXXX si es válido, o null si no lo es.
// Acepta entradas como: 0412-1234567, +58 412 1234567, 00584121234567, etc.
export function normalizarTelefonoVe(valor: string): string | null {
  let digits = valor.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = "58" + digits.slice(1);
  }
  return /^58(412|414|416|424|426)\d{7}$/.test(digits) ? digits : null;
}

// Un solo @ opcional al inicio, luego 5-32 caracteres [a-zA-Z0-9_].
// El guion bajo no puede ir al final: el último carácter debe ser alfanumérico.
const TELEGRAM_REGEX = /^@?(?=[a-zA-Z0-9_]{5,32}$)[a-zA-Z0-9_]*[a-zA-Z0-9]$/;

export function validarTelegram(value: string): boolean {
  return TELEGRAM_REGEX.test(value.trim());
}

// Devuelve un mensaje describiendo por qué el usuario de Telegram es inválido,
// o null si es válido. Pensado para mostrar un error específico al usuario.
export function errorTelegram(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // El campo es opcional; vacío no es un error aquí.
  const cuerpo = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (/@/.test(cuerpo)) {
    return "Solo puede llevar un @ y debe ir al inicio.";
  }
  if (/[^a-zA-Z0-9_]/.test(cuerpo)) {
    return "Solo se permiten letras, números y guion bajo (_).";
  }
  if (cuerpo.length < 5) {
    return "Debe tener al menos 5 caracteres.";
  }
  if (cuerpo.length > 32) {
    return "No puede tener más de 32 caracteres.";
  }
  if (cuerpo.endsWith("_")) {
    return "No puede terminar en guion bajo (_).";
  }
  return null;
}

export function normalizarTelegram(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}
