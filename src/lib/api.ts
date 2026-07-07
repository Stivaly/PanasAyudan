import { supabase, supabaseWithToken } from "./supabase";
import { getRecogedorToken } from "./recogedor";
import {
  Category,
  Subcategory,
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
  SolicitudData,
  SolicitudesDisponiblesResp,
  SolicitudNodo,
  VerificacionUbicacion,
  InventarioItem,
  InventarioUpsertItem,
  AgotadoSugerencia,
  NodoMiembro,
  Magnitud,
  SolicitudRegistroNodo,
} from "./types";

export async function getCategorias(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw error;
  return data as Category[];
}

// Subcategorías fijas (issue #30). Sin argumento devuelve todas; con categoryId
// devuelve solo las de esa macrocategoría (para dropdowns dependientes).
export async function getSubcategorias(categoryId?: string): Promise<Subcategory[]> {
  let query = supabase.from("subcategories").select("*").order("name");
  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as Subcategory[];
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

  type ItemActivoRow = {
    id: string;
    aporte_id: string;
    category_id: string;
    descripcion: string;
    qty_approx: number;
    qty_disponible: number;
    category: Category | null;
    aporte: { location: Location | null } | null;
  };

  return (data as ItemActivoRow[])
    .filter((row) => row.aporte?.location && row.category)
    .map((row) => ({
      item: {
        id: row.id,
        aporte_id: row.aporte_id,
        category_id: row.category_id,
        descripcion: row.descripcion,
        qty_approx: row.qty_approx,
        qty_disponible: row.qty_disponible,
        category: row.category as Category,
      },
      location: row.aporte!.location as Location,
    }));
}

export async function getItemsDeLugar(locationId: string): Promise<ItemConCategoria[]> {
  const { data, error } = await supabase
    .from("aporte_items")
    .select("*, category:categories(*), aporte:aportes!inner(location_id, status)")
    .eq("aporte.location_id", locationId)
    .eq("aporte.status", "activo");

  if (error) throw error;
  type ItemLugarRow = {
    id: string;
    aporte_id: string;
    category_id: string;
    descripcion: string;
    qty_approx: number;
    qty_disponible: number;
    category: Category;
  };

  return (data as ItemLugarRow[]).map((row) => ({
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
  // Cédula obligatoria (issue #23): base del bloqueo por incumplimiento. Debe
  // llegar ya limpia (solo dígitos) vía limpiarCedula.
  cedula: string;
  telefono: string | null;
  telegram: string | null;
  zona_descripcion: string | null;
  centro_acopio_id: string | null;
  // Capacidad de vehículo (issue #19). Opcionales: la RPC los toma con default
  // false/null, así que omitirlos mantiene el registro libre sin vehículo.
  tiene_vehiculo?: boolean;
  capacidad_peso_kg?: number | null;
  capacidad_volumen_m3?: number | null;
}): Promise<{ id: string; token: string }> {
  try {
    const { data, error } = await supabase.rpc("registrar_voluntario", {
      p_nombre: input.nombre,
      p_apellido: input.apellido,
      p_cedula: input.cedula,
      // El teléfono es opcional: enviamos null si viene vacío. La columna
      // volunteers.telefono y volunteers.telegram permiten NULL (ver 0001_schema.sql),
      // así que no se requiere migración para la nulabilidad de las columnas.
      p_telefono: input.telefono?.trim() || null,
      p_telegram: input.telegram?.trim() || null,
      p_zona: input.zona_descripcion,
      p_centro_acopio_id: input.centro_acopio_id,
      p_tiene_vehiculo: input.tiene_vehiculo ?? false,
      p_capacidad_peso_kg: input.capacidad_peso_kg ?? null,
      p_capacidad_volumen_m3: input.capacidad_volumen_m3 ?? null,
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

    // Cédula bloqueada por incumplimiento previo: sin apelación (issue #23).
    if (lower.includes("cedula_bloqueada")) {
      throw new Error(
        "Esta cédula fue bloqueada por no cumplir un compromiso. No puede registrarse de nuevo."
      );
    }

    // Cédula ya registrada con otro token.
    if (lower.includes("cedula_duplicada")) {
      throw new Error("Esta cédula ya está registrada.");
    }

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

// Un superadmin crea un admin (issue #17). La RPC crear_admin valida por
// current_volunteer_token() que el caller sea superadmin y devuelve id + token
// del nuevo admin. telefono/telegram/centro_acopio_id son opcionales (DEFAULT
// null en la firma). No se mapea el error: se propaga tal cual lo devuelve el
// backend (ej. 'no_autorizado' si el caller no es superadmin).
export async function crearAdmin(
  input: {
    nombre: string;
    apellido: string;
    telefono?: string | null;
    telegram?: string | null;
    centro_acopio_id?: string | null;
  },
  token: string
): Promise<{ id: string; token: string }> {
  const { data, error } = await supabaseWithToken(token).rpc("crear_admin", {
    p_nombre: input.nombre,
    p_apellido: input.apellido,
    p_telefono: input.telefono ?? null,
    p_telegram: input.telegram ?? null,
    p_centro_acopio_id: input.centro_acopio_id ?? null,
  });
  if (error) throw error;
  return (data as { id: string; token: string }[])[0];
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
      throw new Error("No tienes permiso para crear puntos.");
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
      throw new Error("No eres administrador de este punto.");
    }
    if (error.message.includes("nodo_sin_coordenadas")) {
      throw new Error("El punto no tiene coordenadas registradas.");
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
      throw new Error("No eres administrador de este punto.");
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
      throw new Error("Solo un superadmin puede cerrar un punto.");
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

// --- Solicitudes de registro de nodo (issue #21) ---

// Pública (anon): cualquier persona solicita registrar un nodo. La RPC valida el
// teléfono y rechaza una segunda solicitud pendiente con el mismo número.
export async function crearSolicitudRegistroNodo(datos: {
  nombre_nodo: string;
  tipo: string;
  lat: number | null;
  lng: number | null;
  direccion: string | null;
  estado_id: string | null;
  categorias: string[];
  horarios: string | null;
  solicitante_nombre: string;
  solicitante_telefono: string;
  mensaje: string | null;
  audio_url: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("crear_solicitud_registro_nodo", {
    p_datos: datos,
  });
  if (error) throw error;
  return data as string;
}

// Superadmin: la cola de solicitudes (pendientes primero).
export async function listarSolicitudesRegistro(
  token: string
): Promise<SolicitudRegistroNodo[]> {
  const { data, error } = await supabaseWithToken(token).rpc(
    "listar_solicitudes_registro",
    { p_token: token }
  );
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para ver las solicitudes de registro.");
    }
    throw error;
  }
  return (data ?? []) as SolicitudRegistroNodo[];
}

// Superadmin: aprobar. Crea admin + nodo inactivo en una transacción y devuelve
// el token del admin UNA sola vez (no se puede recuperar después).
export async function aprobarSolicitudRegistro(
  solicitudId: string,
  token: string
): Promise<{ admin_token: string; node_id: string }> {
  const { data, error } = await supabaseWithToken(token).rpc(
    "aprobar_solicitud_registro",
    { p_solicitud_id: solicitudId, p_token: token }
  );
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para aprobar solicitudes.");
    }
    if (error.message.includes("solicitud_ya_resuelta")) {
      throw new Error("Esta solicitud ya fue resuelta.");
    }
    throw error;
  }
  return (data as { admin_token: string; node_id: string }[])[0];
}

// Superadmin: rechazar con motivo.
export async function rechazarSolicitudRegistro(
  solicitudId: string,
  motivo: string,
  token: string
): Promise<void> {
  const { error } = await supabaseWithToken(token).rpc(
    "rechazar_solicitud_registro",
    { p_solicitud_id: solicitudId, p_token: token, p_motivo: motivo }
  );
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para rechazar solicitudes.");
    }
    if (error.message.includes("solicitud_ya_resuelta")) {
      throw new Error("Esta solicitud ya fue resuelta.");
    }
    throw error;
  }
}

// --- Solicitudes entre nodos (issue #19) ---
// Todas usan supabaseWithToken(token) para que el header 'volunteer-token' viaje
// y las RPC SECURITY DEFINER validen rol/membresía, igual que el resto del archivo.

// Un admin/colaborador del nodo crea una solicitud. Nace en status 'abierta'.
export async function crearSolicitud(
  nodeId: string,
  datos: SolicitudData,
  token: string
): Promise<string> {
  const { data, error } = await supabaseWithToken(token).rpc("crear_solicitud", {
    p_node_id: nodeId,
    p_datos: datos,
    p_token_admin: token,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para crear solicitudes en este punto.");
    }
    throw error;
  }
  return data as string;
}

// Un voluntario responde a una solicitud comprometiendo magnitud + tiempo.
export async function responderSolicitudVoluntario(
  solicitudId: string,
  magnitud: string,
  tiempoEstimadoMinutos: number,
  token: string
): Promise<string> {
  const { data, error } = await supabaseWithToken(token).rpc(
    "responder_solicitud_voluntario",
    {
      p_solicitud_id: solicitudId,
      p_magnitud: magnitud,
      p_tiempo_estimado: tiempoEstimadoMinutos,
      p_token_voluntario: token,
    }
  );
  if (error) {
    if (error.message.includes("requiere_vehiculo")) {
      throw new Error(
        "Esta solicitud requiere un voluntario con vehículo y tu perfil no tiene vehículo registrado."
      );
    }
    if (error.message.includes("solicitud_no_disponible")) {
      throw new Error("Esta solicitud ya no admite respuestas.");
    }
    throw error;
  }
  return data as string;
}

// Un admin/colaborador compromete stock de su nodo hacia una solicitud.
export async function responderSolicitudNodo(
  solicitudId: string,
  magnitud: string,
  tieneTransporte: boolean,
  token: string,
  nodeId?: string
): Promise<string> {
  const { data, error } = await supabaseWithToken(token).rpc("responder_solicitud_nodo", {
    p_solicitud_id: solicitudId,
    p_magnitud: magnitud,
    p_tiene_transporte: tieneTransporte,
    p_token_admin: token,
    p_node_id: nodeId ?? null,
  });
  if (error) {
    if (error.message.includes("nodo_ambiguo")) {
      throw new Error("Administras varios puntos; indica con cuál te comprometes.");
    }
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para comprometer stock de este punto.");
    }
    throw error;
  }
  return data as string;
}

// Cancela un compromiso (de voluntario o de nodo). p_motivo opcional:
// 'incumplimiento' para que el admin del nodo origen marque no-cumplimiento.
export async function cancelarCompromiso(
  compromisoId: string,
  token: string,
  motivo?: "incumplimiento"
): Promise<void> {
  const { error } = await supabaseWithToken(token).rpc("cancelar_compromiso", {
    p_compromiso_id: compromisoId,
    p_token: token,
    p_motivo: motivo ?? null,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para cancelar este compromiso.");
    }
    throw error;
  }
}

// El admin del nodo que PUBLICÓ la solicitud confirma la entrega de un
// compromiso (voluntario -> completado, nodo -> entregado).
export async function confirmarEntregaCompromiso(
  compromisoId: string,
  token: string
): Promise<void> {
  const { error } = await supabaseWithToken(token).rpc("confirmar_entrega_compromiso", {
    p_compromiso_id: compromisoId,
    p_token_admin_destino: token,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("Solo el punto que publicó la solicitud puede confirmar la entrega.");
    }
    throw error;
  }
}

// El admin del nodo DESTINO registra si el voluntario llegó (issue #23).
//   llego=true  -> confirma la entrega (delega en confirmar_entrega_compromiso).
//   llego=false -> incumplimiento: bloquea la cédula (permanente, sin apelación),
//                  desactiva el token y el sobrante vuelve a ofrecerse.
export async function confirmarLlegadaCompromiso(
  compromisoId: string,
  llego: boolean,
  token: string
): Promise<void> {
  const { error } = await supabaseWithToken(token).rpc("confirmar_llegada_compromiso", {
    p_compromiso_id: compromisoId,
    p_llego: llego,
    p_token: token,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("Solo el punto que publicó la solicitud puede registrar la llegada.");
    }
    if (error.message.includes("compromiso_no_pendiente")) {
      throw new Error("Este compromiso ya fue resuelto.");
    }
    throw error;
  }
}

// Lectura filtrada para el panel de voluntario: las solicitudes que puede
// atender (filtro de vehículo y sobrante aplicados server-side). Cada solicitud
// trae en_rango (issue #20); requiere_verificacion es true si el voluntario no
// tiene una zona vigente y debe verificar su ubicación antes de tomar nada.
export async function listarSolicitudesDisponibles(
  token: string
): Promise<SolicitudesDisponiblesResp> {
  const { data, error } = await supabaseWithToken(token).rpc(
    "listar_solicitudes_disponibles",
    { p_token_voluntario: token }
  );
  if (error) throw error;
  return (data ?? { requiere_verificacion: true, solicitudes: [] }) as SolicitudesDisponiblesResp;
}

// Verificación de ubicación del voluntario (issue #20). Pide el GPS UNA sola vez
// (getCurrentPosition), única excepción permitida al "nunca disparar el prompt":
// es una acción explícita del voluntario para poder operar. Sin watchPosition ni
// polling. El servidor resuelve el municipio y DESCARTA las coordenadas: nunca
// se guardan ni se comparten. La zona resultante vale 24h.
export async function verificarUbicacionVoluntario(
  token: string
): Promise<VerificacionUbicacion> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Tu dispositivo no permite obtener la ubicación.");
  }

  const coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Necesitas permitir el acceso a tu ubicación para operar."
              : "No se pudo obtener tu ubicación. Intenta de nuevo."
          )
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  const { data, error } = await supabaseWithToken(token).rpc("verificar_ubicacion_voluntario", {
    p_token: token,
    p_lat: coords.lat,
    p_lng: coords.lng,
  });
  if (error) {
    if (error.message.includes("fuera_de_venezuela")) {
      throw new Error("Tu ubicación no coincide con ningún municipio registrado.");
    }
    throw error;
  }
  return data as VerificacionUbicacion;
}

// Las solicitudes de un nodo con sus compromisos (panel de admin del nodo origen).
export async function listarSolicitudesNodo(
  nodeId: string,
  token: string
): Promise<SolicitudNodo[]> {
  const { data, error } = await supabaseWithToken(token).rpc("listar_solicitudes_nodo", {
    p_node_id: nodeId,
    p_token_admin: token,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No administras este punto.");
    }
    throw error;
  }
  return (data ?? []) as SolicitudNodo[];
}

// --- Inventario por nodo (issue #22) ---

// Los nodos donde el token es admin O colaborador (para el panel de colaborador).
export async function listarNodosMiembro(token: string): Promise<NodoMiembro[]> {
  const { data, error } = await supabaseWithToken(token).rpc("listar_nodos_miembro", {
    p_token: token,
  });
  if (error) throw error;
  return (data ?? []) as NodoMiembro[];
}

// Inventario de un nodo con su categoría/subcategoría anidadas. Sin token lee por
// el cliente público (RLS: solo nodos visibles y verificados, para #24); con token
// el miembro del nodo ve el suyo en cualquier estado (policy es_miembro_nodo).
export async function getInventarioNodo(
  nodeId: string,
  token?: string
): Promise<InventarioItem[]> {
  const client = token ? supabaseWithToken(token) : supabase;
  const { data, error } = await client
    .from("node_inventory")
    .select("*, category:categories(id, name, slug), subcategory:subcategories(id, category_id, name, slug)")
    .eq("node_id", nodeId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InventarioItem[];
}

// Alta/edición del inventario (solo el admin del nodo). La RPC valida la magnitud
// contra el tipo de nodo: entrega la rechaza, acopio la exige, mixto la acepta.
export async function upsertInventario(
  nodeId: string,
  items: InventarioUpsertItem[],
  token: string
): Promise<void> {
  const { error } = await supabaseWithToken(token).rpc("upsert_inventario", {
    p_token: token,
    p_node_id: nodeId,
    p_items: items,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("Solo el administrador del punto puede configurar el inventario.");
    }
    if (error.message.includes("entrega_sin_magnitud")) {
      throw new Error("Un punto de entrega publica disponibilidad sin cantidades; no indiques magnitud.");
    }
    if (error.message.includes("acopio_requiere_magnitud")) {
      throw new Error("Un centro de acopio debe indicar la magnitud de cada item.");
    }
    throw error;
  }
}

// Marca un item como "no hay" (admin o colaborador). Devuelve los datos para
// ofrecer una solicitud de reposición.
export async function marcarAgotado(
  inventoryId: string,
  token: string
): Promise<AgotadoSugerencia> {
  const { data, error } = await supabaseWithToken(token).rpc("marcar_agotado", {
    p_token: token,
    p_inventory_id: inventoryId,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para actualizar el inventario de este punto.");
    }
    throw error;
  }
  return data as AgotadoSugerencia;
}

// Solicita reposición de un item del inventario (admin o colaborador). Es un
// wrapper de crear_solicitud (issue #19) con la magnitud (nivel mínimo del nodo).
export async function solicitarReposicion(
  inventoryId: string,
  magnitud: Magnitud,
  requiereVehiculo: boolean,
  token: string
): Promise<string> {
  const { data, error } = await supabaseWithToken(token).rpc("solicitar_reposicion", {
    p_token: token,
    p_inventory_id: inventoryId,
    p_magnitud: magnitud,
    p_requiere_vehiculo: requiereVehiculo,
  });
  if (error) {
    if (error.message.includes("no_autorizado")) {
      throw new Error("No tienes permiso para solicitar reposición en este punto.");
    }
    throw error;
  }
  return data as string;
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
