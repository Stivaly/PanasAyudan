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
  CentroAcopio,
  ZonaRescate,
  VolunteerRole,
  NodoData,
  NodoAdmin,
  TipoPausa,
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

export async function getCentrosAcopioPorEstado(estadoId: string): Promise<CentroAcopio[]> {
  const { data, error } = await supabase
    .from("centros_acopio")
    .select("*")
    .eq("estado_id", estadoId)
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return data as CentroAcopio[];
}

export async function getZonasRescatePorEstado(estadoId: string): Promise<ZonaRescate[]> {
  const { data, error } = await supabase
    .from("zonas_rescate")
    .select("*")
    .eq("estado_id", estadoId)
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return data as ZonaRescate[];
}

// Para el selector de voluntarios sin filtro de estado previo.
export async function getCentrosAcopioTodos(): Promise<CentroAcopio[]> {
  const { data, error } = await supabase
    .from("centros_acopio")
    .select("*")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return data as CentroAcopio[];
}

// Items activos (qty_disponible > 0) con su categoría y location, opcional filtro.
export async function getItemsActivos(
  categorySlug?: string,
  estadoId?: string,
  centroAcopioId?: string,
  zonaRescateId?: string
): Promise<{ item: ItemConCategoria; location: Location }[]> {
  let query = supabase
    .from("aporte_items")
    .select(
      "*, category:categories(*), aporte:aportes!inner(id, status, location:locations!inner(*, estado:estados(*)))"
    )
    .gt("qty_disponible", 0)
    .eq("activo", true)
    .eq("aporte.status", "activo");

  if (categorySlug) {
    query = query.eq("category.slug", categorySlug);
  }

  if (estadoId) {
    query = query.eq("aporte.location.estado_id", estadoId);
  }

  if (centroAcopioId) {
    query = query.eq("aporte.location.centro_acopio_id", centroAcopioId);
  }

  if (zonaRescateId) {
    query = query.eq("aporte.location.zona_rescate_id", zonaRescateId);
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
    .select(
      "*, estado:estados(*), centros_acopio(nombre, horario, contacto), zonas_rescate(nombre, descripcion)"
    )
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
  // Origen obligatorio: el aporte debe asociarse a un centro de acopio o a
  // una zona de rescate (el constraint origen_requerido lo refuerza en la BD).
  if (!location.centro_acopio_id && !location.zona_rescate_id) {
    throw new Error("Debe indicar un centro de acopio o una zona de rescate de origen.");
  }
  const { data, error } = await supabaseWithToken(volunteerToken).rpc("crear_aporte", {
    location_data: location,
    items_data: items,
    contact_data: contacto,
  });
  if (error) throw error;
  return data as string;
}

// Valida un token de voluntario contra la base de datos antes de confiar en él.
// Usa el cliente autenticado por token: la policy RLS volunteers_select_own solo
// devuelve la fila cuyo token coincide con el header 'volunteer-token'. Si existe
// exactamente una fila activa => token válido. Nunca lanza: cualquier error, fallo
// de red o cero filas devuelve false, sin exponer el error crudo de Supabase.
export async function validarTokenVoluntario(token: string): Promise<boolean> {
  const limpio = token?.trim();
  if (!limpio) return false;
  try {
    const { count, error } = await supabaseWithToken(limpio)
      .from("volunteers")
      .select("id", { count: "exact", head: true })
      .eq("token", limpio)
      .eq("activo", true);
    if (error) return false;
    return count === 1;
  } catch {
    return false;
  }
}

// Obtiene el rol asociado a un token de voluntario (issue #17). Usa el cliente
// autenticado por token y la RPC obtener_rol (SECURITY DEFINER). Si el token es
// inválido/inactivo la RPC lanza 'token_invalido'; propagamos el error para que
// el llamador bloquee la navegación (mismo criterio que el issue #3), en vez de
// devolver un rol por defecto silencioso.
export async function obtenerRol(token: string): Promise<VolunteerRole> {
  const { data, error } = await supabaseWithToken(token).rpc("obtener_rol", {
    p_token: token,
  });
  if (error) throw error;
  return data as VolunteerRole;
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

// Verifica si una cédula está bloqueada por no haber ido a buscar una reserva.
// Recibe la cédula ya limpia (sin puntos). Falla en silencio devolviendo false.
export async function verificarCedulaBloqueada(cedula: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("cedulas_bloqueadas")
    .select("id", { count: "exact", head: true })
    .eq("cedula", cedula);
  if (error) return false;
  return (count ?? 0) > 0;
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
  centro_acopio_id: string | null;
}): Promise<{ id: string; token: string }> {
  try {
    const { data, error } = await supabase.rpc("registrar_voluntario", {
      p_nombre: input.nombre,
      p_apellido: input.apellido,
      // El teléfono es opcional: enviamos null si viene vacío. La columna
      // volunteers.telefono y volunteers.telegram permiten NULL (ver 0001_schema.sql),
      // así que no se requiere migración para la nulabilidad de las columnas.
      p_telefono: input.telefono?.trim() || null,
      p_telegram: input.telegram?.trim() || null,
      p_zona: input.zona_descripcion,
      p_centro_acopio_id: input.centro_acopio_id,
    });
    if (error) throw error;
    return (data as { id: string; token: string }[])[0];
  } catch (e) {
    // Nunca exponer el error crudo de Supabase/Postgres al usuario: se mapea a
    // mensajes legibles en español.
    const raw =
      e instanceof Error
        ? e.message
        : e && typeof e === "object" && "message" in e
        ? String((e as { message?: unknown }).message ?? "")
        : "";
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code ?? "") : "";
    const lower = raw.toLowerCase();

    // Falta de medio de contacto (validación/constraint sobre los campos de contacto).
    if (
      lower.includes("contacto") ||
      lower.includes("telefono o telegram") ||
      lower.includes("teléfono o telegram")
    ) {
      throw new Error("Debes ingresar al menos un medio de contacto: teléfono o Telegram.");
    }

    // Duplicado (p. ej. teléfono ya registrado). 23505 = unique_violation en Postgres.
    if (
      code === "23505" ||
      lower.includes("duplicate") ||
      lower.includes("already registered") ||
      lower.includes("ya registrado") ||
      lower.includes("ya está registrado")
    ) {
      throw new Error("Este número de teléfono ya está registrado.");
    }

    // Cualquier otro error: mensaje genérico, sin filtrar detalles internos.
    throw new Error("No se pudo completar el registro. Intenta de nuevo.");
  }
}

// --- Nodos (issue #18) ---
// Todas usan supabaseWithToken(token) para que el header 'volunteer-token' viaje
// y las RPC SECURITY DEFINER validen rol/membresía, igual que el resto del archivo.

// Un admin/superadmin crea un nodo. Nace en status 'inactivo' hasta verificar GPS.
export async function crearNodo(datos: NodoData, token: string): Promise<string> {
  const { data, error } = await supabaseWithToken(token).rpc("crear_nodo", {
    p_datos: datos,
    p_token_admin: token,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para crear nodos.");
    }
    throw error;
  }
  return data as string;
}

// El admin del nodo confirma su GPS. Devuelve true si quedó dentro de los 200 m.
export async function verificarNodo(
  nodeId: string,
  lat: number,
  lng: number,
  token: string
): Promise<boolean> {
  const { data, error } = await supabaseWithToken(token).rpc("verificar_nodo", {
    p_node_id: nodeId,
    p_lat: lat,
    p_lng: lng,
    p_token_admin: token,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No eres administrador de este nodo.");
    }
    if (error.message.includes("nodo_sin_coordenadas")) {
      throw new Error("El nodo no tiene coordenadas registradas.");
    }
    throw error;
  }
  return data as boolean;
}

// Pausa/reactiva recepción y/o entrega del nodo (gestión interna del admin).
export async function pausarNodo(
  nodeId: string,
  tipoPausa: TipoPausa,
  token: string
): Promise<void> {
  const { error } = await supabaseWithToken(token).rpc("pausar_nodo", {
    p_node_id: nodeId,
    p_tipo_pausa: tipoPausa,
    p_token_admin: token,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No eres administrador de este nodo.");
    }
    throw error;
  }
}

// Cierre permanente del nodo. Exclusivo de superadmin.
export async function cerrarNodo(nodeId: string, token: string): Promise<void> {
  const { error } = await supabaseWithToken(token).rpc("cerrar_nodo", {
    p_node_id: nodeId,
    p_token_admin: token,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("Solo un superadmin puede cerrar un nodo.");
    }
    throw error;
  }
}

// Los nodos que administra el token, con estado y verificación (panel de admin).
export async function listarNodosAdmin(token: string): Promise<NodoAdmin[]> {
  const { data, error } = await supabaseWithToken(token).rpc("listar_nodos_admin", {
    p_token: token,
  });
  if (error) throw error;
  return (data ?? []) as NodoAdmin[];
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

// El recogedor cancela su propia reserva pendiente (libera el stock).
export async function cancelarRecogidaPropia(
  recogidaId: string,
  recogedorToken: string
): Promise<void> {
  const { error } = await supabase.rpc("cancelar_recogida_propia", {
    p_recogida_id: recogidaId,
    p_recogedor_token: recogedorToken,
  });
  if (error) {
    if (error.message.includes("ya_completada")) {
      throw new Error(
        "El voluntario ya marcó esta recogida como completada, no se puede cancelar."
      );
    }
    throw error;
  }
}

// El recogedor cambia la cantidad de su reserva pendiente (sube o baja, ajustando el stock).
export async function modificarQtyRecogida(
  recogidaId: string,
  nuevaQty: number,
  recogedorToken: string
): Promise<void> {
  const { error } = await supabase.rpc("modificar_qty_recogida", {
    p_recogida_id: recogidaId,
    p_nueva_qty: nuevaQty,
    p_recogedor_token: recogedorToken,
  });
  if (error) {
    if (error.message.includes("stock_insuficiente")) {
      throw new Error("No hay suficientes insumos disponibles para esa cantidad.");
    }
    throw error;
  }
}

// El voluntario dueño edita uno de sus aporte_items (descripción, categoría y/o
// cantidad). Solo se envían los campos presentes en `datos`.
export async function editarAporteItem(
  itemId: string,
  volunteerToken: string,
  datos: {
    descripcion?: string;
    category_id?: string;
    qty_approx?: number;
  }
): Promise<void> {
  const { error } = await supabaseWithToken(volunteerToken).rpc("editar_aporte_item", {
    p_item_id: itemId,
    p_volunteer_token: volunteerToken,
    p_nuevos_datos: datos,
  });
  if (error) {
    if (error.message.includes("qty_invalida")) {
      throw new Error("No puedes reducir la cantidad por debajo de las reservas activas.");
    }
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para editar este item.");
    }
    throw error;
  }
}

// El voluntario dueño elimina uno de sus aporte_items. La RPC decide entre
// borrado físico (sin historial) y lógico (con recogidas completadas/canceladas).
export async function eliminarAporteItem(
  itemId: string,
  volunteerToken: string
): Promise<void> {
  const { error } = await supabaseWithToken(volunteerToken).rpc("eliminar_aporte_item", {
    p_item_id: itemId,
    p_volunteer_token: volunteerToken,
  });
  if (error) {
    if (error.message.includes("tiene_recogidas_pendientes")) {
      throw new Error(
        "Este item tiene reservas pendientes. Espera a que venzan o libéralas primero."
      );
    }
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para eliminar este item.");
    }
    throw error;
  }
}
