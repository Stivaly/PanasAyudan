-- 0048_nota_solicitudes_inventario.sql
-- Comentario libre en pedidos y en inventario.
--
-- Problema: al pedir insumos (solicitudes) o al publicar disponibilidad
-- (node_inventory) solo se podía indicar categoría + subcategoría (taxonomía) +
-- magnitud. No había forma de precisar QUÉ exactamente se necesita/ofrece
-- (ej. "insulina NPH 100UI", "llave de tubo 3/4", "pañales talla M"). La columna
-- `condicion` de node_inventory (0039) es para condiciones de entrega
-- ("requiere receta"), no para describir el item; se mantiene con ese uso.
--
-- Solución: columna `nota text` (texto libre, opcional) en ambas tablas. Es un
-- dato PÚBLICO no sensible, del mismo nivel que condicion/subcategoria: NO debe
-- usarse para contacto ni ubicación (la UI lo advierte). Se recorta a 280 chars
-- server-side por si acaso.
--
-- Idempotente (add column if not exists / create or replace / drop defensivo por
-- firma). Se reescriben las RPC de escritura para persistir la nota y las de
-- lectura para devolverla. Se parte de la última versión de cada función:
--   crear_solicitud                 -> 0037
--   upsert_inventario               -> 0039
--   solicitar_reposicion            -> 0039 (cambia de firma: +p_nota)
--   listar_solicitudes_disponibles  -> 0038
--   listar_solicitudes_nodo         -> 0040
--   listar_solicitudes_para_nodo    -> 0046

set search_path = public, extensions;

-- ===========================================================================
-- 1. Columnas nuevas.
-- ===========================================================================
alter table solicitudes    add column if not exists nota text;
alter table node_inventory add column if not exists nota text;

-- ===========================================================================
-- 2. crear_solicitud: persiste nota (recortada a 280 chars). Igual que 0037 más
--    el nuevo campo p_datos->>'nota'.
-- ===========================================================================
create or replace function crear_solicitud(
  p_node_id     uuid,
  p_datos       jsonb,
  p_token_admin uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id         uuid;
  v_category_id    uuid    := nullif(p_datos ->> 'category_id', '')::uuid;
  v_magnitud       text    := nullif(p_datos ->> 'magnitud', '');
  v_subcategory_id uuid    := nullif(p_datos ->> 'subcategory_id', '')::uuid;
  v_subcategoria   text    := nullif(p_datos ->> 'subcategoria', '');
  v_nota           text    := nullif(left(trim(p_datos ->> 'nota'), 280), '');
  v_sub_cat_id     uuid;
  v_sub_name       text;
  v_requiere_veh   boolean := coalesce((p_datos ->> 'requiere_vehiculo')::boolean, false);
  v_solicitud_id   uuid;
begin
  select id into v_vol_id from volunteers where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if not es_miembro_nodo_token(p_node_id, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  if v_category_id is null or not exists (select 1 from categories where id = v_category_id) then
    raise exception 'La categoría de la solicitud no es válida.';
  end if;
  if v_magnitud is null or magnitud_orden(v_magnitud) = 0 then
    raise exception 'La magnitud de la solicitud no es válida.';
  end if;

  -- La subcategoría (si se envía) debe existir y pertenecer a la categoría.
  if v_subcategory_id is not null then
    select id, name into v_sub_cat_id, v_sub_name
    from subcategories where id = v_subcategory_id and category_id = v_category_id;
    if v_sub_cat_id is null then
      raise exception 'La subcategoría no pertenece a la categoría seleccionada.';
    end if;
    -- Sincroniza el texto legado con el nombre real de la subcategoría.
    v_subcategoria := v_sub_name;
  end if;

  insert into solicitudes
    (node_id_origen, category_id, subcategory_id, subcategoria, magnitud, requiere_vehiculo, nota, status)
  values
    (p_node_id, v_category_id, v_subcategory_id, v_subcategoria, v_magnitud, v_requiere_veh, v_nota, 'abierta')
  returning id into v_solicitud_id;

  return v_solicitud_id;
end;
$$;

grant execute on function crear_solicitud(uuid, jsonb, uuid) to anon, authenticated;

-- ===========================================================================
-- 3. upsert_inventario: persiste nota por item (recortada a 280 chars). Igual
--    que 0039 más el nuevo campo 'nota' de cada item.
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
  v_nota       text;
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
    v_nota       := nullif(left(trim(v_item ->> 'nota'), 280), '');

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
      nota       = v_nota,
      updated_at = now()
    where node_id = p_node_id
      and category_id = v_cat_id
      and subcategory_id is not distinct from v_sub_id;

    if not found then
      insert into node_inventory (node_id, category_id, subcategory_id, disponible, magnitud, condicion, nota)
      values (p_node_id, v_cat_id, v_sub_id, v_disponible, v_magnitud, v_condicion, v_nota);
    end if;
  end loop;
end;
$$;

grant execute on function upsert_inventario(uuid, uuid, jsonb) to anon, authenticated;

-- ===========================================================================
-- 4. solicitar_reposicion: acepta una nota opcional y la reenvía a
--    crear_solicitud. Cambia de firma respecto a 0039 (se agrega p_nota), así que
--    se hace drop defensivo por firma de la versión anterior para no dejar dos
--    overloads ambiguos.
-- ===========================================================================
drop function if exists solicitar_reposicion(uuid, uuid, magnitud_nivel, boolean);

create or replace function solicitar_reposicion(
  p_token             uuid,
  p_inventory_id      uuid,
  p_magnitud          magnitud_nivel,
  p_requiere_vehiculo boolean default false,
  p_nota              text    default null
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
      'requiere_vehiculo', coalesce(p_requiere_vehiculo, false),
      'nota',              nullif(trim(p_nota), '')
    ),
    p_token
  );
end;
$$;

grant execute on function solicitar_reposicion(uuid, uuid, magnitud_nivel, boolean, text) to anon, authenticated;

-- ===========================================================================
-- 5. listar_solicitudes_disponibles: devuelve s.nota (panel de voluntario).
--    Igual que 0038 más la columna s.nota.
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
      s.nota,
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
-- 6. listar_solicitudes_nodo: devuelve s.nota (panel del nodo origen).
--    Igual que 0040 más la columna s.nota.
-- ===========================================================================
create or replace function listar_solicitudes_nodo(
  p_node_id     uuid,
  p_token_admin uuid
)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not es_miembro_nodo_token(p_node_id, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  return (
    select coalesce(json_agg(to_json(t)), '[]'::json)
    from (
      select
        s.id,
        s.category_id,
        c.name as category_name,
        s.subcategoria,
        s.nota,
        s.magnitud,
        s.requiere_vehiculo,
        s.status,
        greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) as sobrante,
        s.created_at,
        coalesce((
          select json_agg(json_build_object(
            'id', cv.id,
            'magnitud', cv.magnitud_comprometida,
            'tiempo_estimado_minutos', cv.tiempo_estimado_minutos,
            'status', cv.status,
            'created_at', cv.created_at,
            'atrasado_24h', (
              cv.status = 'pendiente'
              and cv.created_at
                  + make_interval(mins => cv.tiempo_estimado_minutos)
                  + interval '24 hours' < now()
            )
          ) order by cv.created_at)
          from compromisos_voluntario cv where cv.solicitud_id = s.id
        ), '[]'::json) as compromisos_voluntario,
        coalesce((
          select json_agg(json_build_object(
            'id', cn.id,
            'magnitud', cn.magnitud_comprometida,
            'tiene_transporte', cn.tiene_transporte,
            'status', cn.status,
            'node_id_compromete', cn.node_id_compromete,
            'created_at', cn.created_at
          ) order by cn.created_at)
          from compromisos_nodo cn where cn.solicitud_id = s.id
        ), '[]'::json) as compromisos_nodo
      from solicitudes s
      join categories c on c.id = s.category_id
      where s.node_id_origen = p_node_id
      order by s.created_at desc
    ) t
  );
end;
$$;

grant execute on function listar_solicitudes_nodo(uuid, uuid) to anon, authenticated;

-- ===========================================================================
-- 7. listar_solicitudes_para_nodo: devuelve s.nota (solicitudes de otros
--    centros en rango). Igual que 0046 más la columna s.nota.
-- ===========================================================================
create or replace function listar_solicitudes_para_nodo(
  p_node_id     uuid,
  p_token_admin uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_lat           double precision;
  v_lng           double precision;
  v_origen        geography;
  v_radio_metros  double precision := 650000; -- rango operativo maximo de 650 km.
begin
  if not es_miembro_nodo_token(p_node_id, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  select lat, lng into v_lat, v_lng
  from centros_acopio
  where id = p_node_id;

  if v_lat is null or v_lng is null then
    return '[]'::json;
  end if;

  v_origen := st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography;

  return (
    select coalesce(json_agg(to_json(t) order by t.created_at desc), '[]'::json)
    from (
      select
        s.id,
        s.node_id_origen,
        ca.nombre as nodo_nombre,
        s.category_id,
        c.name as category_name,
        s.subcategoria,
        s.nota,
        s.magnitud,
        s.requiere_vehiculo,
        s.status,
        greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) as sobrante,
        round((
          st_distance(
            v_origen,
            st_setsrid(st_makepoint(ca.lng, ca.lat), 4326)::geography
          ) / 1000
        )::numeric, 1) as distancia_km,
        s.created_at
      from solicitudes s
      join categories c on c.id = s.category_id
      join centros_acopio ca on ca.id = s.node_id_origen
      where s.node_id_origen <> p_node_id
        and s.status in ('abierta','parcial','inventario_asegurado')
        and greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) > 0
        and ca.lat is not null
        and ca.lng is not null
        and coalesce(ca.activo, true) = true
        and coalesce(ca.status, 'activo') <> 'cerrado'
        and st_dwithin(
          v_origen,
          st_setsrid(st_makepoint(ca.lng, ca.lat), 4326)::geography,
          v_radio_metros
        )
    ) t
  );
end;
$$;

grant execute on function listar_solicitudes_para_nodo(uuid, uuid) to anon, authenticated;
