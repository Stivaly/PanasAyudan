-- 0044_aprobar_registro_nodo_activa_centro.sql
-- Corrige el flujo de aprobacion de solicitudes de registro de nodo:
--   * La solicitud guarda google_place_id.
--   * El registro publico debe venir de Google Maps, con estado, direccion y coords.
--   * Al aprobar, el nodo queda vigente en centros_acopio por estado
--     (status='activo', activo=true) y conserva google_place_id.
--   * Los nodos ya aprobados por este flujo se activan para que aparezcan en las
--     listas vigentes filtradas por estado.

alter table solicitudes_registro_nodo
  add column if not exists google_place_id text;

create index if not exists idx_solicitudes_registro_google_place
  on solicitudes_registro_nodo (google_place_id)
  where google_place_id is not null;

-- Backfill informativo para solicitudes ya aprobadas si el nodo creado tiene
-- google_place_id.
update solicitudes_registro_nodo s
set google_place_id = c.google_place_id
from centros_acopio c
where s.node_id = c.id
  and s.google_place_id is null
  and c.google_place_id is not null;

-- Los nodos aprobados por superadmin deben entrar a la lista vigente de
-- centros_acopio segmentada por estado. La lista publica usa activo=true y RLS
-- exige status activo/pausado.
update centros_acopio c
set status = 'activo',
    activo = true,
    verificado_at = coalesce(c.verificado_at, now())
from solicitudes_registro_nodo s
where s.node_id = c.id
  and s.status = 'aprobada'
  and c.status = 'inactivo';

update node_admins na
set verificado = true,
    verificado_at = coalesce(na.verificado_at, now())
from solicitudes_registro_nodo s
where s.node_id = na.node_id
  and s.status = 'aprobada'
  and na.verificado = false;

-- Compatibilidad con flujos heredados que todavia leen volunteers.centro_acopio_id
-- para saber cual es el nodo principal del admin.
update volunteers v
set centro_acopio_id = na.node_id
from node_admins na
join solicitudes_registro_nodo s on s.node_id = na.node_id
where v.id = na.volunteer_id
  and v.role = 'admin'
  and v.centro_acopio_id is null
  and s.status = 'aprobada';

create or replace function crear_solicitud_registro_nodo(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo            text := coalesce(nullif(p_datos ->> 'tipo', ''), 'acopio');
  v_telefono        text;
  v_estado_id       uuid := nullif(p_datos ->> 'estado_id', '')::uuid;
  v_google_place_id text := nullif(trim(p_datos ->> 'google_place_id'), '');
  v_lat             double precision := nullif(p_datos ->> 'lat', '')::double precision;
  v_lng             double precision := nullif(p_datos ->> 'lng', '')::double precision;
  v_direccion       text := nullif(trim(p_datos ->> 'direccion'), '');
  v_categorias uuid[] := coalesce(
    (select array_agg((e)::uuid)
     from jsonb_array_elements_text(coalesce(p_datos -> 'categorias', '[]'::jsonb)) as e),
    '{}'::uuid[]
  );
  v_id uuid;
begin
  if coalesce(trim(p_datos ->> 'nombre_nodo'), '') = '' then
    raise exception 'El nombre del nodo es obligatorio.';
  end if;
  if coalesce(trim(p_datos ->> 'solicitante_nombre'), '') = '' then
    raise exception 'Tu nombre es obligatorio.';
  end if;
  if v_tipo not in ('acopio', 'entrega', 'mixto') then
    raise exception 'tipo_invalido';
  end if;
  if v_estado_id is null or not exists (select 1 from estados where id = v_estado_id) then
    raise exception 'El estado seleccionado no es valido.';
  end if;
  if v_google_place_id is null then
    raise exception 'La ubicacion debe seleccionarse desde Google Maps.';
  end if;
  if v_lat is null or v_lng is null or v_direccion is null then
    raise exception 'La ubicacion del punto esta incompleta.';
  end if;

  v_telefono := normalizar_telefono_ve(p_datos ->> 'solicitante_telefono');

  if exists (
    select 1 from solicitudes_registro_nodo
    where solicitante_telefono = v_telefono and status = 'pendiente'
  ) then
    raise exception 'Ya tienes una solicitud de registro pendiente con este telefono.';
  end if;

  if exists (
    select 1 from centros_acopio
    where google_place_id = v_google_place_id
      and status <> 'cerrado'
  ) then
    raise exception 'Este punto ya esta registrado.';
  end if;

  insert into solicitudes_registro_nodo (
    nombre_nodo, tipo, lat, lng, direccion, google_place_id, estado_id,
    categorias, horarios, solicitante_nombre, solicitante_telefono, mensaje,
    audio_url
  )
  values (
    trim(p_datos ->> 'nombre_nodo'),
    v_tipo,
    v_lat,
    v_lng,
    v_direccion,
    v_google_place_id,
    v_estado_id,
    v_categorias,
    nullif(trim(p_datos ->> 'horarios'), ''),
    trim(p_datos ->> 'solicitante_nombre'),
    v_telefono,
    nullif(trim(p_datos ->> 'mensaje'), ''),
    nullif(trim(p_datos ->> 'audio_url'), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function crear_solicitud_registro_nodo(jsonb) to anon, authenticated;

create or replace function aprobar_solicitud_registro(p_solicitud_id uuid, p_token uuid)
returns table (admin_token uuid, node_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol         solicitudes_registro_nodo;
  v_admin_id    uuid;
  v_admin_token uuid;
  v_node_id     uuid;
begin
  if not exists (
    select 1 from volunteers
    where token = p_token and role = 'superadmin' and activo = true
  ) then
    raise exception 'no_autorizado';
  end if;

  select * into v_sol from solicitudes_registro_nodo where id = p_solicitud_id for update;
  if v_sol.id is null then
    raise exception 'solicitud_no_encontrada';
  end if;
  if v_sol.status <> 'pendiente' then
    raise exception 'solicitud_ya_resuelta';
  end if;
  if v_sol.google_place_id is null then
    raise exception 'La solicitud debe tener una ubicacion seleccionada desde Google Maps.';
  end if;
  if v_sol.estado_id is null or v_sol.lat is null or v_sol.lng is null or v_sol.direccion is null then
    raise exception 'La solicitud tiene datos de ubicacion incompletos.';
  end if;

  if exists (
    select 1 from centros_acopio
    where google_place_id = v_sol.google_place_id
      and status <> 'cerrado'
  ) then
    raise exception 'Este punto ya esta registrado.';
  end if;

  select id, token into v_admin_id, v_admin_token
  from crear_admin(v_sol.solicitante_nombre, '-', v_sol.solicitante_telefono, null, null);

  v_node_id := crear_nodo(
    jsonb_build_object(
      'nombre',          v_sol.nombre_nodo,
      'direccion',       v_sol.direccion,
      'google_place_id', v_sol.google_place_id,
      'estado_id',       v_sol.estado_id,
      'tipo',            v_sol.tipo,
      'lat',             v_sol.lat,
      'lng',             v_sol.lng,
      'horario',         v_sol.horarios
    ),
    v_admin_token
  );

  update centros_acopio
  set status = 'activo',
      activo = true,
      verificado_at = coalesce(verificado_at, now())
  where id = v_node_id;

  update node_admins
  set verificado = true,
      verificado_at = coalesce(verificado_at, now())
  where node_admins.node_id = v_node_id
    and volunteer_id = v_admin_id;

  update volunteers
  set centro_acopio_id = v_node_id
  where id = v_admin_id;

  update solicitudes_registro_nodo
  set status = 'aprobada', node_id = v_node_id
  where id = p_solicitud_id;

  return query select v_admin_token, v_node_id;
end;
$$;

grant execute on function aprobar_solicitud_registro(uuid, uuid) to anon, authenticated;
