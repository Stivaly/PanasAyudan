// Taxonomía fija de macrocategorías (issue #30). Los slugs son estables y los
// define el sistema (ver 0037_taxonomia_categorias.sql).
export type CategorySlug =
  | "agua"
  | "alimentacion"
  | "medicinas"
  | "higiene-personal"
  | "higiene-sanitaria"
  | "ropa-abrigo"
  | "herramientas-rescate"
  | "comunicacion"
  | "transporte"
  | "otro";

export interface Category {
  id: string;
  name: string;
  slug: CategorySlug;
}

// Subcategoría fija de una macrocategoría (issue #30).
export interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  slug: string;
}

export interface EstadoVenezuela {
  id: string;
  nombre: string;
  slug: string;
  orden: number;
}

// --- Nodos (issue #18) ---
// Un "nodo" es lo que vive en centros_acopio: un lugar de acopio/entrega con
// tipo, ciclo de vida (status) y ownership (node_admins / node_collaborators).
export type NodeTipo = "acopio" | "entrega" | "mixto";
export type NodeStatus = "inactivo" | "activo" | "pausado" | "cerrado";

export interface CentroAcopio {
  id: string;
  estado_id: string;
  nombre: string;
  direccion: string;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  horario: string | null;
  contacto: string | null;
  activo: boolean;
  // Campos del modelo de nodos (0031). Opcionales para no romper lecturas viejas.
  tipo?: NodeTipo;
  status?: NodeStatus;
  pausado_recepcion?: boolean;
  pausado_entrega?: boolean;
  verificado_at?: string | null;
}

// Forma que devuelve listar_nodos_admin(p_token): los nodos que administra el
// token, con su estado real y la verificación GPS de ESTE admin sobre el nodo.
export interface NodoAdmin {
  id: string;
  nombre: string;
  direccion: string;
  tipo: NodeTipo;
  status: NodeStatus;
  lat: number | null;
  lng: number | null;
  estado_id: string;
  // horario y descripcion se leen para pre-llenar el formulario de edición (#29).
  horario: string | null;
  descripcion: string | null;
  pausado_recepcion: boolean;
  pausado_entrega: boolean;
  verificado: boolean;
  verificado_at: string | null;
}

// Campos editables de un nodo por su admin (issue #29). Todos opcionales: solo se
// envían los que cambian. Si se envían lat/lng distintos, la RPC devuelve el nodo
// a 'inactivo' y exige re-verificar el GPS (ver 0042_editar_nodo.sql).
export interface EditarNodoDatos {
  nombre?: string;
  tipo?: NodeTipo;
  direccion?: string;
  estado_id?: string;
  horario?: string | null;
  descripcion?: string | null;
  lat?: number;
  lng?: number;
  google_place_id?: string | null;
}

// Forma que devuelve listar_nodos_miembro(p_token): los nodos donde el token es
// admin O colaborador (issue #22). Subconjunto de NodoAdmin (sin verificación de
// ownership), suficiente para que el panel de colaborador alcance su inventario.
export interface NodoMiembro {
  id: string;
  nombre: string;
  direccion: string;
  tipo: NodeTipo;
  status: NodeStatus;
  pausado_recepcion: boolean;
  pausado_entrega: boolean;
}

// Solicitud pública de registro de nodo (issue #21). La cola que ve la superadmin
// en /superadmin; al aprobar nace un admin + un nodo inactivo. El teléfono del
// solicitante solo lo lee la superadmin (RLS), nunca sale en lecturas públicas.
export type SolicitudRegistroStatus = "pendiente" | "aprobada" | "rechazada";

export interface SolicitudRegistroNodo {
  id: string;
  nombre_nodo: string;
  tipo: NodeTipo;
  lat: number | null;
  lng: number | null;
  direccion: string | null;
  google_place_id: string | null;
  estado_id: string | null;
  categorias: string[];
  horarios: string | null;
  solicitante_nombre: string;
  solicitante_telefono: string;
  mensaje: string | null;
  audio_url: string | null;
  status: SolicitudRegistroStatus;
  motivo_rechazo: string | null;
  node_id: string | null;
  created_at: string;
}

// Datos que viajan a crear_nodo (p_datos jsonb).
export interface NodoData {
  nombre: string;
  direccion: string;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  estado_id: string;
  tipo: NodeTipo;
  horario: string | null;
  contacto: string | null;
}

export type TipoPausa = "recepcion" | "entrega" | "ambas" | "reactivar";

// Estado de visibilidad DERIVADO para lecturas públicas: si cualquiera de las
// banderas está en true, el nodo se muestra como 'pausado' / "No operativo"
// aunque la columna interna status siga en 'activo' (ver 0031).
// Un nodo 'activo' se ve 'pausado' cuando tiene alguna mitad relevante pausada.
// El tipo acota qué mitades cuentan: un acopio solo recibe (importa recepción),
// una entrega solo da (importa entrega) y un mixto opera ambas. Sin tipo, se
// considera cualquiera de las dos (comportamiento previo, seguro para lecturas).
export function statusVisible(n: {
  status?: NodeStatus;
  tipo?: NodeTipo | null;
  pausado_recepcion?: boolean | null;
  pausado_entrega?: boolean | null;
}): NodeStatus {
  if (n.status === "activo" && pausadoRelevante(n)) {
    return "pausado";
  }
  return n.status ?? "activo";
}

// Indica si el nodo está pausado en alguna mitad que su tipo realmente opera.
export function pausadoRelevante(n: {
  tipo?: NodeTipo | null;
  pausado_recepcion?: boolean | null;
  pausado_entrega?: boolean | null;
}): boolean {
  const cuentaRecepcion = n.tipo !== "entrega";
  const cuentaEntrega = n.tipo !== "acopio";
  return (
    (cuentaRecepcion && Boolean(n.pausado_recepcion)) ||
    (cuentaEntrega && Boolean(n.pausado_entrega))
  );
}

export interface ZonaRescate {
  id: string;
  estado_id: string;
  nombre: string;
  descripcion: string | null;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  activo: boolean;
}

export interface Location {
  id: string;
  google_place_id: string | null;
  place_name: string;
  lat: number;
  lng: number;
  address: string | null;
  descripcion_libre: string | null;
  estado_id: string | null;
  estado?: EstadoVenezuela | null;
  centro_acopio_id?: string | null;
  zona_rescate_id?: string | null;
  centros_acopio?: { nombre: string; horario: string | null; contacto: string | null } | null;
  zonas_rescate?: { nombre: string; descripcion: string | null } | null;
  created_at: string;
}

export type VolunteerRole = "superadmin" | "admin" | "colaborador" | "voluntario";

export interface Volunteer {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  telegram: string | null;
  zona_descripcion: string | null;
  centro_acopio_id?: string | null;
  role?: VolunteerRole;
  token: string;
  activo: boolean;
  created_at: string;
}

// --- Solicitudes entre nodos (issue #19) ---
// Magnitud: escala ORDINAL (no medida física). El array está en el mismo orden
// que magnitud_orden() del backend (unidades=1 ... gandola=7), reutilizable para
// poblar selects en ese orden.
export const MAGNITUD_ORDEN = [
  "unidades",
  "decenas",
  "centenas",
  "cajas",
  "pallets",
  "camioneta",
  "gandola",
] as const;

export type Magnitud = (typeof MAGNITUD_ORDEN)[number];

export type SolicitudStatus =
  | "abierta"
  | "parcial"
  | "en_camino"
  | "inventario_asegurado"
  | "cerrada";

export interface Solicitud {
  id: string;
  node_id_origen: string;
  category_id: string;
  subcategoria: string | null;
  magnitud: Magnitud;
  requiere_vehiculo: boolean;
  status: SolicitudStatus;
  created_at: string;
}

export type CompromisoVoluntarioStatus = "pendiente" | "retirado" | "completado" | "incumplido";

export interface CompromisoVoluntario {
  id: string;
  compromiso_nodo_id?: string | null;
  nombre?: string | null;
  magnitud: Magnitud;
  // Conteo concreto comprometido junto a la magnitud (ej. 5 "cajas").
  cantidad: number | null;
  tiempo_estimado_minutos: number;
  status: CompromisoVoluntarioStatus;
  created_at: string;
  reservado_until?: string | null;
  retirado_at?: string | null;
  entrega_deadline?: string | null;
  atrasado_4h?: boolean;
  // Aviso de 24h (issue #23): compromiso 'pendiente' cuya llegada estimada
  // venció hace más de 24h sin confirmación. Alimenta la badge roja del panel.
  atrasado_24h: boolean;
}

export type CompromisoNodoStatus =
  | "comprometido"
  | "en_camino"
  | "entregado"
  | "cancelado";

export interface CompromisoNodo {
  id: string;
  nodo_nombre?: string | null;
  magnitud: Magnitud;
  cantidad: number | null;
  cantidad_disponible_transporte?: number | null;
  tiene_transporte: boolean;
  status: CompromisoNodoStatus;
  node_id_compromete: string;
  created_at: string;
}

// Forma que devuelve listar_solicitudes_disponibles (panel de voluntario): el
// sobrante calculado, sin detalle de quién comprometió qué ni ubicación alguna.
export interface SolicitudDisponible {
  id: string;
  solicitud_id: string;
  compromiso_nodo_id: string;
  node_id_origen: string;
  nodo_nombre: string;
  node_id_compromete: string;
  nodo_origen_nombre: string;
  category_id: string;
  category_name: string;
  subcategoria: string | null;
  // Comentario libre del pedido: precisa QUÉ se necesita (ej. "insulina NPH").
  // Público y no sensible; nunca lleva contacto ni ubicación.
  nota: string | null;
  magnitud: Magnitud;
  // Conteo concreto del pedido junto a la magnitud (ej. 5 "cajas"). Obligatorio
  // al crear; puede ser null en filas anteriores a la migración 0049.
  cantidad: number | null;
  cantidad_disponible: number;
  cantidad_solicitada: number | null;
  requiere_vehiculo: boolean;
  status: SolicitudStatus;
  compromiso_status: CompromisoNodoStatus;
  sobrante: number;
  created_at: string;
  // Issue #20: el municipio del nodo origen está en una zona VIGENTE del
  // voluntario. Las fuera de rango (false) se muestran pero no se pueden tomar.
  en_rango: boolean;
}

export interface CompromisoVoluntarioActivo {
  id: string;
  solicitud_id: string;
  compromiso_nodo_id: string | null;
  node_id_origen: string;
  nodo_nombre: string;
  node_id_compromete: string | null;
  nodo_origen_nombre: string | null;
  category_id: string;
  category_name: string;
  subcategoria: string | null;
  nota: string | null;
  magnitud: Magnitud;
  cantidad: number | null;
  status: "pendiente" | "retirado";
  created_at: string;
  reservado_until: string | null;
  retirado_at: string | null;
  entrega_deadline: string | null;
  atrasado_4h: boolean;
  atrasado_24h: boolean;
}

export interface SolicitudParaNodo {
  id: string;
  node_id_origen: string;
  nodo_nombre: string;
  category_id: string;
  category_name: string;
  subcategoria: string | null;
  nota: string | null;
  magnitud: Magnitud;
  cantidad: number | null;
  requiere_vehiculo: boolean;
  status: SolicitudStatus;
  sobrante: number;
  distancia_km: number | null;
  created_at: string;
}

// Respuesta de listar_solicitudes_disponibles (issue #20). requiere_verificacion
// es true cuando el voluntario no tiene ninguna zona vigente (nunca verificó o
// venció el plazo de 24h): el panel debe pedir "Verificar mi ubicación".
export interface SolicitudesDisponiblesResp {
  requiere_verificacion: boolean;
  solicitudes: SolicitudDisponible[];
  compromisos?: CompromisoVoluntarioActivo[];
}

// Respuesta de verificar_ubicacion_voluntario (issue #20). Nunca incluye
// coordenadas: el servidor las resuelve a un municipio y las descarta.
export interface VerificacionUbicacion {
  municipio: string;
  municipio_id: string;
  expira_at: string;
  adyacentes: string[];
}

// Forma que devuelve listar_solicitudes_nodo (panel de admin): la solicitud del
// nodo con sus compromisos anidados.
export interface SolicitudNodo {
  id: string;
  category_id: string;
  category_name: string;
  // FK de subcategoría (para pre-seleccionar al editar); el texto queda en subcategoria.
  subcategory_id: string | null;
  subcategoria: string | null;
  nota: string | null;
  magnitud: Magnitud;
  cantidad: number | null;
  requiere_vehiculo: boolean;
  status: SolicitudStatus;
  sobrante: number;
  created_at: string;
  compromisos_voluntario: CompromisoVoluntario[];
  compromisos_nodo: CompromisoNodo[];
}

export interface MovimientoNodoSaliente {
  id: string;
  solicitud_id: string;
  node_id_compromete: string;
  node_id_destino: string;
  destino_nombre: string;
  category_name: string;
  subcategoria: string | null;
  nota: string | null;
  magnitud: Magnitud;
  cantidad: number | null;
  tiene_transporte: boolean;
  status: CompromisoNodoStatus;
  created_at: string;
  cantidad_con_voluntario: number;
  cantidad_sin_voluntario: number;
  puede_cancelar: boolean;
  puede_editar: boolean;
  puede_marcar_enviado: boolean;
}

export interface MovimientoNodoVoluntario {
  id: string;
  nombre: string;
  cantidad: number | null;
  magnitud: Magnitud;
  status: CompromisoVoluntarioStatus;
  reservado_until: string | null;
  retirado_at: string | null;
  entrega_deadline: string | null;
}

export interface MovimientoNodoEntrante {
  id: string;
  solicitud_id: string;
  node_id_compromete: string;
  origen_nombre: string;
  category_name: string;
  subcategoria: string | null;
  nota: string | null;
  magnitud: Magnitud;
  cantidad: number | null;
  tiene_transporte: boolean;
  status: CompromisoNodoStatus;
  created_at: string;
  transportista: string;
  voluntarios: MovimientoNodoVoluntario[];
  puede_confirmar_recepcion: boolean;
}

export interface MovimientosNodoResp {
  salientes: MovimientoNodoSaliente[];
  entrantes: MovimientoNodoEntrante[];
}

// Datos que viajan a crear_solicitud (p_datos jsonb).
export interface SolicitudData {
  category_id: string;
  // Subcategoría por FK (issue #30). El texto libre subcategoria queda como
  // legado: crear_solicitud lo deriva del nombre de la subcategoría elegida.
  subcategory_id: string | null;
  magnitud: Magnitud;
  // Conteo concreto del pedido (entero > 0). Obligatorio: crear_solicitud lo exige.
  cantidad: number;
  requiere_vehiculo: boolean;
  // Comentario libre opcional del pedido (ej. "insulina NPH 100UI"). Se recorta
  // a 280 chars server-side. Nunca debe llevar contacto ni ubicación.
  nota?: string | null;
}

// --- Inventario por nodo (issue #22) ---
// Un item de inventario de un nodo: disponibilidad por categoría/subcategoría.
// magnitud solo la publican los nodos acopio | mixto (null en entrega). condicion
// es pública (ej. "Se requiere receta médica"). category/subcategory llegan
// anidadas cuando se lee con el join de getInventarioNodo.
export interface InventarioItem {
  id: string;
  node_id: string;
  category_id: string;
  subcategory_id: string | null;
  disponible: boolean;
  magnitud: Magnitud | null;
  // Conteo concreto junto a la magnitud (ej. 5 "cajas"). Obligatorio en nodos
  // acopio | mixto; null en punto de entrega (que no publica magnitud). NO se
  // expone en lecturas públicas (#24 prohíbe cantidades públicas).
  cantidad: number | null;
  condicion: string | null;
  // Comentario libre del item: precisa QUÉ hay/se ofrece (ej. "acetaminofén
  // 500mg"). Distinto de condicion (condiciones de entrega). Público, sin contacto.
  nota: string | null;
  updated_at: string;
  category?: Category | null;
  subcategory?: Subcategory | null;
}

// Item que viaja a upsert_inventario (p_items jsonb array). subcategory_id null =
// item a nivel de macrocategoría; magnitud null = sin cantidad (punto de entrega).
export interface InventarioUpsertItem {
  category_id: string;
  subcategory_id: string | null;
  disponible: boolean;
  magnitud: Magnitud | null;
  cantidad: number | null;
  condicion: string | null;
  nota: string | null;
}

// Respuesta de marcar_agotado: los datos para ofrecer la solicitud de reposición.
export interface AgotadoSugerencia {
  sugerir_solicitud: boolean;
  inventory_id: string;
  node_id: string;
  category_id: string;
  subcategory_id: string | null;
}

// --- Vista pública de nodos (issue #24) ---
// Lo que ve el público en /buscar y /nodo/[id]. NUNCA incluye contacto ni
// magnitudes/cantidades: la RLS (#22) y los SELECT explícitos lo garantizan.
export interface NodoPublicoBase {
  id: string;
  nombre: string;
  tipo: NodeTipo;
  direccion: string;
  estado_id: string;
  horario: string | null;
  lat: number | null;
  lng: number | null;
  status: NodeStatus;
  pausado_recepcion: boolean;
  pausado_entrega: boolean;
}

// Nodo de la lista pública con sus macrocategorías disponibles (para las badges).
export interface NodoPublico extends NodoPublicoBase {
  categorias: Category[];
}

// Item de inventario visible al público (detalle): SIN magnitud, porque el issue
// #24 prohíbe exponer cantidades/magnitudes en lecturas públicas. Solo categoría,
// subcategoría y la condicion (ej. "Se requiere receta médica").
export interface InventarioPublicoItem {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  condicion: string | null;
  // Comentario libre del item (ej. "acetaminofén 500mg"). Es descriptivo, NO una
  // cantidad, así que sí puede exponerse públicamente (a diferencia de magnitud).
  nota: string | null;
  category: Category | null;
  subcategory: Subcategory | null;
}

// Texto de la(s) mitad(es) pausada(s) relevante(s) al tipo del nodo, para la badge
// pública (ej. "recepción", "entrega", "recepción y entrega"). null si no hay pausa
// relevante. Comparte criterio con pausadoRelevante/statusVisible (#18).
export function descripcionPausa(n: {
  tipo?: NodeTipo | null;
  pausado_recepcion?: boolean | null;
  pausado_entrega?: boolean | null;
}): string | null {
  if (!pausadoRelevante(n)) return null;
  const partes: string[] = [];
  if (n.tipo !== "entrega" && n.pausado_recepcion) partes.push("recepción");
  if (n.tipo !== "acopio" && n.pausado_entrega) partes.push("entrega");
  return partes.join(" y ");
}

export type AporteStatus = "activo" | "cerrado";

export interface Aporte {
  id: string;
  location_id: string;
  volunteer_id: string | null;
  status: AporteStatus;
  created_at: string;
}

export interface AporteConContacto extends Aporte {
  contact_phone: string | null;
  contact_telegram: string | null;
}

export interface AporteItem {
  id: string;
  aporte_id: string;
  category_id: string;
  descripcion: string;
  qty_approx: number;
  qty_disponible: number;
}

export type RecogidaStatus = "pendiente" | "completada" | "cancelada";

export interface Recogida {
  id: string;
  aporte_item_id: string;
  volunteer_id: string | null;
  nombre: string;
  apellido: string;
  cedula: string;
  placa_vehiculo: string | null;
  qty_a_buscar: number;
  status: RecogidaStatus;
  reserved_until: string;
  confirmation_deadline: string | null;
  confirmada_at: string | null;
  destino_centro_acopio_id?: string | null;
  destino_zona_rescate_id?: string | null;
  created_at: string;
}

export interface ReservaPublica {
  aporte_item_id: string;
  category_id: string;
  category_name: string;
  descripcion: string;
  qty_a_buscar: number;
  reserved_until: string;
}

// Reserva propia del dispositivo actual, identificada por recogedor_token.
// Incluye datos personales porque son del propio usuario.
export interface ReservaRecogedor {
  id: string;
  aporte_item_id: string;
  location_id: string;
  place_name: string;
  category_name: string;
  descripcion: string;
  nombre: string;
  apellido: string;
  cedula: string;
  placa_vehiculo: string | null;
  qty_a_buscar: number;
  reserved_until: string;
  status: RecogidaStatus;
}

// Recogida del dispositivo actual con el detalle del item y lugar anidado,
// tal como la devuelve la RPC listar_recogidas_recogedor.
export interface RecogidaConDetalle {
  id: string;
  status: RecogidaStatus;
  qty_a_buscar: number;
  confirmada_at: string | null;
  confirmation_deadline: string | null;
  reserved_until: string;
  recogedor_token: string | null;
  whatsapp: string | null;
  destino_centro: {
    nombre: string;
    direccion: string;
    horario: string | null;
    contacto: string | null;
  } | null;
  destino_zona: {
    nombre: string;
    descripcion: string | null;
  } | null;
  aporte_item: {
    descripcion: string;
    category_id: string;
    qty_disponible: number;
    aporte: {
      location_id: string;
      location: {
        place_name: string;
        descripcion_libre: string | null;
        estado: string | null;
      } | null;
    } | null;
  } | null;
}

export interface EstadisticasImpacto {
  total_recogidas_completadas: number;
  total_recogidas_confirmadas: number;
  total_qty_coordinada: number;
  total_aportes_activos: number;
  lugares_activos: number;
}

export interface AporteVoluntario {
  aporte_id: string;
  location_id: string;
  place_name: string;
  address: string | null;
  descripcion_lugar: string | null;
  item_id: string;
  category_name: string;
  item_descripcion: string;
  qty_approx: number;
  qty_disponible: number;
  aporte_status: AporteStatus;
  created_at: string;
}

// --- Payloads de RPC ---

export interface PlaceSeleccion {
  google_place_id: string;
  place_name: string;
  lat: number;
  lng: number;
  address: string | null;
}

export interface LocationData {
  google_place_id: string | null;
  place_name: string;
  lat: number;
  lng: number;
  address: string | null;
  descripcion_libre: string;
  estado_id: string;
  centro_acopio_id?: string | null;
  zona_rescate_id?: string | null;
}

export interface ItemData {
  category_id: string;
  descripcion: string;
  qty_approx: number;
}

export interface ContactData {
  contact_phone: string | null;
  contact_telegram: string | null;
  volunteer_id: string | null;
}

export interface RecogidaData {
  nombre: string;
  apellido: string;
  cedula: string;
  placa_vehiculo: string | null;
  volunteer_id: string | null;
  recogedor_token: string | null;
  destino_centro_acopio_id?: string | null;
  destino_zona_rescate_id?: string | null;
}

// --- Vistas compuestas para UI ---

export interface ItemConCategoria extends AporteItem {
  category: Category;
}

export interface LugarConItems {
  location: Location;
  items: ItemConCategoria[];
}

export interface Coords {
  lat: number;
  lng: number;
}
