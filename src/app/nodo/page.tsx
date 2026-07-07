"use client";

// Panel de admin de nodo (issue #18). Mínimo funcional, no visual: lista los
// nodos que administra el token, permite crear un nodo, verificarlo por GPS y
// pausar/reactivar recepción y entrega. El flujo de aprobación por superadmin y
// el diseño elaborado quedan para issues posteriores.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getEstados,
  listarNodosAdmin,
  crearNodo,
  pausarNodo,
} from "@/lib/api";
import { getVolunteerToken, clearVolunteerToken, clearCachedRole } from "@/lib/supabase";
import EstadoCombobox from "@/components/EstadoCombobox";
import VerificarNodo from "@/components/VerificarNodo";
import SolicitudesNodo from "@/components/SolicitudesNodo";
import InventarioNodo from "@/components/InventarioNodo";
import PlacesAutocomplete from "@/components/PlacesAutocomplete";
import {
  EstadoVenezuela,
  NodoAdmin,
  NodeTipo,
  TipoPausa,
  PlaceSeleccion,
  statusVisible,
} from "@/lib/types";

export default function NodoAdminPanel() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [nodos, setNodos] = useState<NodoAdmin[]>([]);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  // Formulario mínimo de creación. La ubicación (dirección + coordenadas) se toma
  // de Google Places, no se escribe a mano: al elegir el lugar quedan
  // google_place_id, lat, lng y address detrás, igual que en /dar.
  const [nombre, setNombre] = useState("");
  const [estadoId, setEstadoId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<NodeTipo>("acopio");
  const [lugar, setLugar] = useState<PlaceSeleccion | null>(null);

  const cargar = (t: string) => {
    listarNodosAdmin(t)
      .then(setNodos)
      .catch(() => setNodos([]));
  };

  useEffect(() => {
    const t = getVolunteerToken();
    // Lectura de token + carga inicial en el mismo efecto (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t);
    if (t) cargar(t);
    getEstados().then(setEstados).catch(() => setEstados([]));
  }, []);

  const crear = async () => {
    if (!token) return;
    setError(null);
    if (!nombre.trim() || !estadoId) {
      setError("Nombre y estado son obligatorios.");
      return;
    }
    if (!lugar) {
      setError("Busca y selecciona la ubicación del punto en Google.");
      return;
    }
    setCreando(true);
    try {
      await crearNodo(
        {
          nombre: nombre.trim(),
          direccion: lugar.address ?? lugar.place_name,
          google_place_id: lugar.google_place_id,
          lat: lugar.lat,
          lng: lugar.lng,
          estado_id: estadoId,
          tipo,
          horario: null,
          contacto: null,
        },
        token
      );
      setNombre("");
      setLugar(null);
      cargar(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el punto.");
    } finally {
      setCreando(false);
    }
  };

  // Cierra la sesión y vuelve a /voluntarios para entrar con otra cuenta.
  const salir = () => {
    clearVolunteerToken();
    clearCachedRole();
    router.push("/voluntarios");
  };

  const pausar = async (nodeId: string, tipoPausa: TipoPausa) => {
    if (!token) return;
    try {
      await pausarNodo(nodeId, tipoPausa, token);
      cargar(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el punto.");
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/voluntarios" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <h1 className="text-lg font-bold">Panel de punto</h1>
        <button onClick={salir} className="ml-auto text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {/* Crear nodo (mínimo) */}
      <div className="card border-accent flex flex-col gap-3">
        <p className="text-sm font-semibold text-accent">Crear punto</p>
        <input className="field" placeholder="Nombre del punto" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <label className="text-sm font-semibold text-muted">Ubicación</label>
        {lugar ? (
          <div className="flex items-start justify-between gap-2 rounded-xl border border-border bg-bg p-3">
            <div>
              <p className="text-sm font-semibold">{lugar.place_name}</p>
              {lugar.address && <p className="text-xs text-muted">{lugar.address}</p>}
            </div>
            <button
              type="button"
              onClick={() => setLugar(null)}
              className="text-sm font-semibold text-muted"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <PlacesAutocomplete onSelect={setLugar} />
        )}
        <p className="text-xs text-muted">
          Busca el lugar en Google: la dirección y las coordenadas se guardan solas.
        </p>
        <EstadoCombobox
          estados={estados}
          estadoId={estadoId}
          onChange={setEstadoId}
          label="Estado"
          placeholder="Elige un estado"
        />
        <select className="field" value={tipo} onChange={(e) => setTipo(e.target.value as NodeTipo)}>
          <option value="acopio">Acopio</option>
          <option value="entrega">Entrega</option>
          <option value="mixto">Mixto</option>
        </select>
        <p className="text-xs text-muted">
          El punto nace inactivo: no aparece en público hasta que lo verifiques desde su ubicación.
        </p>
        <button onClick={crear} disabled={creando} className="btn-primary w-full disabled:opacity-50">
          {creando ? "Creando…" : "Crear punto"}
        </button>
      </div>

      {/* Mis nodos */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-muted">Mis puntos</p>
        {nodos.length === 0 ? (
          <p className="text-sm text-muted">Aún no administras ningún punto.</p>
        ) : (
          nodos.map((n) => {
            const vis = statusVisible(n);
            const noOperativo = n.pausado_recepcion || n.pausado_entrega;
            return (
              <div key={n.id} className="card flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{n.nombre}</p>
                    <p className="text-xs text-muted">{n.direccion}</p>
                    <p className="mt-1 text-xs text-muted">Tipo: {n.tipo}</p>
                  </div>
                  <span
                    className={
                      "rounded-full px-2 py-1 text-xs font-semibold " +
                      (vis === "activo"
                        ? "bg-accent/15 text-accent"
                        : vis === "pausado"
                        ? "bg-danger/15 text-danger"
                        : "bg-surface text-muted")
                    }
                  >
                    {vis}
                  </span>
                </div>

                {noOperativo && (
                  <p className="text-xs font-semibold text-danger">
                    No operativo
                    {n.pausado_recepcion ? " · recepción pausada" : ""}
                    {n.pausado_entrega ? " · entrega pausada" : ""}
                  </p>
                )}

                {token && (
                  <VerificarNodo
                    nodeId={n.id}
                    token={token}
                    verificado={n.verificado}
                    onVerificado={() => cargar(token)}
                  />
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => pausar(n.id, "recepcion")} className="btn-ghost text-sm">
                    Pausar recepción
                  </button>
                  <button onClick={() => pausar(n.id, "entrega")} className="btn-ghost text-sm">
                    Pausar entrega
                  </button>
                  <button onClick={() => pausar(n.id, "ambas")} className="btn-ghost text-sm">
                    Pausar ambas
                  </button>
                  <button onClick={() => pausar(n.id, "reactivar")} className="btn-ghost text-sm">
                    Reactivar
                  </button>
                </div>

                {token && <InventarioNodo nodeId={n.id} token={token} tipo={n.tipo} />}

                {token && <SolicitudesNodo nodeId={n.id} token={token} />}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
