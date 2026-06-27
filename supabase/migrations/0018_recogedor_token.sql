-- 0018_recogedor_token.sql
-- Identidad local del recogedor (quien va a buscar insumos).
-- El frontend genera un token UUID permanente en localStorage y lo envía con
-- cada reserva. No es autenticación: solo permite que un dispositivo reconozca
-- sus propias reservas. No se comparte entre navegadores.

-- 1. Columna para guardar el token local del recogedor en cada recogida.
alter table recogidas add column if not exists recogedor_token text;

create index if not exists idx_recogidas_recogedor_token
  on recogidas(recogedor_token);

-- 2. reservar_item ahora persiste recogedor_token (si viene en el payload).
create or replace function reservar_item(
  p_aporte_item_id uuid,
  p_qty            int,
  recogida_data    jsonb  -- { nombre, apellido, cedula, placa_vehiculo, volunteer_id, recogedor_token }
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disponible  int;
  v_recogida_id uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'La cantidad a buscar debe ser mayor a cero.';
  end if;

  select qty_disponible into v_disponible
  from aporte_items
  where id = p_aporte_item_id
  for update;

  if not found then
    raise exception 'El item no existe.';
  end if;

  if v_disponible < p_qty then
    raise exception 'Stock insuficiente: disponible % , solicitado %.', v_disponible, p_qty;
  end if;

  update aporte_items
    set qty_disponible = qty_disponible - p_qty
  where id = p_aporte_item_id;

  insert into recogidas (
    aporte_item_id, volunteer_id, nombre, apellido, cedula,
    placa_vehiculo, qty_a_buscar, recogedor_token
  )
  values (
    p_aporte_item_id,
    nullif(recogida_data ->> 'volunteer_id', '')::uuid,
    recogida_data ->> 'nombre',
    recogida_data ->> 'apellido',
    recogida_data ->> 'cedula',
    nullif(recogida_data ->> 'placa_vehiculo', ''),
    p_qty,
    nullif(recogida_data ->> 'recogedor_token', '')
  )
  returning id into v_recogida_id;

  return v_recogida_id;
end;
$$;

-- 3. listar_recogidas_por_token: reservas pendientes vigentes de un dispositivo
--    (por su token local) en un lugar. Devuelve los datos personales porque son
--    del propio usuario; un token ajeno no devuelve nada.
create or replace function listar_recogidas_por_token(
  p_recogedor_token text,
  p_location_id     uuid
)
returns table (
  id             uuid,
  aporte_item_id uuid,
  location_id    uuid,
  place_name     text,
  category_name  text,
  descripcion    text,
  nombre         text,
  apellido       text,
  cedula         text,
  placa_vehiculo text,
  qty_a_buscar   integer,
  reserved_until timestamptz,
  status         text
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.aporte_item_id,
    l.id as location_id,
    l.place_name,
    c.name as category_name,
    ai.descripcion,
    r.nombre,
    r.apellido,
    r.cedula,
    r.placa_vehiculo,
    r.qty_a_buscar,
    r.reserved_until,
    r.status
  from recogidas r
  join aporte_items ai on ai.id = r.aporte_item_id
  join categories c on c.id = ai.category_id
  join aportes a on a.id = ai.aporte_id
  join locations l on l.id = a.location_id
  where r.recogedor_token is not null
    and r.recogedor_token = p_recogedor_token
    and l.id = p_location_id
    and r.status = 'pendiente'
    and r.reserved_until > now()
  order by r.reserved_until asc;
$$;

grant execute on function reservar_item(uuid, int, jsonb)            to anon, authenticated;
grant execute on function listar_recogidas_por_token(text, uuid)     to anon, authenticated;
