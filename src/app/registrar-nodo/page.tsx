"use client";

// Formulario público de solicitud de registro de un nodo (issue #29 sobre #21).
// Sin token, sin login, sin email: cualquier persona propone un punto y la
// superadmin lo aprueba desde /superadmin. El teléfono del solicitante nunca se
// muestra en público (RLS de 0041); aquí solo se envía a la RPC pública.

import { useEffect, useState } from "react";
import Link from "next/link";
import AvisoCarga from "@/components/AvisoCarga";
import AvisoError from "@/components/AvisoError";
import BotonVolver from "@/components/BotonVolver";
import { getCategorias, getEstados, crearSolicitudRegistroNodo } from "@/lib/api";
import { normalizarTelefonoVe } from "@/lib/telefono";
import EstadoCombobox from "@/components/EstadoCombobox";
import UbicacionPicker, { UbicacionSeleccion } from "@/components/UbicacionPicker";
import { Category, EstadoVenezuela, NodeTipo } from "@/lib/types";
import CabeceraPagina from "@/components/CabeceraPagina";

export default function RegistrarNodo() {
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [categoriasError, setCategoriasError] = useState(false);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [estadosError, setEstadosError] = useState(false);

  const [nombreNodo, setNombreNodo] = useState("");
  const [tipo, setTipo] = useState<NodeTipo>("acopio");
  const [ubicacion, setUbicacion] = useState<UbicacionSeleccion | null>(null);
  const [estadoId, setEstadoId] = useState<string | null>(null);
  const [categoriasSel, setCategoriasSel] = useState<string[]>([]);
  const [horarios, setHorarios] = useState("");
  const [solicitanteNombre, setSolicitanteNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    getCategorias()
      .then((lista) => {
        setCategorias(lista);
        setCategoriasError(false);
      })
      .catch(() => setCategoriasError(true));
    getEstados()
      .then((lista) => {
        setEstados(lista);
        setEstadosError(false);
      })
      .catch(() => setEstadosError(true));
  }, []);

  const toggleCategoria = (id: string) => {
    setCategoriasSel((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const enviar = async () => {
    setError(null);
    if (!nombreNodo.trim()) {
      setError("El nombre del punto es obligatorio.");
      return;
    }
    if (!estadoId) {
      setError("Elige el estado donde está el punto.");
      return;
    }
    if (!ubicacion) {
      setError("Indica la ubicación del punto seleccionándola desde Google Maps.");
      return;
    }
    if (!ubicacion.google_place_id) {
      setError("Busca y selecciona el punto desde Google Maps para poder registrarlo.");
      return;
    }
    if (!solicitanteNombre.trim()) {
      setError("Tu nombre es obligatorio.");
      return;
    }
    const telefonoNormalizado = normalizarTelefonoVe(telefono);
    if (!telefonoNormalizado) {
      setError("Ingresa un teléfono venezolano válido. Ej: 0412-1234567 o +58 412 1234567.");
      return;
    }
    const audio = audioUrl.trim();
    if (audio && !/^https?:\/\//i.test(audio)) {
      setError("El enlace de audio debe empezar por http:// o https://.");
      return;
    }

    setEnviando(true);
    try {
      await crearSolicitudRegistroNodo({
        nombre_nodo: nombreNodo.trim(),
        tipo,
        lat: ubicacion.lat,
        lng: ubicacion.lng,
        direccion: ubicacion.direccion,
        google_place_id: ubicacion.google_place_id,
        estado_id: estadoId,
        categorias: categoriasSel,
        horarios: horarios.trim() || null,
        solicitante_nombre: solicitanteNombre.trim(),
        solicitante_telefono: telefonoNormalizado,
        mensaje: mensaje.trim() || null,
        audio_url: audio || null,
      });
      setEnviado(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e && typeof e.message === "string"
          ? e.message
          : "No se pudo enviar la solicitud."
      );
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <CabeceraPagina volver={<BotonVolver />} titulo="Solicitud enviada" />
        <div className="card border-accent">
          <p className="font-semibold text-accent">Tu solicitud fue enviada</p>
          <p className="mt-2 text-sm text-muted">
            Te contactarán al teléfono que dejaste para confirmar el registro del punto.
          </p>
        </div>
        <Link href="/" className="btn-primary w-full">
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <CabeceraPagina volver={<BotonVolver />} titulo="Registrar un punto" />

      <div className="rounded-xl border border-accent bg-bg p-3 text-sm">
        <p className="font-semibold text-accent">Propón un centro de acopio o entrega</p>
        <p className="mt-1 text-muted">
          Completa los datos y te contactaremos por teléfono para activarlo. No necesitas cuenta.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <label htmlFor="nodo-nombre" className="text-sm font-semibold text-muted">
          Nombre del punto
        </label>
        <input
          id="nodo-nombre"
          className="field"
          placeholder="Ej: Centro de acopio Iglesia La Paz"
          value={nombreNodo}
          onChange={(e) => setNombreNodo(e.target.value)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="nodo-tipo" className="text-sm font-semibold text-muted">
          Tipo de punto
        </label>
        <select id="nodo-tipo" className="field" value={tipo} onChange={(e) => setTipo(e.target.value as NodeTipo)}>
          <option value="acopio">Acopio (recibe insumos)</option>
          <option value="entrega">Entrega (entrega insumos)</option>
          <option value="mixto">Mixto (recibe y entrega)</option>
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <EstadoCombobox
          estados={estados}
          estadoId={estadoId}
          onChange={setEstadoId}
          label="Estado"
          placeholder="Elige el estado"
          required
        />
        {estadosError && (
          <AvisoCarga>
            No se pudieron cargar los estados. Recarga la página para intentar de nuevo.
          </AvisoCarga>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <p id="nodo-ubicacion-label" className="text-sm font-semibold text-muted">
          Ubicación
        </p>
        <div role="group" aria-labelledby="nodo-ubicacion-label">
          <UbicacionPicker valor={ubicacion} onChange={setUbicacion} allowManual={false} />
        </div>
        <p className="text-xs text-muted">
          Selecciona el punto desde Google Maps para evitar duplicados y guardar su ubicación exacta.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <p id="nodo-categorias-label" className="text-sm font-semibold text-muted">
          ¿Qué categorías manejará? (opcional)
        </p>
        {categoriasError && (
          <AvisoCarga>
            No se pudieron cargar las categorías. El campo es opcional; puedes continuar.
          </AvisoCarga>
        )}
        <div role="group" aria-labelledby="nodo-categorias-label" className="grid grid-cols-2 gap-2">
          {categorias.map((c) => (
            <label
              key={c.id}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-bg p-2 text-sm"
            >
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0"
                checked={categoriasSel.includes(c.id)}
                onChange={() => toggleCategoria(c.id)}
              />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="nodo-horarios" className="text-sm font-semibold text-muted">
          Horarios (opcional)
        </label>
        <input
          id="nodo-horarios"
          className="field"
          placeholder="Ej: Lunes a viernes, 9:00 a.m. - 5:00 p.m."
          value={horarios}
          onChange={(e) => setHorarios(e.target.value)}
        />
      </section>

      <section role="group" aria-labelledby="nodo-contacto-label" className="flex flex-col gap-2">
        <p id="nodo-contacto-label" className="text-sm font-semibold text-muted">
          Tus datos de contacto
        </p>
        <input
          className="field"
          placeholder="Tu nombre"
          value={solicitanteNombre}
          onChange={(e) => setSolicitanteNombre(e.target.value)}
        />
        <input
          className="field"
          type="tel"
          inputMode="tel"
          placeholder="Teléfono (ej: 0412-1234567)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value.replace(/[a-zA-Z]/g, ""))}
        />
        <p className="text-xs text-muted">
          Tu teléfono no se muestra públicamente. Solo lo usa el equipo para contactarte.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="nodo-mensaje" className="text-sm font-semibold text-muted">
          Mensaje (opcional)
        </label>
        <textarea
          id="nodo-mensaje"
          className="field min-h-20"
          placeholder="Cualquier detalle que ayude a evaluar la solicitud."
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
        />
        <input
          className="field"
          type="url"
          inputMode="url"
          placeholder="Enlace de audio (opcional, https://…)"
          value={audioUrl}
          onChange={(e) => setAudioUrl(e.target.value)}
        />
      </section>

      <AvisoError mensaje={error} />

      <button onClick={enviar} disabled={enviando} className="btn-primary w-full disabled:opacity-50">
        {enviando ? "Enviando…" : "Enviar solicitud"}
      </button>
    </main>
  );
}
