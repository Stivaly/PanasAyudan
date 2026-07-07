-- 0038_municipios_gps.sql
-- Issue #20 — Voluntario: operación por GPS/municipio, adyacencias y
-- verificación cada 24h.
--
-- La otra mitad del issue (capacidad de vehículo: tiene_vehiculo +
-- capacidad_peso_kg + capacidad_volumen_m3, y el filtro requiere_vehiculo) YA
-- vive en 0032. Aquí se agrega SOLO el modelo de operación por ubicación de
-- definicion.md:
--   * verificación de la ubicación del voluntario, válida 24h;
--   * municipios adyacentes (una solicitud de un municipio vecino es "en rango");
--   * las solicitudes fuera de rango se VEN pero no se pueden tomar.
--
-- INVARIANTE QUE GOBIERNA TODO EL DISEÑO: la ubicación del voluntario JAMÁS se
-- guarda ni se comparte. El servidor resuelve el punto a un municipio y DESCARTA
-- las coordenadas. Ninguna tabla de este archivo tiene lat/lng del voluntario.
--
-- PostGIS: en 0031 se resolvió distancia con Haversine porque PostGIS no estaba
-- habilitado. Para contención punto-en-polígono (ST_Contains) y adyacencia
-- (ST_Touches) sí hace falta. En Supabase PostGIS vive en el schema `extensions`;
-- por eso las RPC de este archivo usan `set search_path = public, extensions`
-- (ensanchamiento deliberado del invariante habitual `set search_path = public`,
-- necesario para que el tipo geometry y las funciones ST_* resuelvan).
--
-- SEED DE GEOMETRÍAS: los ~335 municipios (límites ADM2 de Venezuela) NO se
-- escriben a mano. Se generan desde el GeoJSON de HDX/OCHA con el procedimiento
-- documentado en supabase/scripts/generar_seed_municipios.md, que produce un
-- INSERT masivo y llama a recalcular_adyacencias_municipios() al final. Esta
-- migración es SEGURA de aplicar ANTES de cargar el seed: con `municipios`
-- vacío, verificar_ubicacion_voluntario responde 'fuera_de_venezuela',
-- listar_solicitudes_disponibles devuelve todo con en_rango=false y nada rompe.

create extension if not exists postgis with schema extensions;

set search_path = public, extensions;

-- ===========================================================================
-- 1. Tablas.
-- ===========================================================================

-- Municipios (ADM2). geom en SRID 4326 (lat/lng WGS84). estado_id nullable: el
-- mapeo ADM1->estados lo hace el script de seed y puede quedar sin resolver.
create table if not exists municipios (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  estado_id uuid references estados(id),
  geom      geometry(MultiPolygon, 4326) not null
);

create index if not exists idx_municipios_geom   on municipios using gist (geom);
create index if not exists idx_municipios_estado on municipios(estado_id);

-- Adyacencia precalculada (simétrica: se insertan ambos sentidos). Se recomputa
-- con recalcular_adyacencias_municipios() cada vez que cambia el seed.
create table if not exists municipios_adyacentes (
  municipio_id uuid not null references municipios(id) on delete cascade,
  adyacente_id uuid not null references municipios(id) on delete cascade,
  primary key (municipio_id, adyacente_id)
);

-- Zona aprobada del voluntario tras verificar su GPS. SIN lat/lng: solo el
-- municipio resuelto (y sus adyacentes) + la expiración de 24h.
create table if not exists voluntario_zonas (
  id           uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references volunteers(id) on delete cascade,
  municipio_id uuid not null references municipios(id) on delete cascade,
  aprobado_at  timestamptz not null default now(),
  expira_at    timestamptz not null default (now() + interval '24 hours'),
  unique (volunteer_id, municipio_id)
);

create index if not exists idx_voluntario_zonas_vol on voluntario_zonas(volunteer_id);

-- ===========================================================================
-- 2. RLS.
-- ===========================================================================
-- municipios y municipios_adyacentes: datos de referencia públicos (geometría
-- administrativa, nada sensible). voluntario_zonas: sin policy de SELECT; solo
-- las RPC SECURITY DEFINER de abajo la leen/escriben (no expone qué voluntario
-- opera dónde).
alter table municipios            enable row level security;
alter table municipios_adyacentes enable row level security;
alter table voluntario_zonas      enable row level security;

revoke all on municipios            from anon, authenticated;
revoke all on municipios_adyacentes from anon, authenticated;
revoke all on voluntario_zonas      from anon, authenticated;

grant select on municipios            to anon, authenticated;
grant select on municipios_adyacentes to anon, authenticated;

create policy municipios_select_public
  on municipios for select to anon, authenticated using (true);

create policy municipios_adyacentes_select_public
  on municipios_adyacentes for select to anon, authenticated using (true);

-- ===========================================================================
-- 3. Recalcular adyacencias (ST_Touches). Idempotente; no-op con seed vacío.
--    Lo llama el script de seed tras cargar las geometrías.
-- ===========================================================================
create or replace function recalcular_adyacencias_municipios()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from municipios_adyacentes;
  insert into municipios_adyacentes (municipio_id, adyacente_id)
  select a.id, b.id
  from municipios a
  join municipios b on a.id <> b.id and st_touches(a.geom, b.geom);
end;
$$;

grant execute on function recalcular_adyacencias_municipios() to authenticated;

-- ===========================================================================
-- 4. RPC verificar_ubicacion_voluntario.
--    Resuelve el municipio que CONTIENE el punto, reemplaza las zonas previas
--    del voluntario por ese municipio + sus adyacentes (todos con expiración
--    de 24h) y devuelve {municipio, adyacentes, expira_at}. Las coordenadas
--    quedan en una variable local y NUNCA se persisten. Si el punto cae en el
--    límite entre dos municipios, el ST_Contains + las adyacencias ya cubren
--    ambos lados.
-- ===========================================================================
create or replace function verificar_ubicacion_voluntario(
  p_token uuid,
  p_lat   float,
  p_lng   float
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_vol_id           uuid;
  v_municipio_id     uuid;
  v_municipio_nombre text;
  v_punto            geometry;
  v_expira           timestamptz;
begin
  select id into v_vol_id from volunteers where token = p_token and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'coordenadas_invalidas';
  end if;

  -- Punto local; se descarta al terminar la función (nunca se guarda).
  v_punto := st_setsrid(st_makepoint(p_lng, p_lat), 4326);

  select m.id, m.nombre into v_municipio_id, v_municipio_nombre
  from municipios m
  where st_contains(m.geom, v_punto)
  limit 1;

  if v_municipio_id is null then
    raise exception 'fuera_de_venezuela';
  end if;

  v_expira := now() + interval '24 hours';

  -- Reemplazo total de las zonas previas del voluntario.
  delete from voluntario_zonas where volunteer_id = v_vol_id;

  insert into voluntario_zonas (volunteer_id, municipio_id, expira_at)
  select v_vol_id, mm.mid, v_expira
  from (
    select v_municipio_id as mid
    union
    select ma.adyacente_id from municipios_adyacentes ma where ma.municipio_id = v_municipio_id
  ) mm;

  return json_build_object(
    'municipio',    v_municipio_nombre,
    'municipio_id', v_municipio_id,
    'expira_at',    v_expira,
    'adyacentes', coalesce((
      select json_agg(m.nombre order by m.nombre)
      from municipios_adyacentes ma
      join municipios m on m.id = ma.adyacente_id
      where ma.municipio_id = v_municipio_id
    ), '[]'::json)
  );
end;
$$;

grant execute on function verificar_ubicacion_voluntario(uuid, float, float) to anon, authenticated;

-- ===========================================================================
-- 5. Municipio del nodo (centros_acopio).
-- ===========================================================================
alter table centros_acopio add column if not exists municipio_id uuid references municipios(id);

-- Backfill por contención sobre lat/lng ya sembrados (no-op si municipios vacío).
update centros_acopio c
set municipio_id = m.id
from municipios m
where c.municipio_id is null
  and c.lat is not null and c.lng is not null
  and st_contains(m.geom, st_setsrid(st_makepoint(c.lng, c.lat), 4326));

-- verificar_nodo (0031) EXTENDIDA: al verificar el GPS del nodo, además de
-- activarlo, se le asigna su municipio_id por contención. Mismo cuerpo que 0031
-- + el UPDATE de municipio_id y el search_path ensanchado para ST_*.
create or replace function verificar_nodo(
  p_node_id     uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_token_admin uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_vol_id        uuid;
  v_admin_row     uuid;
  v_node_lat      double precision;
  v_node_lng      double precision;
  v_dist          double precision;
  v_ya_verificado boolean;
begin
  select id into v_vol_id
  from volunteers
  where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  select id into v_admin_row
  from node_admins
  where node_id = p_node_id and volunteer_id = v_vol_id;
  if v_admin_row is null then
    raise exception 'no_autorizado';
  end if;

  select lat, lng into v_node_lat, v_node_lng
  from centros_acopio where id = p_node_id;
  if v_node_lat is null or v_node_lng is null then
    raise exception 'nodo_sin_coordenadas';
  end if;

  v_dist := distancia_metros(p_lat, p_lng, v_node_lat, v_node_lng);

  if v_dist > 200 then
    return false;
  end if;

  select exists (
    select 1 from node_admins
    where node_id = p_node_id and verificado = true
  ) into v_ya_verificado;

  update node_admins
    set verificado = true, verificado_at = now()
  where id = v_admin_row;

  if not v_ya_verificado then
    update centros_acopio
      set status = 'activo', activo = true, verificado_at = now()
    where id = p_node_id and status = 'inactivo';
  end if;

  -- Asignar el municipio del nodo por contención (no-op si no hay match).
  update centros_acopio
    set municipio_id = m.id
  from municipios m
  where centros_acopio.id = p_node_id
    and st_contains(m.geom, st_setsrid(st_makepoint(v_node_lng, v_node_lat), 4326));

  return true;
end;
$$;

grant execute on function verificar_nodo(uuid, double precision, double precision, uuid) to anon, authenticated;

-- ===========================================================================
-- 6. responder_solicitud_voluntario: validación de capacidad por magnitud.
--    Se EXTIENDE (0032) para que, cuando la solicitud requiere vehículo, la
--    capacidad declarada del voluntario alcance el techo de la magnitud que se
--    compromete (magnitud_capacidad_referencia). El chequeo booleano de
--    tiene_vehiculo se mantiene igual. Misma firma que 0032.
-- ===========================================================================
create or replace function responder_solicitud_voluntario(
  p_solicitud_id    uuid,
  p_magnitud        text,
  p_tiempo_estimado int,
  p_token_voluntario uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id        uuid;
  v_tiene_veh     boolean;
  v_cap_peso      numeric;
  v_cap_vol       numeric;
  v_sol_status    text;
  v_requiere_veh  boolean;
  v_techo_peso    numeric;
  v_techo_vol     numeric;
  v_compromiso_id uuid;
begin
  select id, tiene_vehiculo, capacidad_peso_kg, capacidad_volumen_m3
    into v_vol_id, v_tiene_veh, v_cap_peso, v_cap_vol
  from volunteers where token = p_token_voluntario and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_tiempo_estimado is null or p_tiempo_estimado <= 0 then
    raise exception 'El tiempo estimado debe ser mayor a cero minutos.';
  end if;
  if p_magnitud is null or magnitud_orden(p_magnitud) = 0 then
    raise exception 'La magnitud comprometida no es válida.';
  end if;

  select status, requiere_vehiculo into v_sol_status, v_requiere_veh
  from solicitudes where id = p_solicitud_id;
  if v_sol_status is null then
    raise exception 'solicitud_inexistente';
  end if;
  if v_sol_status not in ('abierta','parcial','inventario_asegurado') then
    raise exception 'solicitud_no_disponible: Esta solicitud ya no admite respuestas de voluntarios.';
  end if;

  if v_requiere_veh and not coalesce(v_tiene_veh, false) then
    raise exception 'requiere_vehiculo: Esta solicitud requiere un voluntario con vehículo; tu perfil no tiene vehículo registrado.';
  end if;

  -- Capacidad suficiente para la magnitud comprometida (solo si requiere vehículo).
  if v_requiere_veh then
    select techo_peso_kg, techo_volumen_m3 into v_techo_peso, v_techo_vol
    from magnitud_capacidad_referencia where magnitud = p_magnitud;
    if (v_techo_peso is not null and (v_cap_peso is null or v_cap_peso < v_techo_peso))
       or (v_techo_vol is not null and (v_cap_vol is null or v_cap_vol < v_techo_vol)) then
      raise exception 'capacidad_insuficiente: La capacidad de tu vehículo no alcanza para la magnitud que intentas comprometer.';
    end if;
  end if;

  insert into compromisos_voluntario
    (solicitud_id, volunteer_id, magnitud_comprometida, tiempo_estimado_minutos, status)
  values
    (p_solicitud_id, v_vol_id, p_magnitud, p_tiempo_estimado, 'pendiente')
  returning id into v_compromiso_id;

  perform recalcular_status_solicitud(p_solicitud_id);

  return v_compromiso_id;
end;
$$;

grant execute on function responder_solicitud_voluntario(uuid, text, int, uuid) to anon, authenticated;

-- ===========================================================================
-- 7. listar_solicitudes_disponibles REDEFINIDA.
--    Cambia la forma de retorno de array a objeto:
--      { requiere_verificacion: bool, solicitudes: [ {..., en_rango} ] }
--    - en_rango = el municipio del nodo origen está en las zonas VIGENTES del
--      voluntario. Las fuera de rango NO se ocultan (definicion.md): se
--      devuelven con en_rango=false.
--    - requiere_verificacion = true si el voluntario no tiene ninguna zona
--      vigente (nunca verificó o venció el plazo de 24h); en ese caso todas van
--      con en_rango=false.
--    Se conservan los filtros de 0032 (vehículo + sobrante > 0 + status vivo).
-- ===========================================================================
create or replace function listar_solicitudes_disponibles(p_token_voluntario uuid)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_vol_id      uuid;
  v_tiene_veh   boolean;
  v_tiene_zona  boolean;
  v_solicitudes json;
begin
  select id, tiene_vehiculo into v_vol_id, v_tiene_veh
  from volunteers where token = p_token_voluntario and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  select exists (
    select 1 from voluntario_zonas vz
    where vz.volunteer_id = v_vol_id and vz.expira_at > now()
  ) into v_tiene_zona;

  select coalesce(json_agg(to_json(t) order by t.created_at desc), '[]'::json)
  into v_solicitudes
  from (
    select
      s.id,
      s.node_id_origen,
      ca.nombre as nodo_nombre,
      s.category_id,
      c.name    as category_name,
      s.subcategoria,
      s.magnitud,
      s.requiere_vehiculo,
      s.status,
      greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) as sobrante,
      s.created_at,
      exists (
        select 1 from voluntario_zonas vz
        where vz.volunteer_id = v_vol_id
          and vz.expira_at > now()
          and vz.municipio_id = ca.municipio_id
      ) as en_rango
    from solicitudes s
    join categories c      on c.id = s.category_id
    join centros_acopio ca on ca.id = s.node_id_origen
    where s.status in ('abierta','parcial','inventario_asegurado')
      and (s.requiere_vehiculo = false or coalesce(v_tiene_veh, false) = true)
      and greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) > 0
  ) t;

  return json_build_object(
    'requiere_verificacion', not v_tiene_zona,
    'solicitudes', v_solicitudes
  );
end;
$$;

grant execute on function listar_solicitudes_disponibles(uuid) to anon, authenticated;

-- ===========================================================================
-- 8. Recompute inicial de adyacencias (no-op si el seed aún no se cargó).
-- ===========================================================================
select recalcular_adyacencias_municipios();
