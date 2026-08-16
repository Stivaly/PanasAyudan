// Iconos de línea y el botón circular que los contiene.
//
// Los controles sueltos de la portada (ayuda, panel, tema) tienen que pesar lo
// mismo: si uno lleva texto y otro no, el de texto gana la mirada aunque sea el
// menos importante. Un tamaño, un trazo y una caja para los tres.

const trazo = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Caja común de los controles de icono: 44x44, el mínimo cómodo para el pulgar.
export const CLASE_BOTON_ICONO =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-fg";

export function IconoAyuda() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...trazo} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.5 2.5 0 114.9.6c-.2 1.5-2.4 1.8-2.4 3.4" />
      <circle cx="12" cy="16.8" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconoPanel() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...trazo} aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0114 0" />
    </svg>
  );
}

export function IconoSol() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...trazo} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  );
}

export function IconoLuna() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...trazo} aria-hidden="true">
      <path d="M20 14.2A8.5 8.5 0 019.8 4 8.5 8.5 0 1020 14.2z" />
    </svg>
  );
}
