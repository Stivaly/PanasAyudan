-- 0041_solicitudes_registro_nodo.sql
-- Backoffice de registro de nodos (issue #21).
-- Cualquier persona (anon) solicita registrar un nodo mediante una RPC pública;
-- la solicitud aterriza en una cola que SOLO la superadmin ve. Al aprobar, en una
-- sola transacción se crea el admin (con token nuevo) y el nodo (reutilizando
-- crear_admin de 0030/0031 y crear_nodo de 0031), y la solicitud queda 'aprobada'.
-- El nodo nace 'inactivo': sigue exigiendo verificar_nodo (GPS, 0031) para ser
-- público. El formulario público de solicitud y la edición del nodo viven en #29.
--
-- Invariantes respetados:
--   * El contacto del solicitante (teléfono) NUNCA es legible en público: la
--     tabla revoca todo a anon/authenticated y solo la superadmin la lee (RLS).
--   * INSERT solo vía RPC SECURITY DEFINER (no hay policy de insert directo).
--   * No hay upload de archivos: audio_url es un enlace externo opcional.
-- Idempotente: create table if not exists, drop policy if exists, create or replace.

-- ===========================================================================
-- 1. Tabla de solicitudes de registro de nodo.
-- ===========================================================================
create table if not exists solicitudes_registro_nodo (
  id                   uuid primary key default gen_random_uuid(),
  nombre_nodo          text not null,
  tipo                 text not null check (tipo in ('acopio','entrega','mixto')),
  lat                  double precision,
  lng                  double precision,
  direccion            text,
  estado_id            uuid references estados(id),
  categorias           uuid[] not null default '{}',
  horarios             text,
  solicitante_nombre   text not null,
  solicitante_telefono text not null,
  mensaje              text,
  audio_url            text,   -- enlace externo opcional; NO hay upload de archivos
  status               text not null default 'pendiente'
                         check (status in ('pendiente','aprobada','rechazada')),
  motivo_rechazo       text,
  node_id              uuid references centros_acopio(id),  -- nodo creado al aprobar
  created_at           timestamptz not null default now()
);

-- Solo puede haber una solicitud 'pendiente' por teléfono (rate-limit duro a
-- nivel de esquema; la RPC pública también lo valida con un mensaje claro).
create unique index if not exists uq_solicitud_registro_pendiente_telefono
  on solicitudes_registro_nodo (solicitante_telefono)
  where status = 'pendiente';

-- ===========================================================================
-- 2. RLS: sin acceso directo. Solo la superadmin puede leer la cola; nadie
--    inserta/actualiza salvo vía las RPC SECURITY DEFINER de abajo.
-- ===========================================================================
alter table solicitudes_registro_nodo enable row level security;

revoke all on solicitudes_registro_nodo from anon, authenticated;
grant select on solicitudes_registro_nodo to anon, authenticated;

drop policy if exists solicitudes_registro_select_superadmin on solicitudes_registro_nodo;
create policy solicitudes_registro_select_superadmin
  on solicitudes_registro_nodo for select
  to anon, authenticated
  using (
    exists (
      select 1 from volunteers v
      where v.token = current_volunteer_token()
        and v.role = 'superadmin'
        and v.activo = true
    )
  );

-- ===========================================================================
-- 3. RPC pública (anon): crear una solicitud de registro de nodo.
--    Normaliza el teléfono con el mismo criterio del cliente (normalizar_telefono_ve)
--    y rechaza si ya existe una solicitud 'pendiente' con ese teléfono.
-- ===========================================================================
create or replace function crear_solicitud_registro_nodo(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo      text := coalesce(nullif(p_datos ->> 'tipo', ''), 'acopio');
  v_telefono  text;
  v_estado_id uuid := nullif(p_datos ->> 'estado_id', '')::uuid;
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
  if v_estado_id is not null and not exists (select 1 from estados where id = v_estado_id) then
    raise exception 'El estado seleccionado no es válido.';
  end if;

  -- Normaliza + valida el teléfono (lanza excepción con mensaje claro si es inválido).
  v_telefono := normalizar_telefono_ve(p_datos ->> 'solicitante_telefono');

  -- Rate-limit: una sola solicitud pendiente por teléfono.
  if exists (
    select 1 from solicitudes_registro_nodo
    where solicitante_telefono = v_telefono and status = 'pendiente'
  ) then
    raise exception 'Ya tienes una solicitud de registro pendiente con este teléfono.';
  end if;

  insert into solicitudes_registro_nodo (
    nombre_nodo, tipo, lat, lng, direccion, estado_id, categorias, horarios,
    solicitante_nombre, solicitante_telefono, mensaje, audio_url
  )
  values (
    trim(p_datos ->> 'nombre_nodo'),
    v_tipo,
    nullif(p_datos ->> 'lat', '')::double precision,
    nullif(p_datos ->> 'lng', '')::double precision,
    nullif(trim(p_datos ->> 'direccion'), ''),
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

-- ===========================================================================
-- 4. RPC superadmin: listar solicitudes de registro (pendientes primero).
-- ===========================================================================
create or replace function listar_solicitudes_registro(p_token uuid)
returns setof solicitudes_registro_nodo
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from volunteers
    where token = p_token and role = 'superadmin' and activo = true
  ) then
    raise exception 'no_autorizado';
  end if;

  return query
  select * from solicitudes_registro_nodo
  order by
    case when status = 'pendiente' then 0 else 1 end,
    created_at desc;
end;
$$;

grant execute on function listar_solicitudes_registro(uuid) to anon, authenticated;

-- ===========================================================================
-- 5. RPC superadmin: aprobar una solicitud.
--    Una sola transacción (toda la función corre atómicamente):
--      crear_admin (token nuevo) -> crear_nodo (nace inactivo) -> marca aprobada.
--    Devuelve { admin_token, node_id }. El token se muestra UNA vez.
--    crear_admin valida al superadmin por el header (current_volunteer_token());
--    el frontend envía el token también en el header vía supabaseWithToken.
-- ===========================================================================
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

  -- 1) Crear el admin solicitante (token nuevo). Reutiliza crear_admin (0031);
  --    valida al superadmin por el header. El nodo aún no existe, así que su
  --    membresía se registra en crear_nodo (node_admins).
  select id, token into v_admin_id, v_admin_token
  from crear_admin(v_sol.solicitante_nombre, '-', v_sol.solicitante_telefono, null, null);

  -- 2) Crear el nodo con los datos de la solicitud. Reutiliza crear_nodo (0031):
  --    nace 'inactivo' y exige verificar_nodo (GPS) para ser público.
  v_node_id := crear_nodo(
    jsonb_build_object(
      'nombre',    v_sol.nombre_nodo,
      'direccion', coalesce(v_sol.direccion, ''),
      'estado_id', v_sol.estado_id,
      'tipo',      v_sol.tipo,
      'lat',       v_sol.lat,
      'lng',       v_sol.lng,
      'horario',   v_sol.horarios
    ),
    v_admin_token
  );

  -- 3) Marcar la solicitud como aprobada y enlazarla al nodo creado.
  update solicitudes_registro_nodo
  set status = 'aprobada', node_id = v_node_id
  where id = p_solicitud_id;

  return query select v_admin_token, v_node_id;
end;
$$;

grant execute on function aprobar_solicitud_registro(uuid, uuid) to anon, authenticated;

-- ===========================================================================
-- 6. RPC superadmin: rechazar una solicitud (con motivo).
-- ===========================================================================
create or replace function rechazar_solicitud_registro(
  p_solicitud_id uuid,
  p_token        uuid,
  p_motivo       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not exists (
    select 1 from volunteers
    where token = p_token and role = 'superadmin' and activo = true
  ) then
    raise exception 'no_autorizado';
  end if;

  select status into v_status from solicitudes_registro_nodo
  where id = p_solicitud_id for update;
  if v_status is null then
    raise exception 'solicitud_no_encontrada';
  end if;
  if v_status <> 'pendiente' then
    raise exception 'solicitud_ya_resuelta';
  end if;

  update solicitudes_registro_nodo
  set status = 'rechazada', motivo_rechazo = nullif(trim(p_motivo), '')
  where id = p_solicitud_id;
end;
$$;

grant execute on function rechazar_solicitud_registro(uuid, uuid, text) to anon, authenticated;
