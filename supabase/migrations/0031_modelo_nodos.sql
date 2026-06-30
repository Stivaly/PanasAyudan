-- 0031_modelo_nodos.sql
-- Issue #18 — Modelo de nodos: tipos, verificación GPS y estados.
--
-- DECISIÓN ARQUITECTÓNICA: se EXTIENDE centros_acopio en vez de crear una tabla
-- `nodes` nueva. centros_acopio (0025) ya es el "lugar de acopio" del sistema y
-- está referenciado desde locations (centro_acopio_id), recogidas
-- (destino_centro_acopio_id) y volunteers (centro_acopio_id). Crear otra tabla
-- duplicaría el concepto y rompería en silencio crear_aporte / reservar_item, que
-- siguen apuntando a centros_acopio.id. zonas_rescate NO se toca: es una zona de
-- rescate, no un nodo de acopio/entrega (fuera del alcance del issue).
--
-- ESTRATEGIA status vs. banderas (decidida y consistente en todo el archivo):
--   * La columna real `status` solo distingue el CICLO DE VIDA:
--       inactivo -> activo -> cerrado  (más 'pausado' permitido por el CHECK,
--       pero NO lo escribimos: ver abajo).
--   * pausado_recepcion / pausado_entrega son banderas GRANULARES e
--     independientes del ciclo de vida. pausar_nodo NUNCA cambia `status`.
--   * El estado 'pausado' es DERIVADO en lectura: si cualquiera de las dos
--     banderas está en true, la UI muestra el nodo como "pausado / No operativo"
--     aunque la columna interna siga en 'activo'. No metemos un quinto estado
--     derivado dentro de la columna real (ver resumen del issue).
--
-- La columna legacy `activo` (0025) se conserva como ESPEJO de la visibilidad
-- pública (activo = status in ('activo','pausado')) para no romper las consultas
-- existentes que filtran .eq("activo", true). Las RPC la mantienen sincronizada.

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas sobre centros_acopio (el nodo).
--    google_place_id, lat, lng, nombre, direccion, estado_id, activo YA existen.
-- ---------------------------------------------------------------------------
alter table centros_acopio
  add column if not exists tipo text not null default 'acopio'
    check (tipo in ('acopio','entrega','mixto')),
  add column if not exists status text not null default 'activo'
    check (status in ('inactivo','activo','pausado','cerrado')),
  add column if not exists verificado_at timestamptz,
  add column if not exists pausado_recepcion boolean not null default false,
  add column if not exists pausado_entrega   boolean not null default false;

-- Las ~150 filas YA sembradas en 0025 son datos curados manualmente por el
-- equipo (no por un admin que verificó GPS). Se tratan como ya activas y
-- verificadas para no romper lo que ya está en producción: el DEFAULT del ALTER
-- las dejó en status='activo'; aquí les fijamos verificado_at. Los nodos NUEVOS
-- creados por crear_nodo sí pasan por el flujo inactivo -> verificado.
update centros_acopio set verificado_at = now() where verificado_at is null;

-- ---------------------------------------------------------------------------
-- 2. node_admins: qué volunteer (role='admin') administra qué nodo.
--    volunteers.role='admin' por sí solo NO dice de qué nodo; eso vive aquí.
-- ---------------------------------------------------------------------------
create table if not exists node_admins (
  id            uuid primary key default gen_random_uuid(),
  node_id       uuid not null references centros_acopio(id) on delete cascade,
  volunteer_id  uuid not null references volunteers(id) on delete cascade,
  verificado    boolean not null default false,
  verificado_at timestamptz,
  created_at    timestamptz default now(),
  unique (node_id, volunteer_id)
);

alter table node_admins enable row level security;
revoke all on node_admins from anon, authenticated;
-- Público solo ve (node_id, verificado): nunca volunteer_id ni verificado_at de
-- un admin a terceros. El admin lee su propia membresía completa por la RPC
-- listar_nodos_admin (SECURITY DEFINER), siguiendo el patrón de la tabla
-- aportes (contacto oculto a nivel de columna, revelado por RPC).
grant select (node_id, verificado) on node_admins to anon, authenticated;

create policy node_admins_select_public
  on node_admins for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 3. node_collaborators: colaboradores de un nodo, con label 'Colaborador N'.
-- ---------------------------------------------------------------------------
create table if not exists node_collaborators (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null references centros_acopio(id) on delete cascade,
  volunteer_id uuid not null references volunteers(id) on delete cascade,
  label        text not null,
  created_at   timestamptz default now(),
  unique (node_id, volunteer_id)
);

alter table node_collaborators enable row level security;
revoke all on node_collaborators from anon, authenticated;
-- Público solo ve (node_id, label): nunca volunteer_id ni contacto del colaborador.
grant select (node_id, label) on node_collaborators to anon, authenticated;

create policy node_collaborators_select_public
  on node_collaborators for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4. Migración de datos de #17: pasar el anclaje volunteers.centro_acopio_id a
--    las tablas join, para no mantener dos mecanismos paralelos.
-- ---------------------------------------------------------------------------
insert into node_admins (node_id, volunteer_id, verificado)
select v.centro_acopio_id, v.id, false
from volunteers v
where v.role = 'admin' and v.centro_acopio_id is not null
on conflict (node_id, volunteer_id) do nothing;

insert into node_collaborators (node_id, volunteer_id, label)
select v.centro_acopio_id, v.id, coalesce(v.nombre, 'Colaborador')
from volunteers v
where v.role = 'colaborador' and v.centro_acopio_id is not null
on conflict (node_id, volunteer_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Helpers.
-- ---------------------------------------------------------------------------

-- Distancia en metros entre dos coordenadas (Haversine en SQL puro; PostGIS no
-- está instalado en este proyecto, solo pgcrypto y pg_cron).
create or replace function distancia_metros(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ¿El token actual pertenece a un admin o colaborador de este nodo? SECURITY
-- DEFINER para que la policy de centros_acopio pueda consultarlo sin que anon
-- necesite SELECT sobre volunteer_id en las tablas join.
create or replace function es_miembro_nodo(p_node_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from node_admins na
    join volunteers v on v.id = na.volunteer_id
    where na.node_id = p_node_id
      and v.token = current_volunteer_token()
      and v.activo = true
  ) or exists (
    select 1 from node_collaborators nc
    join volunteers v on v.id = nc.volunteer_id
    where nc.node_id = p_node_id
      and v.token = current_volunteer_token()
      and v.activo = true
  );
$$;

grant execute on function distancia_metros(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function es_miembro_nodo(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS de centros_acopio: el público NUNCA ve un nodo 'inactivo' ni 'cerrado'.
--    Un admin/colaborador del nodo sí lo ve en cualquier status (su propio nodo).
-- ---------------------------------------------------------------------------
drop policy if exists centros_acopio_select_public on centros_acopio;

create policy centros_acopio_select_public
  on centros_acopio for select
  to anon, authenticated
  using (
    status in ('activo','pausado')
    or es_miembro_nodo(id)
  );

-- ---------------------------------------------------------------------------
-- 7. RPC crear_nodo: un admin/superadmin crea un nodo en estado inactivo.
-- ---------------------------------------------------------------------------
create or replace function crear_nodo(p_datos jsonb, p_token_admin uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id    uuid;
  v_role      text;
  v_node_id   uuid;
  v_tipo      text := coalesce(nullif(p_datos ->> 'tipo', ''), 'acopio');
  v_estado_id uuid := nullif(p_datos ->> 'estado_id', '')::uuid;
begin
  select id, role into v_vol_id, v_role
  from volunteers
  where token = p_token_admin and activo = true;

  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;
  if v_role not in ('admin', 'superadmin') then
    raise exception 'no_autorizado';
  end if;

  if coalesce(trim(p_datos ->> 'nombre'), '') = '' then
    raise exception 'El nombre del nodo es obligatorio.';
  end if;
  if coalesce(trim(p_datos ->> 'direccion'), '') = '' then
    raise exception 'La dirección del nodo es obligatoria.';
  end if;
  if v_estado_id is null or not exists (select 1 from estados where id = v_estado_id) then
    raise exception 'El estado del nodo no es válido.';
  end if;
  if v_tipo not in ('acopio', 'entrega', 'mixto') then
    raise exception 'tipo_invalido';
  end if;

  insert into centros_acopio (
    estado_id, nombre, direccion, google_place_id, lat, lng,
    horario, contacto, tipo, status, activo, verificado_at
  )
  values (
    v_estado_id,
    trim(p_datos ->> 'nombre'),
    trim(p_datos ->> 'direccion'),
    nullif(p_datos ->> 'google_place_id', ''),
    nullif(p_datos ->> 'lat', '')::double precision,
    nullif(p_datos ->> 'lng', '')::double precision,
    nullif(p_datos ->> 'horario', ''),
    nullif(p_datos ->> 'contacto', ''),
    v_tipo,
    'inactivo',   -- nodo nuevo: invisible hasta verificar GPS
    false,        -- espejo legacy de visibilidad pública
    null
  )
  returning id into v_node_id;

  insert into node_admins (node_id, volunteer_id, verificado)
  values (v_node_id, v_vol_id, false);

  return v_node_id;
end;
$$;

grant execute on function crear_nodo(jsonb, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC verificar_nodo: el admin del nodo confirma su GPS (tolerancia 200 m).
-- ---------------------------------------------------------------------------
create or replace function verificar_nodo(
  p_node_id     uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_token_admin uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
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

  -- Debe ser admin DE ESE nodo, no cualquier admin del sistema.
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

  -- Fuera de tolerancia: no se toca nada (ni status ni verificado_at).
  if v_dist > 200 then
    return false;
  end if;

  -- ¿Ya había algún admin verificado para este nodo (antes de este update)?
  select exists (
    select 1 from node_admins
    where node_id = p_node_id and verificado = true
  ) into v_ya_verificado;

  update node_admins
    set verificado = true, verificado_at = now()
  where id = v_admin_row;

  -- Primer admin en verificar => el nodo pasa de inactivo a activo. Si ya había
  -- otro admin verificado, el nodo ya estaba activo y el status no cambia.
  if not v_ya_verificado then
    update centros_acopio
      set status = 'activo', activo = true, verificado_at = now()
    where id = p_node_id and status = 'inactivo';
  end if;

  return true;
end;
$$;

grant execute on function verificar_nodo(uuid, double precision, double precision, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. RPC pausar_nodo: gestión interna (un admin sin verificar también puede).
--    Solo toca las banderas granulares; NO toca status (ver estrategia arriba).
--
--    Las pausas son ACUMULATIVAS: 'recepcion' y 'entrega' encienden su bandera
--    sin tocar la otra, de modo que un nodo mixto puede quedar con una mitad
--    operativa y la otra no.
--
--    LIMITACIÓN CONOCIDA: 'reactivar' siempre limpia AMBAS banderas; no existe
--    reactivación parcial (p. ej. reabrir solo entrega dejando recepción
--    pausada). Para volver a un estado de pausa parcial hay que reactivar y
--    pausar de nuevo la mitad deseada. Si se requiere reactivación granular,
--    abrir un issue futuro y extender p_tipo_pausa (p. ej. reactivar_recepcion
--    / reactivar_entrega) — se deja fuera del alcance del #18 a propósito, sin
--    cambiar la firma actual.
-- ---------------------------------------------------------------------------
create or replace function pausar_nodo(
  p_node_id     uuid,
  p_tipo_pausa  text,
  p_token_admin uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id uuid;
begin
  select id into v_vol_id
  from volunteers
  where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if not exists (
    select 1 from node_admins
    where node_id = p_node_id and volunteer_id = v_vol_id
  ) then
    raise exception 'no_autorizado';
  end if;

  if p_tipo_pausa not in ('recepcion', 'entrega', 'ambas', 'reactivar') then
    raise exception 'tipo_pausa_invalido';
  end if;

  update centros_acopio set
    pausado_recepcion = case p_tipo_pausa
                          when 'recepcion' then true
                          when 'ambas'     then true
                          when 'reactivar' then false
                          else pausado_recepcion end,
    pausado_entrega   = case p_tipo_pausa
                          when 'entrega'   then true
                          when 'ambas'     then true
                          when 'reactivar' then false
                          else pausado_entrega end
  where id = p_node_id;
end;
$$;

grant execute on function pausar_nodo(uuid, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. RPC cerrar_nodo: EXCLUSIVO de superadmin. Permanente, sin reapertura.
-- ---------------------------------------------------------------------------
create or replace function cerrar_nodo(p_node_id uuid, p_token_admin uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from volunteers
  where token = p_token_admin and activo = true;
  if v_role is null then
    raise exception 'token_invalido';
  end if;
  if v_role is distinct from 'superadmin' then
    raise exception 'no_autorizado';
  end if;

  update centros_acopio
    set status = 'cerrado', activo = false
  where id = p_node_id;
end;
$$;

grant execute on function cerrar_nodo(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. RPC listar_nodos_admin: los nodos que administra el token, con su estado
--     y banderas (para el panel de admin). SECURITY DEFINER: el admin ve su
--     fila completa de membresía sin necesidad de SELECT directo sobre las join.
-- ---------------------------------------------------------------------------
create or replace function listar_nodos_admin(p_token uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_agg(to_json(t)), '[]'::json)
  from (
    select
      c.id, c.nombre, c.direccion, c.tipo, c.status,
      c.lat, c.lng, c.estado_id,
      c.pausado_recepcion, c.pausado_entrega,
      na.verificado, na.verificado_at
    from node_admins na
    join centros_acopio c on c.id = na.node_id
    join volunteers v on v.id = na.volunteer_id
    where v.token = p_token and v.activo = true
    order by c.nombre
  ) t;
$$;

grant execute on function listar_nodos_admin(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Sincronizar las RPC de #17 con las tablas join (sin mecanismos paralelos).
--     crear_admin: además de crear el volunteer admin, registra su membresía en
--     node_admins (sin verificar). Mismo cuerpo que 0030 + ese insert.
-- ---------------------------------------------------------------------------
create or replace function crear_admin(
  p_nombre           text,
  p_apellido         text,
  p_telefono         text default null,
  p_telegram         text default null,
  p_centro_acopio_id uuid default null
)
returns table (id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_new_id      uuid;
  v_new_token   uuid;
begin
  select role into v_caller_role
  from volunteers
  where token = current_volunteer_token() and activo = true;

  if v_caller_role is distinct from 'superadmin' then
    raise exception 'no_autorizado';
  end if;

  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellido), '') = '' then
    raise exception 'El nombre y el apellido del admin son obligatorios.';
  end if;

  if p_centro_acopio_id is not null
     and not exists (select 1 from centros_acopio where id = p_centro_acopio_id) then
    raise exception 'El centro de acopio (nodo) seleccionado no existe.';
  end if;

  insert into volunteers (nombre, apellido, telefono, telegram, centro_acopio_id, role)
  values (
    trim(p_nombre),
    trim(p_apellido),
    normalizar_telefono_ve(p_telefono),
    nullif(trim(p_telegram), ''),
    p_centro_acopio_id,
    'admin'
  )
  returning volunteers.id, volunteers.token into v_new_id, v_new_token;

  if p_centro_acopio_id is not null then
    insert into node_admins (node_id, volunteer_id, verificado)
    values (p_centro_acopio_id, v_new_id, false)
    on conflict (node_id, volunteer_id) do nothing;
  end if;

  return query select v_new_id, v_new_token;
end;
$$;

grant execute on function crear_admin(text, text, text, text, uuid) to anon, authenticated;

-- crear_colaborador: cuenta los colaboradores por node_collaborators (no por
-- volunteers.role) y registra la membresía en node_collaborators. El label
-- 'Colaborador N' se mantiene como nombre del volunteer y como label del nodo.
create or replace function crear_colaborador()
returns table (id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id   uuid;
  v_admin_role text;
  v_centro_id  uuid;
  v_n          int;
  v_nombre     text;
  v_new_id     uuid;
  v_new_token  uuid;
begin
  select v.id, v.role, v.centro_acopio_id
    into v_admin_id, v_admin_role, v_centro_id
  from volunteers v
  where v.token = current_volunteer_token()
    and v.activo = true;

  if v_admin_role is distinct from 'admin' then
    raise exception 'no_autorizado';
  end if;

  -- N secuencial = colaboradores ya registrados en este nodo + 1.
  select count(*) + 1 into v_n
  from node_collaborators
  where node_id is not distinct from v_centro_id;

  v_nombre := 'Colaborador ' || v_n;

  insert into volunteers (nombre, apellido, centro_acopio_id, role)
  values (v_nombre, null, v_centro_id, 'colaborador')
  returning volunteers.id, volunteers.token into v_new_id, v_new_token;

  if v_centro_id is not null then
    insert into node_collaborators (node_id, volunteer_id, label)
    values (v_centro_id, v_new_id, v_nombre)
    on conflict (node_id, volunteer_id) do nothing;
  end if;

  return query select v_new_id, v_new_token;
end;
$$;

grant execute on function crear_colaborador() to anon, authenticated;
