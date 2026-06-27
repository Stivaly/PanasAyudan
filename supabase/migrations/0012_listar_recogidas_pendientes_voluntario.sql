-- Lista solo las solicitudes pendientes hechas sobre aportes publicados
-- por el voluntario autenticado con volunteer-token.

create or replace function listar_recogidas_pendientes_voluntario()
returns table (
  id uuid,
  aporte_item_id uuid,
  volunteer_id uuid,
  nombre text,
  apellido text,
  cedula text,
  placa_vehiculo text,
  qty_a_buscar integer,
  status text,
  reserved_until timestamptz,
  created_at timestamptz,
  descripcion text,
  place_name text,
  location_id uuid,
  aporte_id uuid,
  lat double precision,
  lng double precision
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.aporte_item_id,
    r.volunteer_id,
    r.nombre,
    r.apellido,
    r.cedula,
    r.placa_vehiculo,
    r.qty_a_buscar,
    r.status,
    r.reserved_until,
    r.created_at,
    ai.descripcion,
    l.place_name,
    l.id as location_id,
    a.id as aporte_id,
    l.lat,
    l.lng
  from volunteers v
  join aportes a on a.volunteer_id = v.id
  join locations l on l.id = a.location_id
  join aporte_items ai on ai.aporte_id = a.id
  join recogidas r on r.aporte_item_id = ai.id
  where v.token = current_volunteer_token()
    and v.activo = true
    and r.status = 'pendiente'
  order by r.reserved_until asc;
$$;

grant execute on function listar_recogidas_pendientes_voluntario() to anon, authenticated;
