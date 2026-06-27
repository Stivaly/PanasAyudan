-- 0006_lugar_manual.sql
-- PanasAyudan — el lugar ya no depende de Google:
--   * google_place_id pasa a opcional (UNIQUE permite múltiples NULL).
--   * se agrega descripcion_libre (cómo describe el lugar quien publica).
--   * crear_aporte inserta con o sin google_place_id.

alter table locations alter column google_place_id drop not null;
alter table locations add column if not exists descripcion_libre text;

create or replace function crear_aporte(
  location_data jsonb,   -- { google_place_id?, place_name, lat, lng, address?, descripcion_libre }
  items_data    jsonb,   -- [ { category_id, descripcion, qty_approx }, ... ]
  contact_data  jsonb    -- { contact_phone?, contact_telegram?, volunteer_id? }
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_place_id    text := nullif(location_data ->> 'google_place_id', '');
  v_desc        text := nullif(location_data ->> 'descripcion_libre', '');
  v_aporte_id   uuid;
  v_phone       text := nullif(contact_data ->> 'contact_phone', '');
  v_telegram    text := nullif(contact_data ->> 'contact_telegram', '');
  v_item        jsonb;
begin
  if v_phone is null and v_telegram is null then
    raise exception 'Debe indicar al menos un contacto (teléfono o telegram).';
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
