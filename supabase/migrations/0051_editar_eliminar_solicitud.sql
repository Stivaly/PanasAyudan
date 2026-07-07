-- 0051_editar_eliminar_solicitud.sql
-- Editar y eliminar (cancelar) una solicitud entre nodos.
--
-- Hasta ahora una solicitud solo se podía CREAR (crear_solicitud, 0049) y avanzar
-- por su ciclo de estados; no había forma de corregir un pedido mal cargado
-- (categoría/magnitud/cantidad equivocada) ni de retirarlo. Se agregan dos RPC:
--
--   editar_solicitud   -> reescribe category/subcategory/magnitud/cantidad/
--                         requiere_vehiculo/nota de una solicitud propia.
--   cancelar_solicitud -> elimina una solicitud propia (DELETE; los compromisos
--                         históricos cuelgan de ON DELETE CASCADE de 0032).
--
-- GUARD (invariante de consistencia): ambas solo operan cuando la solicitud está
-- en status 'abierta'. Ese status es, por diseño (recalcular_status_solicitud,
-- 0032), exactamente el que NO tiene ningún compromiso activo de voluntario ni de
-- nodo. Así editar la magnitud/categoría nunca invalida la cobertura ya calculada
-- de un compromiso vivo, y cancelar nunca borra en silencio el compromiso de un
-- voluntario o nodo que ya se anotó. Una solicitud 'parcial'/'en_camino'/
-- 'inventario_asegurado'/'cerrada' se rechaza con mensaje claro.
--
-- Permiso: admin o colaborador del nodo que PUBLICÓ la solicitud (mismo criterio
-- que crear_solicitud), vía es_miembro_nodo_token (0032).
--
-- Idempotente: create or replace. Sin cambios de esquema (reusa columnas de 0048/0049).

set search_path = public;

-- ===========================================================================
-- 1. editar_solicitud: reescribe los datos de una solicitud 'abierta' propia.
--    Reusa la misma forma de p_datos que crear_solicitud (0049) y su validación.
-- ===========================================================================
create or replace function editar_solicitud(
  p_solicitud_id uuid,
  p_datos        jsonb,
  p_token_admin  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id         uuid;
  v_node_origen    uuid;
  v_status         text;
  v_category_id    uuid    := nullif(p_datos ->> 'category_id', '')::uuid;
  v_magnitud       text    := nullif(p_datos ->> 'magnitud', '');
  v_subcategory_id uuid    := nullif(p_datos ->> 'subcategory_id', '')::uuid;
  v_subcategoria   text    := nullif(p_datos ->> 'subcategoria', '');
  v_nota           text    := nullif(left(trim(p_datos ->> 'nota'), 280), '');
  v_cantidad       int     := nullif(p_datos ->> 'cantidad', '')::int;
  v_requiere_veh   boolean := coalesce((p_datos ->> 'requiere_vehiculo')::boolean, false);
  v_sub_cat_id     uuid;
  v_sub_name       text;
begin
  select id into v_vol_id from volunteers where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  select node_id_origen, status into v_node_origen, v_status
  from solicitudes where id = p_solicitud_id;
  if v_node_origen is null then
    raise exception 'solicitud_inexistente';
  end if;

  if not es_miembro_nodo_token(v_node_origen, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  if v_status <> 'abierta' then
    raise exception 'solicitud_no_editable: Solo se puede editar una solicitud abierta y sin compromisos.';
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
  else
    v_subcategoria := null;
  end if;

  update solicitudes set
    category_id       = v_category_id,
    subcategory_id    = v_subcategory_id,
    subcategoria      = v_subcategoria,
    magnitud          = v_magnitud,
    cantidad          = v_cantidad,
    requiere_vehiculo = v_requiere_veh,
    nota              = v_nota
  where id = p_solicitud_id;
end;
$$;

grant execute on function editar_solicitud(uuid, jsonb, uuid) to anon, authenticated;

-- ===========================================================================
-- 2. cancelar_solicitud: elimina una solicitud 'abierta' propia. En 'abierta' no
--    hay compromisos activos (ver guard); el ON DELETE CASCADE de compromisos_*
--    (0032) solo arrastra filas históricas de esa misma solicitud.
-- ===========================================================================
create or replace function cancelar_solicitud(
  p_solicitud_id uuid,
  p_token_admin  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id      uuid;
  v_node_origen uuid;
  v_status      text;
begin
  select id into v_vol_id from volunteers where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  select node_id_origen, status into v_node_origen, v_status
  from solicitudes where id = p_solicitud_id;
  if v_node_origen is null then
    raise exception 'solicitud_inexistente';
  end if;

  if not es_miembro_nodo_token(v_node_origen, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  if v_status <> 'abierta' then
    raise exception 'solicitud_no_cancelable: Solo se puede eliminar una solicitud abierta y sin compromisos.';
  end if;

  delete from solicitudes where id = p_solicitud_id;
end;
$$;

grant execute on function cancelar_solicitud(uuid, uuid) to anon, authenticated;

-- ===========================================================================
-- 3. listar_solicitudes_nodo: expone además subcategory_id para que el panel
--    pueda PRE-SELECCIONAR la subcategoría al editar. Igual que 0049 más esa
--    columna (subcategory_id existe desde 0037/0048; nunca se listaba).
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
        s.subcategory_id,
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
