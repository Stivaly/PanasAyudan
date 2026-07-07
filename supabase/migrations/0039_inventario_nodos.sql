-- 0039_inventario_nodos.sql
-- Issue #22 — Inventario por nodo: disponibilidad por categoría/subcategoría,
-- con magnitud SOLO en los nodos que la publican (acopio | mixto) y condición por
-- item. Prerequisito de #24 (vista pública) y #26.
--
-- Reglas de negocio (definicion.md):
--   * punto de ENTREGA: publica solo disponible / no-hay por categoría-subcategoría,
--     SIN cantidades -> node_inventory.magnitud debe quedar NULL.
--   * centro de ACOPIO: publica con magnitud -> magnitud obligatoria.
--   * MIXTO: ambas formas -> magnitud opcional.
-- Al marcar "no hay" (marcar_agotado) la app ofrece crear una solicitud automática
-- con el nivel mínimo del nodo (solicitar_reposicion, wrapper de crear_solicitud/0032).
--
-- AUTORIZACIÓN (decisión, no reabrir): configurar el inventario (upsert_inventario:
-- alta/edición de items, condición y magnitud) es EXCLUSIVO del admin del nodo
-- (node_admins), para cumplir el criterio "el colaborador no puede editar condición
-- ni configuración" a nivel de servidor y no solo ocultándolo en la UI. El
-- colaborador SÍ puede marcar_agotado y solicitar_reposicion (es_miembro_nodo_token,
-- coherente con 0030/0031). Reutiliza es_miembro_nodo (0031), es_miembro_nodo_token
-- y crear_solicitud (0032), y el dominio magnitud_nivel (0032).
--
-- Idempotente (if not exists / drop defensivo por firma), RLS explícita, escritura
-- solo por RPC SECURITY DEFINER con set search_path = public.

-- ===========================================================================
-- 1. Tabla node_inventory.
-- ===========================================================================
create table if not exists node_inventory (
  id             uuid primary key default gen_random_uuid(),
  node_id        uuid not null references centros_acopio(id) on delete cascade,
  category_id    uuid not null references categories(id),
  subcategory_id uuid references subcategories(id),
  disponible     boolean not null default true,
  magnitud       magnitud_nivel,        -- solo la publican los nodos acopio | mixto
  condicion      text,                  -- ej. 'Se requiere receta médica'
  updated_at     timestamptz not null default now(),
  unique (node_id, category_id, subcategory_id)
);

create index if not exists idx_node_inventory_node on node_inventory(node_id);

-- El UNIQUE de arriba NO desduplica cuando subcategory_id es NULL (en SQL dos NULL
-- no son "iguales"): un item a nivel de macrocategoría (sin subcategoría) podría
-- duplicarse. Índice único parcial que cierra ese hueco.
create unique index if not exists uq_node_inventory_sin_sub
  on node_inventory(node_id, category_id)
  where subcategory_id is null;

-- ===========================================================================
-- 2. RLS.
--    Ninguna columna es sensible (no hay contacto ni ubicación de personas); la
--    condición es pública a propósito (criterio de aceptación). SELECT público
--    solo del inventario de nodos VISIBLES y verificados; el miembro del nodo ve
--    el suyo en cualquier estado. Escritura: sin policies -> solo por RPC.
-- ===========================================================================
alter table node_inventory enable row level security;
revoke all on node_inventory from anon, authenticated;
grant select on node_inventory to anon, authenticated;

drop policy if exists node_inventory_select_public on node_inventory;
create policy node_inventory_select_public
  on node_inventory for select
  to anon, authenticated
  using (
    exists (
      select 1 from centros_acopio ca
      where ca.id = node_inventory.node_id
        and ca.status in ('activo','pausado')
        and ca.verificado_at is not null
    )
    or es_miembro_nodo(node_inventory.node_id)
  );

-- Realtime (#24 consumirá el canal). Idempotente: solo agrega la tabla a la
-- publicación estándar de Supabase si existe y aún no la incluye.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'node_inventory'
     ) then
    alter publication supabase_realtime add table node_inventory;
  end if;
end;
$$;

-- ===========================================================================
-- 3. Helper: validar magnitud contra el tipo de nodo (regla de negocio central).
-- ===========================================================================
create or replace function validar_magnitud_por_tipo(p_tipo text, p_magnitud text)
returns void
language plpgsql
immutable
as $$
begin
  if p_tipo = 'entrega' and p_magnitud is not null then
    raise exception 'entrega_sin_magnitud: Un punto de entrega publica disponibilidad sin cantidades; no indiques magnitud.';
  end if;
  if p_tipo = 'acopio' and p_magnitud is null then
    raise exception 'acopio_requiere_magnitud: Un centro de acopio debe indicar la magnitud de cada item.';
  end if;
  if p_magnitud is not null and magnitud_orden(p_magnitud) = 0 then
    raise exception 'La magnitud del item no es válida.';
  end if;
  -- 'mixto' acepta ambas formas: no valida nada extra.
end;
$$;

grant execute on function validar_magnitud_por_tipo(text, text) to anon, authenticated;

-- ===========================================================================
-- 4. RPC upsert_inventario — alta/edición del inventario (ADMIN del nodo).
--    p_items: jsonb array de { category_id, subcategory_id?, disponible?,
--    magnitud?, condicion? }. Cada item se upserta por (node_id, category_id,
--    subcategory_id) usando "is not distinct from" para tratar bien el NULL.
-- ===========================================================================
create or replace function upsert_inventario(
  p_token   uuid,
  p_node_id uuid,
  p_items   jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id     uuid;
  v_tipo       text;
  v_item       jsonb;
  v_cat_id     uuid;
  v_sub_id     uuid;
  v_disponible boolean;
  v_magnitud   text;
  v_condicion  text;
begin
  select id into v_vol_id from volunteers where token = p_token and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  -- Configurar inventario es exclusivo del ADMIN del nodo (no del colaborador).
  if not exists (
    select 1 from node_admins na
    where na.node_id = p_node_id and na.volunteer_id = v_vol_id
  ) then
    raise exception 'no_autorizado';
  end if;

  select tipo into v_tipo from centros_acopio where id = p_node_id;
  if v_tipo is null then
    raise exception 'nodo_inexistente';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items_invalidos: Se esperaba una lista de items de inventario.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cat_id     := nullif(v_item ->> 'category_id', '')::uuid;
    v_sub_id     := nullif(v_item ->> 'subcategory_id', '')::uuid;
    v_disponible := coalesce((v_item ->> 'disponible')::boolean, true);
    v_magnitud   := nullif(v_item ->> 'magnitud', '');
    v_condicion  := nullif(trim(v_item ->> 'condicion'), '');

    if v_cat_id is null or not exists (select 1 from categories where id = v_cat_id) then
      raise exception 'La categoría del item de inventario no es válida.';
    end if;
    if v_sub_id is not null and not exists (
      select 1 from subcategories where id = v_sub_id and category_id = v_cat_id
    ) then
      raise exception 'La subcategoría no pertenece a la categoría del item.';
    end if;

    perform validar_magnitud_por_tipo(v_tipo, v_magnitud);

    update node_inventory set
      disponible = v_disponible,
      magnitud   = v_magnitud,
      condicion  = v_condicion,
      updated_at = now()
    where node_id = p_node_id
      and category_id = v_cat_id
      and subcategory_id is not distinct from v_sub_id;

    if not found then
      insert into node_inventory (node_id, category_id, subcategory_id, disponible, magnitud, condicion)
      values (p_node_id, v_cat_id, v_sub_id, v_disponible, v_magnitud, v_condicion);
    end if;
  end loop;
end;
$$;

grant execute on function upsert_inventario(uuid, uuid, jsonb) to anon, authenticated;

-- ===========================================================================
-- 5. RPC marcar_agotado — "no hay" (ADMIN o COLABORADOR del nodo).
--    Pone disponible=false y devuelve los datos para ofrecer una solicitud.
-- ===========================================================================
create or replace function marcar_agotado(
  p_token        uuid,
  p_inventory_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node_id uuid;
  v_cat_id  uuid;
  v_sub_id  uuid;
begin
  select node_id, category_id, subcategory_id
    into v_node_id, v_cat_id, v_sub_id
  from node_inventory where id = p_inventory_id;
  if v_node_id is null then
    raise exception 'inventario_inexistente';
  end if;

  if not es_miembro_nodo_token(v_node_id, p_token) then
    raise exception 'no_autorizado';
  end if;

  update node_inventory
    set disponible = false, updated_at = now()
  where id = p_inventory_id;

  return json_build_object(
    'sugerir_solicitud', true,
    'inventory_id',      p_inventory_id,
    'node_id',           v_node_id,
    'category_id',       v_cat_id,
    'subcategory_id',    v_sub_id
  );
end;
$$;

grant execute on function marcar_agotado(uuid, uuid) to anon, authenticated;

-- ===========================================================================
-- 6. RPC solicitar_reposicion — wrapper de crear_solicitud (0032) con el item
--    del inventario (ADMIN o COLABORADOR del nodo). p_magnitud es el nivel
--    mínimo del nodo que se pide reponer. crear_solicitud revalida la membresía.
-- ===========================================================================
create or replace function solicitar_reposicion(
  p_token             uuid,
  p_inventory_id      uuid,
  p_magnitud          magnitud_nivel,
  p_requiere_vehiculo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node_id uuid;
  v_cat_id  uuid;
  v_sub_id  uuid;
begin
  select node_id, category_id, subcategory_id
    into v_node_id, v_cat_id, v_sub_id
  from node_inventory where id = p_inventory_id;
  if v_node_id is null then
    raise exception 'inventario_inexistente';
  end if;

  if not es_miembro_nodo_token(v_node_id, p_token) then
    raise exception 'no_autorizado';
  end if;
  if p_magnitud is null or magnitud_orden(p_magnitud) = 0 then
    raise exception 'La magnitud de la solicitud no es válida.';
  end if;

  return crear_solicitud(
    v_node_id,
    jsonb_build_object(
      'category_id',       v_cat_id,
      'subcategory_id',    v_sub_id,
      'magnitud',          p_magnitud,
      'requiere_vehiculo', coalesce(p_requiere_vehiculo, false)
    ),
    p_token
  );
end;
$$;

grant execute on function solicitar_reposicion(uuid, uuid, magnitud_nivel, boolean) to anon, authenticated;

-- ===========================================================================
-- 7. RPC listar_nodos_miembro — los nodos donde el token es admin O colaborador.
--    listar_nodos_admin (0031) solo cubre admins; el panel de colaborador (#17
--    placeholder) necesita alcanzar el inventario de su propio nodo. Devuelve
--    solo lo necesario para el panel (sin ownership de terceros).
-- ===========================================================================
create or replace function listar_nodos_miembro(p_token uuid)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(json_agg(to_json(t)), '[]'::json)
  from (
    select distinct
      c.id, c.nombre, c.direccion, c.tipo, c.status,
      c.pausado_recepcion, c.pausado_entrega
    from centros_acopio c
    where c.id in (
      select na.node_id from node_admins na
        join volunteers v on v.id = na.volunteer_id
        where v.token = p_token and v.activo = true
      union
      select nc.node_id from node_collaborators nc
        join volunteers v on v.id = nc.volunteer_id
        where v.token = p_token and v.activo = true
    )
    order by c.nombre
  ) t;
$$;

grant execute on function listar_nodos_miembro(uuid) to anon, authenticated;
