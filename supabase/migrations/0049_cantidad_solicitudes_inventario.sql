-- 0049_cantidad_solicitudes_inventario.sql
-- Cantidad concreta (entero) junto a la magnitud.
--
-- Problema: al pedir/publicar/comprometer insumos solo se elegía la MAGNITUD
-- (nivel ordinal: unidades..gandola), p.ej. "cajas", pero no CUÁNTAS cajas. La
-- magnitud sigue siendo el driver de cobertura/sobrante (magnitud_orden); la
-- cantidad es un dato DESCRIPTIVO opcional que precisa el conteo ("5 cajas").
--
-- Alcance: columna `cantidad int` (nullable, > 0) en las cuatro tablas del flujo:
--   solicitudes, node_inventory, compromisos_voluntario, compromisos_nodo.
-- No se toca la lógica de sobrante/cobertura (sigue por magnitud). En
-- node_inventory la cantidad solo aplica cuando hay magnitud (acopio | mixto); un
-- punto de entrega no publica cantidades, así que cantidad queda NULL ahí.
--
-- PRIVACIDAD (#24): la cantidad es una cantidad -> NUNCA se expone en lecturas
-- públicas (getInventarioPublico no la selecciona), igual que la magnitud.
--
-- Idempotente: add column if not exists + constraints guardadas por pg_constraint,
-- create or replace / drop defensivo por firma en las RPC que cambian de firma.
-- Se parte de la última versión de cada función:
--   crear_solicitud                 -> 0048
--   upsert_inventario               -> 0048
--   solicitar_reposicion            -> 0048 (cambia de firma: +p_cantidad)
--   responder_solicitud_voluntario  -> 0038 (cambia de firma: +p_cantidad)
--   responder_solicitud_nodo        -> 0032 (cambia de firma: +p_cantidad)
--   listar_solicitudes_disponibles  -> 0048
--   listar_solicitudes_nodo         -> 0048
--   listar_solicitudes_para_nodo    -> 0048

set search_path = public, extensions;

-- ===========================================================================
-- 1. Columnas nuevas + CHECK de positividad (guardado, idempotente).
-- ===========================================================================
alter table solicitudes            add column if not exists cantidad int;
alter table node_inventory         add column if not exists cantidad int;
alter table compromisos_voluntario add column if not exists cantidad int;
alter table compromisos_nodo       add column if not exists cantidad int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'solicitudes_cantidad_positiva') then
    alter table solicitudes add constraint solicitudes_cantidad_positiva
      check (cantidad is null or cantidad > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'node_inventory_cantidad_positiva') then
    alter table node_inventory add constraint node_inventory_cantidad_positiva
      check (cantidad is null or cantidad > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compromisos_voluntario_cantidad_positiva') then
    alter table compromisos_voluntario add constraint compromisos_voluntario_cantidad_positiva
      check (cantidad is null or cantidad > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compromisos_nodo_cantidad_positiva') then
    alter table compromisos_nodo add constraint compromisos_nodo_cantidad_positiva
      check (cantidad is null or cantidad > 0);
  end if;
end;
$$;

-- ===========================================================================
-- 2. crear_solicitud: persiste cantidad (entero > 0 opcional). Igual que 0048
--    más el campo p_datos->>'cantidad'.
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
  v_cantidad       int     := nullif(p_datos ->> 'cantidad', '')::int;
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
  if v_cantidad is null or v_cantidad <= 0 then
    raise exception 'La cantidad es obligatoria y debe ser un número entero mayor a cero.';
  end if;

  -- La subcategoría (si se envía) debe existir y pertenecer a la categoría.
  if v_subcategory_id is not null then
    select id, name into v_sub_cat_id, v_sub_name
    from subcategories where id = v_subcategory_id and category_id = v_category_id;
    if v_sub_cat_id is null then
      raise exception 'La subcategoría no pertenece a la categoría seleccionada.';
    end if;
    v_subcategoria := v_sub_name;
  end if;

  insert into solicitudes
    (node_id_origen, category_id, subcategory_id, subcategoria, magnitud, cantidad, requiere_vehiculo, nota, status)
  values
    (p_node_id, v_category_id, v_subcategory_id, v_subcategoria, v_magnitud, v_cantidad, v_requiere_veh, v_nota, 'abierta')
  returning id into v_solicitud_id;

  return v_solicitud_id;
end;
$$;

grant execute on function crear_solicitud(uuid, jsonb, uuid) to anon, authenticated;

-- ===========================================================================
-- 3. upsert_inventario: persiste cantidad por item. Solo tiene sentido con
--    magnitud (acopio | mixto); si el item va sin magnitud, cantidad queda NULL.
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
  v_cantidad   int;
begin
  select id into v_vol_id from volunteers where token = p_token and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

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
    v_cantidad   := nullif(v_item ->> 'cantidad', '')::int;

    if v_cat_id is null or not exists (select 1 from categories where id = v_cat_id) then
      raise exception 'La categoría del item de inventario no es válida.';
    end if;
    if v_sub_id is not null and not exists (
      select 1 from subcategories where id = v_sub_id and category_id = v_cat_id
    ) then
      raise exception 'La subcategoría no pertenece a la categoría del item.';
    end if;

    perform validar_magnitud_por_tipo(v_tipo, v_magnitud);

    -- La cantidad acompaña OBLIGATORIAMENTE a la magnitud (acopio | mixto). Un
    -- punto de entrega no publica magnitud, así que ahí no hay cantidad.
    if v_magnitud is null then
      v_cantidad := null;
    elsif v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad es obligatoria y debe ser un número entero mayor a cero.';
    end if;

    update node_inventory set
      disponible = v_disponible,
      magnitud   = v_magnitud,
      cantidad   = v_cantidad,
      condicion  = v_condicion,
      nota       = v_nota,
      updated_at = now()
    where node_id = p_node_id
      and category_id = v_cat_id
      and subcategory_id is not distinct from v_sub_id;

    if not found then
      insert into node_inventory (node_id, category_id, subcategory_id, disponible, magnitud, cantidad, condicion, nota)
      values (p_node_id, v_cat_id, v_sub_id, v_disponible, v_magnitud, v_cantidad, v_condicion, v_nota);
    end if;
  end loop;
end;
$$;

grant execute on function upsert_inventario(uuid, uuid, jsonb) to anon, authenticated;

-- ===========================================================================
-- 4. solicitar_reposicion: acepta cantidad opcional y la reenvía. Cambia de
--    firma respecto a 0048 (+p_cantidad) -> drop defensivo de la versión previa.
-- ===========================================================================
drop function if exists solicitar_reposicion(uuid, uuid, magnitud_nivel, boolean, text);

create or replace function solicitar_reposicion(
  p_token             uuid,
  p_inventory_id      uuid,
  p_magnitud          magnitud_nivel,
  p_requiere_vehiculo boolean default false,
  p_nota              text    default null,
  p_cantidad          int     default null
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
      'cantidad',          p_cantidad,
      'requiere_vehiculo', coalesce(p_requiere_vehiculo, false),
      'nota',              nullif(trim(p_nota), '')
    ),
    p_token
  );
end;
$$;

grant execute on function solicitar_reposicion(uuid, uuid, magnitud_nivel, boolean, text, int) to anon, authenticated;

-- ===========================================================================
-- 5. responder_solicitud_voluntario: cantidad comprometida opcional. Cambia de
--    firma respecto a 0038 (+p_cantidad) -> drop defensivo de la versión previa.
-- ===========================================================================
drop function if exists responder_solicitud_voluntario(uuid, text, int, uuid);

create or replace function responder_solicitud_voluntario(
  p_solicitud_id     uuid,
  p_magnitud         text,
  p_tiempo_estimado  int,
  p_token_voluntario uuid,
  p_cantidad         int default null
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
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad es obligatoria y debe ser un número entero mayor a cero.';
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

  if v_requiere_veh then
    select techo_peso_kg, techo_volumen_m3 into v_techo_peso, v_techo_vol
    from magnitud_capacidad_referencia where magnitud = p_magnitud;
    if (v_techo_peso is not null and (v_cap_peso is null or v_cap_peso < v_techo_peso))
       or (v_techo_vol is not null and (v_cap_vol is null or v_cap_vol < v_techo_vol)) then
      raise exception 'capacidad_insuficiente: La capacidad de tu vehículo no alcanza para la magnitud que intentas comprometer.';
    end if;
  end if;

  insert into compromisos_voluntario
    (solicitud_id, volunteer_id, magnitud_comprometida, cantidad, tiempo_estimado_minutos, status)
  values
    (p_solicitud_id, v_vol_id, p_magnitud, p_cantidad, p_tiempo_estimado, 'pendiente')
  returning id into v_compromiso_id;

  perform recalcular_status_solicitud(p_solicitud_id);

  return v_compromiso_id;
end;
$$;

grant execute on function responder_solicitud_voluntario(uuid, text, int, uuid, int) to anon, authenticated;

-- ===========================================================================
-- 6. responder_solicitud_nodo: cantidad comprometida opcional. Cambia de firma
--    respecto a 0032 (+p_cantidad) -> drop defensivo de la versión previa.
-- ===========================================================================
drop function if exists responder_solicitud_nodo(uuid, text, boolean, uuid, uuid);

create or replace function responder_solicitud_nodo(
  p_solicitud_id     uuid,
  p_magnitud         text,
  p_tiene_transporte boolean,
  p_token_admin      uuid,
  p_node_id          uuid default null,
  p_cantidad         int  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id        uuid;
  v_node_id       uuid := p_node_id;
  v_sol_status    text;
  v_compromiso_id uuid;
  v_n_nodos       int;
begin
  select id into v_vol_id from volunteers where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_magnitud is null or magnitud_orden(p_magnitud) = 0 then
    raise exception 'La magnitud comprometida no es válida.';
  end if;
  if p_tiene_transporte is null then
    raise exception 'Debes indicar si el nodo aporta transporte.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad es obligatoria y debe ser un número entero mayor a cero.';
  end if;

  if v_node_id is null then
    select count(distinct node_id) into v_n_nodos
    from (
      select na.node_id from node_admins na
        join volunteers v on v.id = na.volunteer_id
        where v.token = p_token_admin and v.activo = true
      union
      select nc.node_id from node_collaborators nc
        join volunteers v on v.id = nc.volunteer_id
        where v.token = p_token_admin and v.activo = true
    ) m;
    if v_n_nodos = 0 then
      raise exception 'no_autorizado';
    elsif v_n_nodos > 1 then
      raise exception 'nodo_ambiguo: Administras varios nodos; indica con cuál te comprometes.';
    end if;
    select node_id into v_node_id
    from (
      select na.node_id from node_admins na
        join volunteers v on v.id = na.volunteer_id
        where v.token = p_token_admin and v.activo = true
      union
      select nc.node_id from node_collaborators nc
        join volunteers v on v.id = nc.volunteer_id
        where v.token = p_token_admin and v.activo = true
    ) m
    limit 1;
  else
    if not es_miembro_nodo_token(v_node_id, p_token_admin) then
      raise exception 'no_autorizado';
    end if;
  end if;

  select status into v_sol_status from solicitudes where id = p_solicitud_id;
  if v_sol_status is null then
    raise exception 'solicitud_inexistente';
  end if;
  if v_sol_status = 'cerrada' then
    raise exception 'solicitud_no_disponible: Esta solicitud ya está cerrada.';
  end if;

  insert into compromisos_nodo
    (solicitud_id, node_id_compromete, magnitud_comprometida, cantidad, tiene_transporte, status)
  values
    (p_solicitud_id, v_node_id, p_magnitud, p_cantidad, p_tiene_transporte, 'comprometido')
  returning id into v_compromiso_id;

  perform recalcular_status_solicitud(p_solicitud_id);

  return v_compromiso_id;
end;
$$;

grant execute on function responder_solicitud_nodo(uuid, text, boolean, uuid, uuid, int) to anon, authenticated;

-- ===========================================================================
-- 7. listar_solicitudes_disponibles: devuelve s.cantidad. Igual que 0048 más
--    la columna s.cantidad.
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
      s.cantidad,
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
-- 8. listar_solicitudes_nodo: devuelve s.cantidad y la cantidad de cada
--    compromiso anidado. Igual que 0048 más esas columnas.
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
        s.cantidad,
        s.requiere_vehiculo,
        s.status,
        greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) as sobrante,
        s.created_at,
        coalesce((
          select json_agg(json_build_object(
            'id', cv.id,
            'magnitud', cv.magnitud_comprometida,
            'cantidad', cv.cantidad,
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
            'cantidad', cn.cantidad,
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
-- 9. listar_solicitudes_para_nodo: devuelve s.cantidad. Igual que 0048 más
--    la columna s.cantidad.
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
  v_radio_metros  double precision := 650000;
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
        s.cantidad,
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
