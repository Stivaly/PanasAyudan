-- Agrega estados venezolanos publicos y obliga a los aportes nuevos a indicar estado.

create table if not exists estados (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  slug text unique not null,
  orden integer unique not null
);

insert into estados (nombre, slug, orden) values
  ('Amazonas', 'amazonas', 1),
  ('Anzoátegui', 'anzoategui', 2),
  ('Apure', 'apure', 3),
  ('Aragua', 'aragua', 4),
  ('Barinas', 'barinas', 5),
  ('Bolívar', 'bolivar', 6),
  ('Carabobo', 'carabobo', 7),
  ('Cojedes', 'cojedes', 8),
  ('Delta Amacuro', 'delta-amacuro', 9),
  ('Distrito Capital', 'distrito-capital', 10),
  ('Falcón', 'falcon', 11),
  ('Guárico', 'guarico', 12),
  ('Lara', 'lara', 13),
  ('Mérida', 'merida', 14),
  ('Miranda', 'miranda', 15),
  ('Monagas', 'monagas', 16),
  ('Nueva Esparta', 'nueva-esparta', 17),
  ('Portuguesa', 'portuguesa', 18),
  ('Sucre', 'sucre', 19),
  ('Táchira', 'tachira', 20),
  ('Trujillo', 'trujillo', 21),
  ('La Guaira', 'la-guaira', 22),
  ('Yaracuy', 'yaracuy', 23),
  ('Zulia', 'zulia', 24),
  ('Dependencias Federales', 'dependencias-federales', 25)
ON CONFLICT (slug) DO UPDATE
SET nombre = excluded.nombre,
    orden = excluded.orden;

alter table locations
  add column if not exists estado_id uuid references estados(id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'locations_estado_id_fkey'
      and conrelid = 'locations'::regclass
  ) then
    alter table locations
      add constraint locations_estado_id_fkey
      foreign key (estado_id) references estados(id);
  end if;
end;
$$;

create index if not exists idx_locations_estado on locations(estado_id);

grant select on estados to anon, authenticated;
grant select on locations to anon, authenticated;

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
  v_estado_id    uuid := nullif(location_data ->> 'estado_id', '')::uuid;
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
  if items_data is null or jsonb_array_length(items_data) = 0 then
    raise exception 'Debe agregar al menos un item.';
  end if;

  if v_place_id is not null then
    insert into locations (google_place_id, place_name, lat, lng, address, descripcion_libre, estado_id)
    values (
      v_place_id,
      location_data ->> 'place_name',
      (location_data ->> 'lat')::double precision,
      (location_data ->> 'lng')::double precision,
      location_data ->> 'address',
      v_desc,
      v_estado_id
    )
    on conflict (google_place_id) do update
      set place_name        = excluded.place_name,
          lat               = excluded.lat,
          lng               = excluded.lng,
          address           = excluded.address,
          descripcion_libre = excluded.descripcion_libre,
          estado_id         = excluded.estado_id
    returning id into v_location_id;
  else
    insert into locations (google_place_id, place_name, lat, lng, address, descripcion_libre, estado_id)
    values (
      null,
      location_data ->> 'place_name',
      (location_data ->> 'lat')::double precision,
      (location_data ->> 'lng')::double precision,
      location_data ->> 'address',
      v_desc,
      v_estado_id
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
