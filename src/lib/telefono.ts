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
