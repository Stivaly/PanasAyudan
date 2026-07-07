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
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Sesion activa</p>
          <h2 className="text-lg font-bold">Solicitudes para ayudar</h2>
        </div>
        <button onClick={salir} className="text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      <div className="rounded-xl border border-border bg-bg p-3 text-sm text-muted">
        Estas conectada/o como voluntaria/o. Aqui veras solicitudes de puntos que necesitan apoyo de traslado dentro de tu zona permitida.
      </div>

      <SolicitudesDisponibles token={token} />
    </div>
  );
}
