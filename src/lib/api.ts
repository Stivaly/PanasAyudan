import { supabase, supabaseWithToken } from "./supabase";
import { getRecogedorToken } from "./recogedor";
import {
  Category,
  EstadoVenezuela,
  ContactData,
  ItemData,
  LocationData,
  RecogidaData,
  AporteConContacto,
  ItemConCategoria,
  Location,
  ReservaRecogedor,
  RecogidaConDetalle,
  EstadisticasImpacto,
  AporteVoluntario,
} from "./types";

export async function getCategorias(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw error;
  return data as Category[];
}

export async function getEstados(): Promise<EstadoVenezuela[]> {
  const { data, error } = await supabase.from("estados").select("*").order("orden");
  if (error) throw error;
  return data as EstadoVenezuela[];
}

// Items activos (qty_disponible > 0) con su categoría y location, opcional filtro.
export async function getItemsActivos(
  categorySlug?: string,
  estadoId?: string
): Promise<{ item: ItemConCategoria; location: Location }[]> {
  let query = supabase
    .from("aporte_items")
    .select(
      "*, category:categories(*), aporte:aportes!inner(id, status, location:locations!inner(*, estado:estados(*)))"
    )
    .gt("qty_disponible", 0)
    .eq("aporte.status", "activo");

  if (categorySlug) {
    query = query.eq("category.slug", categorySlug);
  }

  if (estadoId) {
    query = query.eq("aporte.location.estado_id", estadoId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as any[])
    .filter((row) => row.aporte?.location && row.category)
    .map((row) => ({
      item: {
        id: row.id,
        aporte_id: row.aporte_id,
        category_id: row.category_id,
        descripcion: row.descripcion,
        qty_approx: row.qty_approx,
        qty_disponible: row.qty_disponible,
        category: row.category,
      },
      location: row.aporte.location,
    }));
}

export async function getItemsDeLugar(locationId: string): Promise<ItemConCategoria[]> {
  const { data, error } = await supabase
    .from("aporte_items")
    .select("*, category:categories(*), aporte:aportes!inner(location_id, status)")
    .eq("aporte.location_id", locationId)
    .eq("aporte.status", "activo");

  if (error) throw error;
  return (data as any[]).map((row) => ({
    id: row.id,
    aporte_id: row.aporte_id,
    category_id: row.category_id,
    descripcion: row.descripcion,
    qty_approx: row.qty_approx,
    qty_disponible: row.qty_disponible,
    category: row.category,
  }));
}

export async function getLugar(locationId: string): Promise<Location | null> {
  const { data, error } = await supabase
    .from("locations")
    .select("*, estado:estados(*)")
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw error;
  return data as Location | null;
}

// Reservas pendientes del dispositivo actual (por su token local) en un lugar.
export async function getReservasDeRecogedor(
  locationId: string,
  recogedorToken: string
): Promise<ReservaRecogedor[]> {
  const { data, error } = await supabase.rpc("listar_recogidas_por_token", {
    p_recogedor_token: recogedorToken,
    p_location_id: locationId,
  });
  if (error) throw error;
  return data as ReservaRecogedor[];
}

export async function crearAporte(
  location: LocationData,
  items: ItemData[],
  contacto: ContactData,
  volunteerToken: string
): Promise<string> {
  const { data, error } = await supabaseWithToken(volunteerToken).rpc("crear_aporte", {
    location_data: location,
    items_data: items,
    contact_data: contacto,
  });
  if (error) throw error;
  return data as string;
}

export async function getAportesVoluntario(token: string): Promise<AporteVoluntario[]> {
  const { data, error } = await supabaseWithToken(token).rpc("listar_aportes_voluntario");
  if (error) throw error;
  return data as AporteVoluntario[];
}

export async function getWhatsappVoluntarioItem(aporteItemId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("obtener_whatsapp_voluntario_item", {
    p_aporte_item_id: aporteItemId,
  });
  if (error) throw error;
  return data as string | null;
}

export async function reservarItem(
  aporteItemId: string,
  qty: number,
  recogida: RecogidaData
): Promise<string> {
  const { data, error } = await supabase.rpc("reservar_item", {
    p_aporte_item_id: aporteItemId,
    p_qty: qty,
    recogida_data: recogida,
    p_recogedor_token: getRecogedorToken(),
  });
  if (error) throw error;
  return data as string;
}

// El voluntario confirma que la entrega fue recibida (con su volunteer-token).
export async function confirmarEntrega(
  recogidaId: string,
  volunteerToken: string
): Promise<void> {
  const { error } = await supabaseWithToken(volunteerToken).rpc("confirmar_entrega", {
    p_recogida_id: recogidaId,
    p_volunteer_token: volunteerToken,
  });
  if (error) throw error;
}

// Estadísticas agregadas de impacto (públicas, sin datos personales).
export async function getEstadisticasImpacto(): Promise<EstadisticasImpacto> {
  const { data, error } = await supabase.rpc("get_estadisticas_impacto");
  if (error) throw error;
  return data as EstadisticasImpacto;
}

// Todas las recogidas del dispositivo actual (cualquier status) por token local.
export async function getRecogidasDeRecogedor(
  recogedorToken: string
): Promise<RecogidaConDetalle[]> {
  const { data, error } = await supabase.rpc("listar_recogidas_recogedor", {
    p_recogedor_token: recogedorToken,
  });
  if (error) throw error;
  return (data ?? []) as RecogidaConDetalle[];
}

export async function registrarVoluntario(input: {
  nombre: string;
  apellido: string;
  telefono: string | null;
  telegram: string | null;
  zona_descripcion: string | null;
}): Promise<{ id: string; token: string }> {
  const { data, error } = await supabase.rpc("registrar_voluntario", {
    p_nombre: input.nombre,
    p_apellido: input.apellido,
    p_telefono: input.telefono,
    p_telegram: input.telegram,
    p_zona: input.zona_descripcion,
  });
  if (error) throw error;
  return (data as { id: string; token: string }[])[0];
}

export async function obtenerContacto(
  aporteId: string,
  token: string
): Promise<AporteConContacto> {
  const { data, error } = await supabaseWithToken(token).rpc(
    "obtener_aporte_con_contacto",
    { p_aporte_id: aporteId, p_volunteer_token: token }
  );
  if (error) throw error;
  return (data as AporteConContacto[])[0];
}

export async function completarRecogida(recogidaId: string, token: string): Promise<void> {
  const { error } = await supabaseWithToken(token).rpc("completar_recogida", {
    p_recogida_id: recogidaId,
    p_volunteer_token: token,
  });
  if (error) throw error;
}

export async function liberarRecogida(recogidaId: string): Promise<void> {
  const { error } = await supabase.rpc("liberar_recogida", {
    p_recogida_id: recogidaId,
  });
  if (error) throw error;
}
