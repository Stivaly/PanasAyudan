"use client";

import { clearCachedRole, clearVolunteerToken } from "@/lib/supabase";
import SolicitudesDisponibles from "@/components/SolicitudesDisponibles";

interface Props {
  token: string;
  onSalir: () => void;
}

export default function PanelVoluntario({ token, onSalir }: Props) {
  const salir = () => {
    clearVolunteerToken();
    clearCachedRole();
    onSalir();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Codigo de acceso activo</p>
          <h2 className="text-lg font-bold">Traslados para ayudar</h2>
        </div>
        <button onClick={salir} className="text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      <div className="rounded-xl border border-border bg-bg p-3 text-sm text-muted">
        Aqui veras inventario que otro centro ya ofrecio, pero que necesita transporte voluntario.
      </div>

      <SolicitudesDisponibles token={token} />
    </div>
  );
}
