-- 0003_rpc.sql
-- PanasAyudan — funciones RPC (SECURITY DEFINER, dueñas de tabla, bypassean RLS).

-- ---------------------------------------------------------------------------
-- 1. crear_aporte: upsert de location, inserta aporte e items en una tx.
--    Devuelve el id del aporte.
-- ---------------------------------------------------------------------------
create or replace function crear_aporte(
  location_data jsonb,   -- { google_place_id, place_name, lat, lng, address }
  items_data    jsonb,   -- [ { category_id, descripcion, qty_approx }, ... ]
  contact_data  jsonb    -- { contact_phone, contact_telegram, volunteer_id }
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_aporte_id   uuid;
  v_phone       text := nullif(contact_data ->> 'contact_phone', '');
  v_telegram    text := nullif(contact_data ->> 'contact_telegram', '');
  v_item        jsonb;
begin
  if v_phone is null and v_telegram is null then
    raise exception 'Debe indicar al menos un contacto (teléfono o telegram).';
  end if;

  if items_data is null or jsonb_array_length(items_data) = 0 then
    raise exception 'Debe agregar al menos un item.';
  end if;

  insert into locations (google_place_id, place_name, lat, lng, address)
  values (
    location_data ->> 'google_place_id',
    location_data ->> 'place_name',
    (location_data ->> 'lat')::double precision,
    (location_data ->> 'lng')::double precision,
    location_data ->> 'address'
  )
  on conflict (google_place_id) do update
    set place_name = excluded.place_name,
        lat        = excluded.lat,
        lng        = excluded.lng,
        address    = excluded.address
  returning id into v_location_id;

  insert into aportes (location_id, volunteer_id, contact_phone, contact_telegram)
  values (
    v_location_id,
    nullif(contact_data ->> 'volunteer_id', '')::uuid,
    v_phone,
    v_telegram
  )
  returning id into v_aporte_id;

  for v_item in select * from jsonb_array_elements(items_data)
  loop
    insert into aporte_items (aporte_id, category_id, descripcion, qty_approx, qty_disponible)
    values (
      v_aporte_id,
      (v_item ->> 'category_id')::uuid,
      v_item ->> 'descripcion',
      (v_item ->> 'qty_approx')::int,
      (v_item ->> 'qty_approx')::int
    );
  end loop;

  return v_aporte_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. reservar_item: descuenta stock atómicamente e inserta recogida.
--    Devuelve el id de la recogida.
-- ---------------------------------------------------------------------------
create or replace function reservar_item(
  p_aporte_item_id uuid,
  p_qty            int,
  recogida_data    jsonb  -- { nombre, apellido, cedula, placa_vehiculo, volunteer_id }
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
    placa_vehiculo, qty_a_buscar
  )
  values (
    p_aporte_item_id,
    nullif(recogida_data ->> 'volunteer_id', '')::uuid,
    recogida_data ->> 'nombre',
    recogida_data ->> 'apellido',
    recogida_data ->> 'cedula',
    nullif(recogida_data ->> 'placa_vehiculo', ''),
    p_qty
  )
  returning id into v_recogida_id;

  return v_recogida_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. obtener_aporte_con_contacto: valida token y revela el contacto.
-- ---------------------------------------------------------------------------
create or replace function obtener_aporte_con_contacto(
  p_aporte_id      uuid,
  p_volunteer_token uuid
)
returns table (
  id               uuid,
  location_id      uuid,
  status           text,
  contact_phone    text,
  contact_telegram text,
  created_at       timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from volunteers
    where token = p_volunteer_token and activo = true
  ) then
    raise exception 'Token de voluntario inválido o inactivo.';
  end if;

  return query
  select a.id, a.location_id, a.status, a.contact_phone, a.contact_telegram, a.created_at
  from aportes a
  where a.id = p_aporte_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. completar_recogida: valida token y marca status = 'completada'.
-- ---------------------------------------------------------------------------
create or replace function completar_recogida(
  p_recogida_id     uuid,
  p_volunteer_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from volunteers
    where token = p_volunteer_token and activo = true
  ) then
    raise exception 'Token de voluntario inválido o inactivo.';
  end if;

  update recogidas
    set status = 'completada'
  where id = p_recogida_id and status = 'pendiente';

  if not found then
    raise exception 'La recogida no existe o no está pendiente.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. liberar_recogida: cancela y restaura stock. La usa pg_cron y el voluntario.
-- ---------------------------------------------------------------------------
create or replace function liberar_recogida(
  p_recogida_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_qty     int;
begin
  update recogidas
    set status = 'cancelada'
  where id = p_recogida_id and status = 'pendiente'
  returning aporte_item_id, qty_a_buscar into v_item_id, v_qty;

  if not found then
    return;  -- ya estaba cerrada/cancelada; nada que restaurar
  end if;

  update aporte_items
    set qty_disponible = qty_disponible + v_qty
  where id = v_item_id;
end;
$$;

-- Exponer las RPC al rol público de PostgREST
grant execute on function crear_aporte(jsonb, jsonb, jsonb)            to anon, authenticated;
grant execute on function reservar_item(uuid, int, jsonb)             to anon, authenticated;
grant execute on function obtener_aporte_con_contacto(uuid, uuid)     to anon, authenticated;
grant execute on function completar_recogida(uuid, uuid)              to anon, authenticated;
grant execute on function liberar_recogida(uuid)                      to anon, authenticated;
