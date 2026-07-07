"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EstadoCombobox from "@/components/EstadoCombobox";
import ItemsForm, { ItemDraft, draftVacio, draftsValidos, QTY_MAX } from "@/components/ItemsForm";
import {
  getCategorias,
  getEstados,
  crearAporte,
  getCentrosAcopioPorEstado,
  getZonasRescatePorEstado,
} from "@/lib/api";
import { normalizarTelefonoVe } from "@/lib/telefono";
import { getVolunteerToken } from "@/lib/supabase";
import {
  Category,
  Coords,
  EstadoVenezuela,
  CentroAcopio,
  ZonaRescate,
} from "@/lib/types";

// Fallback temporal para orígenes aún sin geocodificar (centro de Venezuela).
const VENEZUELA_CENTRO: Coords = { lat: 8.0, lng: -66.0 };

export default function Dar() {
  const router = useRouter();
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [volunteerToken, setVolunteerTokenState] = useState<string | null>(null);
  const [verificandoVoluntario, setVerificandoVoluntario] = useState(true);

  const [descripcion, setDescripcion] = useState("");
  const [estadoId, setEstadoId] = useState<string | null>(null);
  const [centros, setCentros] = useState<CentroAcopio[]>([]);
  const [centroAcopioId, setCentroAcopioId] = useState<string>("");
  const [zonas, setZonas] = useState<ZonaRescate[]>([]);
  const [zonaRescateId, setZonaRescateId] = useState<string>("");
  const [cargandoLugares, setCargandoLugares] = useState(false);

  const [items, setItems] = useState<ItemDraft[]>([]);
  const [telefono, setTelefono] = useState("");
  const [telegram, setTelegram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const token = getVolunteerToken();
    // Lectura de token + carga inicial en el mismo efecto (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVolunteerTokenState(token);
    setVerificandoVoluntario(false);

    if (!token) return;

    getCategorias()
      .then((c) => {
        setCategorias(c);
        setItems([draftVacio(c)]);
      })
      .catch(() => setError("No se pudieron cargar las categorías."));
    getEstados()
      .then(setEstados)
      .catch(() => setError("No se pudieron cargar los estados."));
  }, []);

  // Al cambiar de estado, cargar centros y zonas de ese estado en paralelo.
  useEffect(() => {
    // Reset de selects dependientes al cambiar de estado + fetch (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCentroAcopioId("");
    setZonaRescateId("");
    setCentros([]);
    setZonas([]);
    if (!estadoId) {
      setCargandoLugares(false);
      return;
    }
    setCargandoLugares(true);
    Promise.all([
      getCentrosAcopioPorEstado(estadoId).then(setCentros).catch(() => setCentros([])),
      getZonasRescatePorEstado(estadoId).then(setZonas).catch(() => setZonas([])),
    ]).finally(() => setCargandoLugares(false));
  }, [estadoId]);

  // Origen seleccionado: centro de acopio o zona de rescate (excluyentes).
  const centroSel = centros.find((c) => c.id === centroAcopioId) ?? null;
  const zonaSel = zonas.find((z) => z.id === zonaRescateId) ?? null;
  const origen = centroSel ?? zonaSel;

  // Coordenadas del origen; fallback al centro de Venezuela si no están geocodificadas.
  const sinCoordsExactas =
    !!origen && (origen.lat === null || origen.lng === null);
  const coords: Coords | null = !origen
    ? null
    : sinCoordsExactas
    ? VENEZUELA_CENTRO
    : { lat: origen.lat as number, lng: origen.lng as number };

  const publicar = async () => {
    setError(null);

    if (!volunteerToken) {
      setError("Debes registrarte como voluntario antes de publicar insumos.");
      return;
    }
    if (!descripcion.trim()) {
      setError("Describe el lugar (ej: Bodega de Don Carlos, frente a la escuela azul).");
      return;
    }
    if (!estadoId) {
      setError("Elige el estado donde se encuentra el aporte.");
      return;
    }
    if (!origen || !coords) {
      setError("Debes indicar el origen del aporte (centro de acopio o zona de rescate).");
      return;
    }
    const itemsLimpios = draftsValidos(items);
    if (!itemsLimpios) {
      setError("Completa categoría, descripción y cantidad (mayor a 0) en cada item.");
      return;
    }
    // Red de seguridad: las cantidades deben ser enteros entre 1 y QTY_MAX.
    const cantidadesInvalidas = itemsLimpios.some(
      (it) => !(Number.isInteger(it.qty_approx) && it.qty_approx >= 1 && it.qty_approx <= QTY_MAX)
    );
    if (cantidadesInvalidas) {
      setError(
        `Revisa las cantidades: cada ítem debe tener un número entre 1 y ${QTY_MAX.toLocaleString("es-VE")}`
      );
      return;
    }
    const telefonoIngresado = telefono.trim();
    let phone: string | null = null;
    if (telefonoIngresado) {
      phone = normalizarTelefonoVe(telefonoIngresado);
      if (!phone) {
        setError("Ingresa un WhatsApp venezolano válido. Ej: 0412-1234567 o +58 412 1234567.");
        return;
      }
    }
    const tg = telegram.trim() || null;
    if (!phone && !tg) {
      setError("Indica al menos un contacto: teléfono o Telegram.");
      return;
    }

    setEnviando(true);
    try {
      const placeId = origen.google_place_id ?? null;
      await crearAporte(
        {
          google_place_id: placeId,
          place_name: origen.nombre,
          lat: coords.lat,
          lng: coords.lng,
          address: centroSel?.direccion ?? null,
          descripcion_libre: descripcion.trim(),
          estado_id: estadoId,
          centro_acopio_id: centroAcopioId || null,
          zona_rescate_id: zonaRescateId || null,
        },
        itemsLimpios,
        { contact_phone: phone, contact_telegram: tg, volunteer_id: null },
        volunteerToken
      );
      const locId = await fetchLocationId(placeId, descripcion.trim(), estadoId);
      router.push(locId ? `/lugar/${locId}` : "/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al publicar.");
      setEnviando(false);
    }
  };

  if (verificandoVoluntario) {
    return <main className="grid min-h-dvh place-items-center text-muted">Verificando acceso...</main>;
  }

  if (!volunteerToken) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Link href="/" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
            ←
          </Link>
          <h1 className="text-lg font-bold">Publicar insumos</h1>
        </div>
        <div className="card border-accent">
          <p className="font-semibold text-accent">Necesitas sumarte al apoyo</p>
          <p className="mt-2 text-sm text-muted">
            Para publicar algo para dar debes sumarte al apoyo o usar tu codigo de apoyo.
          </p>
        </div>
        <Link href="/voluntarios" className="btn-primary w-full">
          Sumarme o usar mi codigo
        </Link>
        <Link href="/buscar" className="btn-ghost w-full">
          Necesito buscar algo
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <h1 className="text-lg font-bold">Tengo algo para dar</h1>
      </div>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-muted">¿Cómo describes el lugar?</label>
        <textarea
          className="field min-h-20"
          placeholder="Ej: Bodega de Don Carlos, calle principal de Petare, frente a la escuela azul"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <p className="text-xs text-muted">
          Esto es lo que orienta a quien va a buscar. Siempre obligatorio.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <EstadoCombobox
          estados={estados}
          estadoId={estadoId}
          onChange={setEstadoId}
          label="Estado del aporte"
          placeholder="Elige el estado"
          required
        />
      </section>

      {estadoId && (
        <section className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-muted">
            Origen del aporte (centro de acopio o zona de rescate)
          </label>
          {cargandoLugares ? (
            <p className="text-muted text-sm">Cargando lugares…</p>
          ) : centros.length === 0 && zonas.length === 0 ? (
            <div className="card text-center py-6 space-y-2">
              <p className="text-muted text-sm">
                No hay centros ni zonas registradas en este estado todavía.
              </p>
              <p className="text-muted text-sm">
                Puedes indicar la ubicación manualmente usando el mapa.
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {centros.length > 0 && (
              <select
                value={centroAcopioId}
                onChange={(e) => setCentroAcopioId(e.target.value)}
                disabled={!!zonaRescateId}
                className="field disabled:text-muted disabled:opacity-60"
              >
                <option value="" disabled>
                  {zonaRescateId ? "No aplica" : "Selecciona un centro"}
                </option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            )}
            {zonas.length > 0 && (
              <select
                value={zonaRescateId}
                onChange={(e) => setZonaRescateId(e.target.value)}
                disabled={!!centroAcopioId}
                className="field disabled:text-muted disabled:opacity-60"
              >
                <option value="" disabled>
                  {centroAcopioId ? "No aplica" : "Selecciona una zona"}
                </option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>
          )}
          {sinCoordsExactas && (
            <p className="text-xs text-muted">
              Ubicación aproximada, aún sin coordenadas exactas.
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-muted">Insumos</label>
        <ItemsForm categorias={categorias} items={items} onChange={setItems} />
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-muted">Contacto (al menos uno)</label>
        <input
          type="tel"
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Teléfono (ej: 0412-1234567)"
          className="field"
        />
        <input
          type="text"
          value={telegram}
          onChange={(e) => setTelegram(e.target.value)}
          placeholder="Telegram (ej: @usuario)"
          className="field"
        />
        <p className="text-xs text-muted">
          Tu contacto no se muestra públicamente. Solo lo ven los voluntarios al coordinar.
        </p>
      </section>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <button onClick={publicar} disabled={enviando} className="btn-primary w-full disabled:opacity-50">
        {enviando ? "Publicando..." : "Publicar"}
      </button>
    </main>
  );
}

async function fetchLocationId(
  googlePlaceId: string | null,
  descripcion: string,
  estadoId: string
): Promise<string | null> {
  const { supabase } = await import("@/lib/supabase");
  let query = supabase.from("locations").select("id").order("created_at", { ascending: false }).limit(1);
  query = googlePlaceId
    ? query.eq("google_place_id", googlePlaceId)
    : query.is("google_place_id", null).eq("descripcion_libre", descripcion).eq("estado_id", estadoId);
  const { data } = await query.maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
