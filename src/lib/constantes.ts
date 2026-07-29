// Constantes operativas compartidas (issue #81).
//
// Todas tienen un espejo en SQL: si cambias una acá, hay que cambiar la
// migración correspondiente (y al revés). El comentario de cada una dice dónde
// vive su fuente de verdad, para que el próximo cambio no quede a medias.

import { NodeTipo } from "@/lib/types";

// Tiempo estimado de llegada que se manda al comprometerse. La UI todavía no lo
// pregunta, así que va este valor fijo; la RPC aplica exactamente el mismo
// default cuando recibe 0 o null (0053: coalesce(nullif(p_tiempo_estimado,0), 240)).
export const TIEMPO_ESTIMADO_DEFECTO_MINUTOS = 240;

// Plazo del voluntario para retirar tras comprometerse.
// SQL: reservado_until = now() + interval '4 hours' (0053).
// Comparte el número con TIEMPO_ESTIMADO_DEFECTO_MINUTOS por coincidencia, no
// por relación: son dos plazos distintos y pueden cambiar por separado.
export const RETIRO_HORAS = 4;

// Plazo del nodo destino para confirmar que recibió lo comprometido. Vencido, la
// UI lo muestra como aviso; NO dispara bloqueo automático (0040).
export const CONFIRMACION_HORAS = 24;

// Cuánto vale la verificación de ubicación del voluntario antes de repetirla (0061).
export const VERIFICACION_UBICACION_HORAS = 24;

// Rango del VOLUNTARIO: radio en línea recta desde su ubicación verificada.
// SQL: verificar_ubicacion_voluntario (0061). Los 650/300 de 0047 quedaron atrás.
export const RANGO_VOLUNTARIO_KM = {
  conVehiculo: 40,
  sinVehiculo: 15,
} as const;

// Rango ENTRE NODOS: es otro flujo, otra RPC y otro número. No confundir con el
// de arriba. SQL: listar_solicitudes_para_nodo (0053).
export const RANGO_ENTRE_NODOS_KM = 650;

// Etiquetas del tipo de nodo. Son dos juegos a propósito: la vista pública tiene
// espacio para nombrar el punto completo, mientras que en las badges compactas
// del panel de superadmin solo entra una palabra.
export const TIPO_NODO_LABEL: Record<NodeTipo, string> = {
  acopio: "Centro de acopio",
  entrega: "Punto de entrega",
  mixto: "Acopio y entrega",
};

export const TIPO_NODO_LABEL_CORTO: Record<NodeTipo, string> = {
  acopio: "Acopio",
  entrega: "Entrega",
  mixto: "Mixto",
};
