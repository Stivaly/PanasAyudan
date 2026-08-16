"use client";

// Panel del voluntario. Ya no trae cabecera propia: la tenía y quedaba apilada
// bajo la de la página, con dos títulos casi iguales y un "Salir" suelto a
// media altura entre las dos (#161). El título, el estado de sesión y el botón
// de salir viven ahora en la cabecera de /voluntarios, igual que en el resto
// de paneles.

import SolicitudesDisponibles from "@/components/SolicitudesDisponibles";

interface Props {
  token: string;
}

export default function PanelVoluntario({ token }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-bg p-3 text-sm text-muted">
        Aquí verás inventario que otro centro ya ofreció, pero que necesita transporte voluntario.
      </div>

      <SolicitudesDisponibles token={token} />
    </div>
  );
}
