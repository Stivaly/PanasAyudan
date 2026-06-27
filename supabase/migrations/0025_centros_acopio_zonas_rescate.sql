-- 0025_centros_acopio_zonas_rescate.sql
-- Centros de acopio curados (datos públicos de solo lectura) y zonas de
-- rescate de referencia. Los aportes (locations) y los voluntarios pueden
-- asociarse opcionalmente a un centro de acopio / zona de rescate.
-- Datos curados: alta/edición solo via service role (sin policy de write).

-- ---------------------------------------------------------------------------
-- PARTE A
-- ---------------------------------------------------------------------------

-- 1. centros_acopio
create table if not exists centros_acopio (
  id              uuid primary key default gen_random_uuid(),
  estado_id       uuid not null references estados(id),
  nombre          text not null,
  direccion       text not null,
  google_place_id text unique,
  lat             float,
  lng             float,
  horario         text,
  contacto        text,
  activo          boolean default true,
  created_at      timestamptz default now()
);

alter table centros_acopio enable row level security;
revoke all on centros_acopio from anon, authenticated;
grant select on centros_acopio to anon, authenticated;

create policy centros_acopio_select_public
  on centros_acopio for select
  to anon, authenticated
  using (true);

-- 2. zonas_rescate
create table if not exists zonas_rescate (
  id              uuid primary key default gen_random_uuid(),
  estado_id       uuid not null references estados(id),
  nombre          text not null,
  descripcion     text,
  google_place_id text unique,
  lat             float,
  lng             float,
  activo          boolean default true,
  created_at      timestamptz default now()
);

alter table zonas_rescate enable row level security;
revoke all on zonas_rescate from anon, authenticated;
grant select on zonas_rescate to anon, authenticated;

create policy zonas_rescate_select_public
  on zonas_rescate for select
  to anon, authenticated
  using (true);

-- 3. locations: referencia opcional a centro de acopio / zona de rescate
alter table locations
  add column if not exists centro_acopio_id uuid references centros_acopio(id);
alter table locations
  add column if not exists zona_rescate_id uuid references zonas_rescate(id);

-- 4. volunteers: un voluntario puede coordinar desde un centro de acopio
--    como punto de referencia (no es el centro en sí, solo ayuda desde ahí).
alter table volunteers
  add column if not exists centro_acopio_id uuid references centros_acopio(id);

-- 5. crear_aporte: acepta centro_acopio_id y zona_rescate_id opcionales en
--    location_data y los propaga al upsert de locations. Misma firma base.
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
-- PARTE B — Semilla de centros de acopio en Venezuela
-- ---------------------------------------------------------------------------

-- Miranda
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Miranda'), 'Sambil Caracas', 'Entrada principal del centro comercial. Anfiteatro Sambil Caracas, Chacao.', 'Todos los dias, 10:00 a.m. - 5:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Fitness Factory / Fundación Cruz Azul USM - Los Palos Grandes', '4ta avenida de Los Palos Grandes, entre 1ra y 2da transversal, Edif. Fitness Factory.', 'Desde el 25 de junio, a partir de las 10:00 a.m.', '+58 412-2897771 | +58 424-2422531', true),
  ((select id from estados where nombre ilike 'Miranda'), 'Instituto de Diseño de Caracas', 'Av. Avila, Quinta Madre Selva No. 7, Urb. La Castellana, Caracas.', 'Por confirmar', '+58 412-6074722 | 0212-7486596', true),
  ((select id from estados where nombre ilike 'Miranda'), 'Academia Merici', 'Calle Central con Calle Las Ursulinas, Urb. Cerro Verde, Caracas.', '25 al 28 de junio, 10:00 a.m. - 4:00 p.m.', '0212-9857486', true),
  ((select id from estados where nombre ilike 'Miranda'), 'Complejo Deportivo Los Salias', 'Calle Elevado San Antonio, San Antonio de Los Altos.', '24 horas durante las próximas 72 horas', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Servicios Médicos DR - Donación de sangre', 'Av. Francisco Salias, El Picacho, San Antonio de Los Altos.', '26 de junio de 2026, desde las 8:00 a.m.', '0414-6616880 | 0212-3731345', true),
  ((select id from estados where nombre ilike 'Miranda'), 'Farmatodo La Matica / UPTAMCA Fisioterapia', 'Carretera Panamericana, cruce con Calle Tamanaco, sector La Matica, Los Teques.', 'Desde las 8:00 a.m.', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Hospital Victorino Santaella - Insumos médicos', 'Av. Bicentenario, al lado de la Estación Ali Primera, Los Teques.', 'Por confirmar', '0212-3217411', true),
  ((select id from estados where nombre ilike 'Miranda'), 'Plaza Francia de Altamira', 'Plaza Francia de Altamira, avenida Francisco de Miranda, Chacao.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Pasatiempos Grill - Carrizal', 'Carrizal, sector Pasatiempos, via San Diego de Los Altos.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Quinta El Bejucal', 'Cuarta avenida de Altamira, entre novena y decima transversal, quinta El Bejucal.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Colegio San Agustín del Marqués', 'Av. Sanz, Sector Convento I, El Marqués, Caracas.', '8:00 a.m. - 6:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Golden Roses Venezuela - Las Mercedes', 'Av. Paseo Enrique Eraso, Torre Tamanaco, Nivel PB, Las Mercedes, Caracas.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Le Clinic - Santa Paula', 'Av. Circunvalación del Sol, sector F, Urb. Santa Paula, Edif. Santa Paula Plaza III, piso 2, oficina 211.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Torre Aerolíneas Estelar - Las Mercedes', 'Calle Londres, Las Mercedes, Caracas.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Ciudad Banesco / Cruz Roja Venezolana', 'Av. Principal de Bello Monte, entre calle Lincoln y Sorbona, Edif. Ciudad Banesco, Colinas de Bello Monte.', 'A partir del viernes 26 de junio.', null, true),
  ((select id from estados where nombre ilike 'Miranda'), 'Capellanía UNIMET', 'Universidad Metropolitana, Capellanía UNIMET, Caracas.', 'Viernes 26, sábado 27 y domingo 28 de junio, 8:00 a.m. - 6:00 p.m.', null, true);

-- Distrito Capital
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Plaza del Rectorado de la UCV', 'Plaza del Rectorado de la UCV, Ciudad Universitaria, parroquia San Pedro.', 'Desde las 9:00 a.m.', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Iglesia La Paz en Montalbán I', 'Iglesia La Paz en Montalban I, Municipio Libertador.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Hospital Universitario de Caracas - Donación de sangre', 'Avenida Minerva y Avenida Interna UCV, Zona Médica, Los Chaguaramos.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Bomberos Av. Lecuna - comida preparada', 'Av. Lecuna con Av. Fuerzas Armadas, Cuartel General de Bomberos, San Agustín del Norte.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Morgue de Bello Monte - comida preparada', 'Av. Neveri, Colinas de Bello Monte, Caracas.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'S.O.S. UCABISTA - Iglesia UCAB', 'Estacionamiento de la Iglesia UCAB, Av. Teherán, Montalbán.', '26 de junio de 2026, a partir de las 8:00 a.m.', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Esfera de Soto - motorizados', 'Esfera de Soto, Caracas.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Tareas Dirigidas Portón Negro - El Junquito', 'Portón Negro, al lado de la Panadería Topo Pan. El Junquito, Km 19, sector El Topo, calle Santa Sofía.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Iglesia San Bernardino de Siena', 'Iglesia San Bernardino de Siena, Parroquia San Bernardino.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Inmobiliaria Farro / Soid Caracas', 'Avenida Lecuna, edificio Sur 2-57, piso 4, oficina 43. Referencia: Iglesia Santa Teresa.', 'Por confirmar', '+58 414-140-73-35 | +58 414-380-63-74', true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'La Florida Instituto Clínico', 'Estacionamiento del Instituto Clínico La Florida, Av. Los Samanes, La Florida.', 'Sábado 27/06/2026, 11:00 a.m. - 3:00 p.m.', '0212-7066111', true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Red de Apoyo Chamos Solidarios - El Recreo', 'Calle Real, El Cortijo de Sarria, Edif. Altagracia, al lado de la bomba, Parroquia El Recreo.', '9:30 a.m. - 7:00 p.m.', '0424-8937298 | 0412-2072629', true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'ISUM - Av. Casanova', 'Av. Casanova, Caracas.', 'Lunes a miércoles, 10:00 a.m. - 3:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Colegio Madre Rafols - La Pastora', 'Colegio Madre Rafols, La Pastora, Caracas.', 'Reciben hasta las 8:00 p.m.', '0424-1536863 | 0412-3399516', true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Grupo Escolar República de Bolivia - La Pastora', 'Avenida Oeste 15, entre Esquina Nazareno y Esquina Santa Isabel, Parroquia La Pastora.', 'Por confirmar', '+58 212-8615488', true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Casa de Anaís - Antimano', 'Calle El Carmen, detrás del Seguro Social de Antimano, Antimano, Caracas.', 'Por confirmar', '0412-6120154', true),
  ((select id from estados where nombre ilike 'Distrito Capital'), 'Puerta CCS - Nuevo Catuche', 'Residencias Nuevo Catuche, al lado de la Iglesia San Judas Tadeo, Caracas.', 'Todo el día.', '0414-9510296', true);

-- Carabobo
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Carabobo'), 'Operación Todos con VZLA - Guacara', 'Ferretería ConstruGuacara, carretera nacional Guacara vía San Joaquín, al lado de la Funeraria Laya.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Operación Todos con VZLA - Juan José Mora', 'Antigua Panadería Mora-Pan, Av. Falcón, diagonal a Multimax, Morón.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Operación Todos con VZLA - Naguanagua', 'Semáforo de la Av. Universidad c/c Av. 190, Naguanagua.', 'Jueves 25 y viernes 26 de junio, 3:00 p.m. - 6:30 p.m.', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Operación Todos con VZLA - San Diego La Esmeralda', 'Frente a la Iglesia La Esmeralda, San Diego.', '4:00 p.m. - 6:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Operación Todos con VZLA - Pueblo de San Diego', 'Frente a la Iglesia Pueblo de San Diego.', '4:00 p.m. - 6:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Operación Todos con VZLA - Los Guayos', 'Elevado La Vivienda, Los Guayos.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Edificio Talislandia - Valencia', 'Avenida Monseñor Adams, El Viñedo, Edificio Talislandia, mezzanina. Frente a La Hilandera 007.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Prevaler - Centro Industrial Henry', 'Av. Henry Ford, C.C. Centro Industrial Henry, Zona Industrial Municipal Norte, Valencia.', 'Hasta las 5:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Prevaler - La Viña', 'Urb. La Viña, Av. 104, Manzana X, casa 695, frente al Rest. Isola, Valencia.', 'Hasta las 5:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Intylact Mayogi - Valencia', 'Urb. El Viñedo, Av. 106, Mayogi, Valencia.', 'Por confirmar', '0424-4561426', true),
  ((select id from estados where nombre ilike 'Carabobo'), 'Escenario Lounge Bar - Los Nísperos', 'Av. Cuatricentenario, C.C. Los Nísperos, tercer piso, Valencia.', '3:30 p.m. - 7:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Carabobo'), 'CCN Puerto Cabello', 'Centro Comercial Sideral, piso 2, calle Plaza con Bermúdez, frente a la Plaza La Bandera, Puerto Cabello.', 'Por confirmar', '+58 412-4650689', true);

-- Lara
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Lara'), 'CMCF - Barquisimeto Zona Norte', 'Av. Intercomunal Barquisimeto a Duaca, Km 11, Sector San Antonio. Al lado de Ferremateriales San Roque.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Fitness Factory West', 'Sede Fitness Factory West, Barquisimeto.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Fitness Factory Cabudare', 'Sede Fitness Factory Cabudare, Cabudare.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Fitness Factory Galpón', 'Galpón, calle Urdaneta con Av. Venezuela, Barquisimeto.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Medical Hnos - Centro Profesional Arca', 'Calle 20, esquina carrera 33, Centro Profesional Arca, Barquisimeto.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Hospitour - Barquisimeto', 'Carrera 25, entre calles 14 y 15, Barquisimeto.', 'Por confirmar', '0424-5541012', true),
  ((select id from estados where nombre ilike 'Lara'), 'Farmacias San Ignacio - Barquisimeto y Cabudare', 'Sedes Oeste, Este, Centro, Norte y Cabudare, estado Lara.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Farma Bien - Barquisimeto', 'Av. Vargas entre carreras 22 y 23, Barquisimeto.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Nevados VE - Barquisimeto', 'Torre Inter, planta baja, Barquisimeto.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Bhoga Fashion Corner', 'Urb. Nueva Segovia, calle 1 entre calles 3 y 4, Barquisimeto.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Colegio San Pedro - Barquisimeto', 'Carrera 18, Barquisimeto 3001, Lara.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Iglesia Adventista Central de Barquisimeto', 'Calle 22, entre carreras 22 y 23, Barquisimeto.', 'Por confirmar', '0412-5452994 | 0412-6786563', true),
  ((select id from estados where nombre ilike 'Lara'), 'Renov - C.C. Paris Barquisimeto', 'C.C. Paris, Barquisimeto.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Tatas Food - Barquisimeto', 'Carrera 15 entre calles 13A y 13B, Barquisimeto.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Lara'), 'Lidotel Barquisimeto', 'Centro Sambil Barquisimeto, Av. Venezuela con Av. Argimiro Bracamonte, Edificio Lidotel.', 'Sábado 27 de junio, desde la 1:00 p.m.', 'angelobertel@gmail.com | +58 414-5680060', true),
  ((select id from estados where nombre ilike 'Lara'), 'CCN Barquisimeto', 'Av. 20 entre calles 39 y 40, Barquisimeto.', 'Por confirmar', '+58 412-5774242 | +58 426-5524022', true),
  ((select id from estados where nombre ilike 'Lara'), 'Iglesia Ministros de Fuego - Quibor', 'Iglesia Ministros de Fuego, Quibor.', 'Sábado 27 de junio, desde las 8:00 a.m.', null, true);

-- Falcón
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Falcón'), 'UNEFM - Complejo Académico Ing. Vicente Durán', 'Complejo Académico Ing. Vicente Durán, Punto Fijo.', 'Jueves 25/06 y viernes 26/06, 9:00 a.m. - 5:00 p.m.; sábado 27/06, 9:00 a.m. - 12:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Falcón'), 'UNEFM - Edificio Rectorado Coro', 'Edificio Rectorado, Coro.', 'Jueves 25/06 y viernes 26/06, 9:00 a.m. - 5:00 p.m.; sábado 27/06, 9:00 a.m. - 12:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Falcón'), 'UNEFM - Sede Tucacas', 'Sede UNEFM, Tucacas.', 'Jueves 25/06 y viernes 26/06, 9:00 a.m. - 5:00 p.m.; sábado 27/06, 9:00 a.m. - 12:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Falcón'), 'Agri Dulce - Tucacas', 'Calle 33 entre carreras 28 y 29, Tucacas.', 'Hasta llenar la pick up', '@agridulce_ca', true),
  ((select id from estados where nombre ilike 'Falcón'), 'Refriparts Vzla - Punto Fijo', 'Av. General Pelayo, esquina calle Maraca, puerta Maraven, Punto Fijo.', 'Lunes 7:30 a.m. - 6:00 p.m.; domingo 7:30 a.m. - 12:00 p.m.', null, true);

-- Yaracuy
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Yaracuy'), 'Fundación CIEPE - Independencia', 'Sede de la Fundación CIEPE, zona industrial, municipio Independencia.', 'Sábado 27/06 y domingo 28/06, 8:00 a.m. - 5:00 p.m.', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Sede Bomberos - San Felipe', 'Av. Cartagena prolongación Calle 32, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Iglesia San Jerónimo de Cocorote', 'Iglesia San Jerónimo de Cocorote, salón parroquial, Cocorote.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Mueblería Full House - San Felipe', '4ta av con calle 12, frente a Roraima, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Colegio Los Ángeles - San Felipe', '3ra av con calles 14 y 15, frente a Tebeteshop, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Hogar Hispano - Yaracuy', 'San Felipe, estado Yaracuy.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Contraloría del Estado Yaracuy', 'Contraloría del Estado, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Librería La Única - San Felipe', 'San Felipe, estado Yaracuy.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Mingos Accessories - San Felipe', 'San Felipe, estado Yaracuy.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Plaza Bolívar de Cocorote', 'Plaza Bolívar de Cocorote, Cocorote.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Av. Cedeño diagonal a E/S San Andrés', 'Av. Cedeño, diagonal a la E/S San Andrés, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Red Vital Makro - San Felipe', 'Red Vital Makro, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Alcaldía de Independencia', 'Alcaldía de Independencia, municipio Independencia.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'PequePelos - San Felipe', 'Calle 8 entre av. 8 y 9, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Ópalos CC Street Mall', 'Ópalos CC Street Mall, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Iglesia Maranatha - Yaracuy', 'Iglesia Maranatha, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Farmabien - dos sucursales', 'Farmabien en sus dos sucursales, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Calle de los Gaiteros - San Felipe', 'La Calle de los Gaiteros, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Yaracuy Tour - Plaza Teófilo Domínguez', 'Yaracuy Tour, Plaza Teófilo Domínguez, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Parroquia Nuestra Señora del Valle', 'Parroquia Nuestra Señora del Valle, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Uney-CEHOTUR', 'Uney-CEHOTUR, San Felipe.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Yaracuy'), 'Centro de Acopio San Felipe - Av. Cedeño', 'Avenida Cedeño, una cuadra hacia arriba por la calle del hospital, San Felipe.', 'Desde las 9:00 a.m. hasta 6:00 p.m.', null, true);

-- Aragua
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Aragua'), 'Centro Comercial La Capilla', 'Avenida 19 de abril, Centro Comercial La Capilla, Piso 1, local 21.', 'Por confirmar', null, true),
  ((select id from estados where nombre ilike 'Aragua'), 'CCN Maracay', 'Edificio Fetraragua, Urb. La Coromoto, calle Colón, Maracay.', 'Por confirmar', '+58 412-7687179 | +58 422-0031189', true),
  ((select id from estados where nombre ilike 'Aragua'), 'CCN Palo Negro', 'Calle Marino con Ricaute, a 100 m de Panadería Esperanza, vía calle ancha del Libertador, Palo Negro.', 'Por confirmar', '+58 412-8482654', true);

-- Nueva Esparta
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Nueva Esparta'), 'Automercados Nova / Estelar - Isla de Margarita', 'Área de farmacia de las sucursales Automercados Nova y Estelar en Isla de Margarita.', 'Por confirmar', '@automercadosnova', true);

-- Portuguesa
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Portuguesa'), 'CCN Biscucuy', 'Calle Negro Primero, entre carreras 5 y 6, sector centro, Biscucuy.', 'Por confirmar', '+58 416-1262218', true),
  ((select id from estados where nombre ilike 'Portuguesa'), 'CCN Guanare', 'Corredor vial El Cambio, a una cuadra del Ambulatorio Noel Barazarte, Guanare.', 'Por confirmar', '+58 416-2417710 | +58 412-2523825', true);

-- Guárico
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Guárico'), 'CCN San Juan de los Morros', 'Av. principal de La Morera, a 50 m de Guaricauchos, local CCN, San Juan de los Morros.', 'Por confirmar', '+58 414-9438957', true);

-- Táchira
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Táchira'), 'Núcleo Táchira de la ULA', 'Núcleo Táchira de la ULA, San Cristóbal.', 'Por confirmar', null, true);

-- Barinas
insert into centros_acopio (estado_id, nombre, direccion, horario, contacto, activo) values
  ((select id from estados where nombre ilike 'Barinas'), 'U.E. Nuestra Señora de Fátima - Barinas', 'Unidad Educativa Nuestra Señora de Fátima, Barinas.', 'Sábado 27/06/2026, 8:30 a.m. - 12:30 p.m.', null, true);

-- GRANTS
grant select on centros_acopio to anon, authenticated;
grant select on zonas_rescate to anon, authenticated;
