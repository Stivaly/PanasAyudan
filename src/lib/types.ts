export type CategorySlug =
  | "agua"
  | "comida"
  | "medicinas"
  | "higiene"
  | "ropa"
  | "herramientas"
  | "otro";

export interface Category {
  id: string;
  name: string;
  slug: CategorySlug;
}

export interface EstadoVenezuela {
  id: string;
  nombre: string;
  slug: string;
  orden: number;
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
  created_at: string;
}

export interface Volunteer {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  telegram: string | null;
  zona_descripcion: string | null;
  token: string;
  activo: boolean;
  created_at: string;
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
