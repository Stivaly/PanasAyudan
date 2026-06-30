"use client";

// Panel de admin de nodo (issue #18). Mínimo funcional, no visual: lista los
// nodos que administra el token, permite crear un nodo, verificarlo por GPS y
// pausar/reactivar recepción y entrega. El flujo de aprobación por superadmin y
// el diseño elaborado quedan para issues posteriores.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getEstados,
  listarNodosAdmin,
  crearNodo,
  pausarNodo,
} from "@/lib/api";
import { getVolunteerToken } from "@/lib/supabase";
import EstadoCombobox from "@/components/EstadoCombobox";
import VerificarNodo from "@/components/VerificarNodo";
import SolicitudesNodo from "@/components/SolicitudesNodo";
import {
  EstadoVenezuela,
  NodoAdmin,
  NodeTipo,
  TipoPausa,
  statusVisible,
} from "@/lib/types";

export default function NodoAdminPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [nodos, setNodos] = useState<NodoAdmin[]>([]);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  // Formulario mínimo de creación.
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [estadoId, setEstadoId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<NodeTipo>("acopio");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const cargar = (t: string) => {
    listarNodosAdmin(t)
      .then(setNodos)
      .catch(() => setNodos([]));
  };

  useEffect(() => {
    const t = getVolunteerToken();
    setToken(t);
    if (t) cargar(t);
    getEstados().then(setEstados).catch(() => setEstados([]));
  }, []);

  const crear = async () => {
    if (!token) return;
    setError(null);
    if (!nombre.trim() || !direccion.trim() || !estadoId) {
      setError("Nombre, dirección y estado son obligatorios.");
      return;
    }
    setCreando(true);
    try {
      await crearNodo(
        {
          nombre: nombre.trim(),
          direccion: direccion.trim(),
          google_place_id: null,
          lat: lat.trim() ? Number(lat) : null,
          lng: lng.trim() ? Number(lng) : null,
          estado_id: estadoId,
          tipo,
          horario: null,
          contacto: null,
        },
        token
      );
      setNombre("");
      setDireccion("");
      setLat("");
      setLng("");
      cargar(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el punto.");
    } finally {
      setCreando(false);
    }
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
      </div>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {/* Crear nodo (mínimo) */}
      <div className="card border-accent flex flex-col gap-3">
        <p className="text-sm font-semibold text-accent">Crear punto</p>
        <input className="field" placeholder="Nombre del punto" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="field" placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
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
        <div className="flex gap-2">
          <input className="field" inputMode="decimal" placeholder="Latitud" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="field" inputMode="decimal" placeholder="Longitud" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>
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

                {token && <SolicitudesNodo nodeId={n.id} token={token} />}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
