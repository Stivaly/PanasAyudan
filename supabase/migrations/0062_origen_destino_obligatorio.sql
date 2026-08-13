-- 0062_origen_destino_obligatorio.sql
-- Renombrada de 0026 (colisionaba con 0026_registrar_voluntario_centro_acopio.sql,
-- ambas usaban el numero 0026). Contenido sin cambios; ya estaba aplicada en
-- produccion bajo el numero viejo, esto solo corrige el archivo local para que
-- el historial de migraciones del CLI de Supabase pueda distinguirlas.
--
-- Origen y destino obligatorios:
--   * Un aporte (location) debe estar asociado a un centro de acopio O a una
--     zona de rescate (origen del insumo).
--   * Una recogida debe declarar a dónde se lleva el insumo: un centro de
--     acopio O una zona de rescate (destino).
-- Los registros existentes pueden no cumplir el constraint de origen, por eso
-- NO se aplica NOT NULL todavía; el CHECK exige "al menos uno" a nivel de fila
-- y solo aplica a filas nuevas/actualizadas.

-- ---------------------------------------------------------------------------
-- 1. locations: constraint de origen (centro de acopio o zona de rescate).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'origen_requerido'
  ) then
    alter table locations add constraint origen_requerido
      check (centro_acopio_id is not null or zona_rescate_id is not null)
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. recogidas: columnas de destino + constraint de destino.
-- ---------------------------------------------------------------------------
alter table recogidas
  add column if not exists destino_centro_acopio_id uuid references centros_acopio(id);
alter table recogidas
  add column if not exists destino_zona_rescate_id uuid references zonas_rescate(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'destino_requerido'
  ) then
    alter table recogidas add constraint destino_requerido
      check (destino_centro_acopio_id is not null or destino_zona_rescate_id is not null)
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. reservar_item: misma firma de 0020 (uuid, int, jsonb, text). El jsonb
--    recogida_data ahora incluye destino_centro_acopio_id y
--    destino_zona_rescate_id al final. Conserva el chequeo de cédula
--    bloqueada introducido en 0023.
-- ---------------------------------------------------------------------------
drop function if exists reservar_item(uuid, int, jsonb, text);

create function reservar_item(
  p_aporte_item_id  uuid,
  p_qty             int,
  recogida_data     jsonb,  -- { nombre, apellido, cedula, placa_vehiculo, volunteer_id, destino_centro_acopio_id, destino_zona_rescate_id }
  p_recogedor_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disponible    int;
  v_recogida_id   uuid;
  v_destino_centro uuid := nullif(recogida_data ->> 'destino_centro_acopio_id', '')::uuid;
  v_destino_zona   uuid := nullif(recogida_data ->> 'destino_zona_rescate_id', '')::uuid;
begin
  if exists (
    select 1 from cedulas_bloqueadas
    where cedula = recogida_data ->> 'cedula'
  ) then
    raise exception 'cedula_bloqueada';
  end if;

  if v_destino_centro is null and v_destino_zona is null then
    raise exception 'destino_requerido';
  end if;

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
    placa_vehiculo, qty_a_buscar, recogedor_token,
    destino_centro_acopio_id, destino_zona_rescate_id
  )
  values (
    p_aporte_item_id,
    nullif(recogida_data ->> 'volunteer_id', '')::uuid,
    recogida_data ->> 'nombre',
    recogida_data ->> 'apellido',
    recogida_data ->> 'cedula',
    nullif(recogida_data ->> 'placa_vehiculo', ''),
    p_qty,
    nullif(p_recogedor_token, ''),
    v_destino_centro,
    v_destino_zona
  )
  returning id into v_recogida_id;

  return v_recogida_id;
end;
$$;

grant execute on function reservar_item(uuid, int, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. crear_aporte: exige que location_data tenga origen (centro de acopio o
--    zona de rescate). Cuerpo idéntico a 0025 + validación de origen.
-- ---------------------------------------------------------------------------
drop function if exists crear_aporte(jsonb, jsonb, jsonb);

create function crear_aporte(
  location_data jsonb,
  items_data    jsonb,
  contact_data  jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id  uuid;
  v_place_id     text := nullif(location_data ->> 'google_place_id', '');
  v_desc         text := nullif(location_data ->> 'descripcion_libre', '');
  v_estado_id    uuid := nullif(location_data ->> 'estado_id', '')::uuid;
  v_centro_id    uuid := nullif(location_data ->> 'centro_acopio_id', '')::uuid;
  v_zona_id      uuid := nullif(location_data ->> 'zona_rescate_id', '')::uuid;
  v_aporte_id    uuid;
  v_phone        text := nullif(contact_data ->> 'contact_phone', '');
  v_telegram     text := nullif(contact_data ->> 'contact_telegram', '');
  v_volunteer_id uuid;
  v_item         jsonb;
begin
  select id into v_volunteer_id
  from volunteers
  where token = current_volunteer_token()
    and activo = true;

  if v_volunteer_id is null then
    raise exception 'Debes registrarte como voluntario antes de publicar insumos.';
  end if;

  if v_phone is null and v_telegram is null then
    raise exception 'Debe indicar al menos un contacto (telefono o telegram).';
  end if;
  if v_desc is null then
    raise exception 'Debe describir el lugar.';
  end if;
  if v_estado_id is null then
    raise exception 'Debe indicar el estado del aporte.';
  end if;
  if not exists (select 1 from estados where id = v_estado_id) then
    raise exception 'El estado seleccionado no existe.';
  end if;
  if v_centro_id is null and v_zona_id is null then
    raise exception 'origen_requerido';
  end if;
  if items_data is null or jsonb_array_length(items_data) = 0 then
    raise exception 'Debe agregar al menos un item.';
  end if;

  if v_place_id is not null then
    insert into locations (google_place_id, place_name, lat, lng, address, descripcion_libre, estado_id, centro_acopio_id, zona_rescate_id)
    values (
      v_place_id,
      location_data ->> 'place_name',
      (location_data ->> 'lat')::double precision,
      (location_data ->> 'lng')::double precision,
      location_data ->> 'address',
      v_desc,
      v_estado_id,
      v_centro_id,
      v_zona_id
    )
    on conflict (google_place_id) do update
      set place_name        = excluded.place_name,
          lat               = excluded.lat,
          lng               = excluded.lng,
          address           = excluded.address,
          descripcion_libre = excluded.descripcion_libre,
          estado_id         = excluded.estado_id,
          centro_acopio_id  = excluded.centro_acopio_id,
          zona_rescate_id   = excluded.zona_rescate_id
    returning id into v_location_id;
  else
    insert into locations (google_place_id, place_name, lat, lng, address, descripcion_libre, estado_id, centro_acopio_id, zona_rescate_id)
    values (
      null,
      location_data ->> 'place_name',
      (location_data ->> 'lat')::double precision,
      (location_data ->> 'lng')::double precision,
      location_data ->> 'address',
      v_desc,
      v_estado_id,
      v_centro_id,
      v_zona_id
    )
    returning id into v_location_id;
  end if;

  insert into aportes (location_id, volunteer_id, contact_phone, contact_telegram)
  values (
    v_location_id,
    v_volunteer_id,
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

grant execute on function crear_aporte(jsonb, jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. listar_recogidas_recogedor: expone el destino (centro de acopio o zona
--    de rescate) para mostrarlo en /mis-recogidas. Cuerpo idéntico a 0024 +
--    los campos 'destino_centro' y 'destino_zona'.
-- ---------------------------------------------------------------------------
create or replace function listar_recogidas_recogedor(
  p_recogedor_token text
)
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_agg(fila), '[]'::json)
  from (
    select json_build_object(
      'id', r.id,
      'status', r.status,
      'qty_a_buscar', r.qty_a_buscar,
      'confirmada_at', r.confirmada_at,
      'confirmation_deadline', r.confirmation_deadline,
      'reserved_until', r.reserved_until,
      'recogedor_token', r.recogedor_token,
      'whatsapp', v.telefono,
      'destino_centro', dca.nombre,
      'destino_zona', dzr.nombre,
      'aporte_item', json_build_object(
        'descripcion', ai.descripcion,
        'category_id', ai.category_id,
        'qty_disponible', ai.qty_disponible,
        'aporte', json_build_object(
          'location_id', a.location_id,
          'location', json_build_object(
            'place_name', l.place_name,
            'descripcion_libre', l.descripcion_libre,
            'estado', e.nombre
          )
        )
      )
    ) as fila
    from recogidas r
    join aporte_items ai on ai.id = r.aporte_item_id
    join aportes a on a.id = ai.aporte_id
    join locations l on l.id = a.location_id
    left join estados e on e.id = l.estado_id
    left join volunteers v on v.id = a.volunteer_id
    left join centros_acopio dca on dca.id = r.destino_centro_acopio_id
    left join zonas_rescate dzr on dzr.id = r.destino_zona_rescate_id
    where r.recogedor_token is not null
      and r.recogedor_token = p_recogedor_token
    order by r.created_at desc
  ) sub;
$$;

grant execute on function listar_recogidas_recogedor(text) to anon, authenticated;
