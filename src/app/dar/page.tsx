"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EstadoCombobox from "@/components/EstadoCombobox";
import PlacesAutocomplete from "@/components/PlacesAutocomplete";
import MapaPicker from "@/components/MapaPicker";
import ItemsForm, { ItemDraft, draftVacio, draftsValidos } from "@/components/ItemsForm";
import { getCategorias, getEstados, crearAporte } from "@/lib/api";
import { normalizarTelefonoVe } from "@/lib/telefono";
import { resolverCentro, CARACAS } from "@/lib/geo";
import { getVolunteerToken } from "@/lib/supabase";
import { Category, Coords, EstadoVenezuela, PlaceSeleccion } from "@/lib/types";

export default function Dar() {
  const router = useRouter();
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [centro, setCentro] = useState<Coords>(CARACAS);
  const [volunteerToken, setVolunteerTokenState] = useState<string | null>(null);
  const [verificandoVoluntario, setVerificandoVoluntario] = useState(true);

  const [descripcion, setDescripcion] = useState("");
  const [estadoId, setEstadoId] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceSeleccion | null>(null);
  const [manual, setManual] = useState<Coords | null>(null);
  const [usarMapa, setUsarMapa] = useState(false);

  const [items, setItems] = useState<ItemDraft[]>([]);
  const [telefono, setTelefono] = useState("");
  const [telegram, setTelegram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const token = getVolunteerToken();
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
    resolverCentro().then(setCentro);
  }, []);

  const seleccionarPlace = (p: PlaceSeleccion) => {
    setPlace(p);
    setUsarMapa(false);
    setManual(null);
  };

  const coords: Coords | null = place ? { lat: place.lat, lng: place.lng } : manual;

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
    if (!coords) {
      setError("Busca el lugar en Google o ubícalo en el mapa.");
      return;
    }
    const itemsLimpios = draftsValidos(items);
    if (!itemsLimpios) {
      setError("Completa categoría, descripción y cantidad (mayor a 0) en cada item.");
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
      const placeId = place?.google_place_id ?? null;
      await crearAporte(
        {
          google_place_id: placeId,
          place_name: place?.place_name ?? descripcion.trim(),
          lat: coords.lat,
          lng: coords.lng,
          address: place?.address ?? null,
          descripcion_libre: descripcion.trim(),
          estado_id: estadoId,
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
          <p className="font-semibold text-accent">Solo voluntarios registrados</p>
          <p className="mt-2 text-sm text-muted">
            Para publicar algo para dar debes registrarte o entrar con tu token de voluntario.
          </p>
        </div>
        <Link href="/voluntarios" className="btn-primary w-full">
          Registrarme o entrar como voluntario
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

      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-muted">Ubicación</label>
        <PlacesAutocomplete onSelect={seleccionarPlace} />
        {place && <p className="text-sm text-accent">{place.place_name}</p>}

        {!usarMapa ? (
          <button
            type="button"
            onClick={() => {
              setUsarMapa(true);
              setPlace(null);
            }}
            className="text-left text-sm font-semibold text-muted underline"
          >
            No encuentro mi lugar - ubicarlo en el mapa
          </button>
        ) : (
          <>
            <MapaPicker centro={centro} valor={manual} onChange={setManual} />
            <p className="text-xs text-muted">
              Toca o arrastra el pin a la ubicación aproximada.
            </p>
          </>
        )}
      </section>

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
