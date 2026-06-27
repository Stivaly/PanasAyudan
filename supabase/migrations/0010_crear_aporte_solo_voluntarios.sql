-- Restringe la publicacion de aportes a voluntarios activos.
-- El frontend envia el token en el header volunteer-token mediante supabaseWithToken.

create or replace function crear_aporte(
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
  if items_data is null or jsonb_array_length(items_data) = 0 then
    raise exception 'Debe agregar al menos un item.';
  end if;

  if v_place_id is not null then
    insert into locations (google_place_id, place_name, lat, lng, address, descripcion_libre)
    values (
      v_place_id,
      location_data ->> 'place_name',
      (location_data ->> 'lat')::double precision,
      (location_data ->> 'lng')::double precision,
      location_data ->> 'address',
      v_desc
    )
    on conflict (google_place_id) do update
      set place_name        = excluded.place_name,
          lat               = excluded.lat,
          lng               = excluded.lng,
          address           = excluded.address,
          descripcion_libre = excluded.descripcion_libre
    returning id into v_location_id;
  else
    insert into locations (google_place_id, place_name, lat, lng, address, descripcion_libre)
    values (
      null,
      location_data ->> 'place_name',
      (location_data ->> 'lat')::double precision,
      (location_data ->> 'lng')::double precision,
      location_data ->> 'address',
      v_desc
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
