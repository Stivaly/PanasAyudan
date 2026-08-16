// Clases compartidas de controles (issue #160).
//
// Las acciones de las tarjetas son enlaces de texto pequeños: "Editar",
// "Eliminar", "Recibido", "Marcar no hay". Medían 16px de alto, o sea un tercio
// del mínimo cómodo para un pulgar, y varias son la acción principal de su
// tarjeta. Esta app se usa de pie, con una mano y con prisa.
//
// El alto mínimo y el relleno lateral no cambian el tamaño de la letra: el
// control sigue pareciendo un enlace discreto, pero su área tocable llega a
// 44px por los dos lados.
export const ACCION_TEXTO =
  "inline-flex min-h-[44px] items-center px-2 text-xs font-semibold";

// Igual, para las acciones de cabecera tipo "Salir", que van en text-sm.
export const ACCION_CABECERA =
  "inline-flex min-h-[44px] items-center px-2 text-sm font-semibold";

// Botón circular de volver: 44x44 en vez de los 40x38 que daba px-3 py-2.
export const BOTON_VOLVER =
  "flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold";
