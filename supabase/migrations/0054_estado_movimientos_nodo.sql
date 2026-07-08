-- 0054_estado_movimientos_nodo.sql
-- Tablero de estado del panel admin: envios que este punto comprometio hacia
-- otros centros y entradas que vienen hacia este punto.

set search_path = public;

create or replace function marcar_compromiso_nodo_enviado(
  p_compromiso_id uuid,
  p_token         uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node_comp uuid;
begin
  select node_id_compromete into v_node_comp
  from compromisos_nodo
  where id = p_compromiso_id
    and tiene_transporte = true
    and status = 'comprometido';

  if v_node_comp is null then
    raise exception 'compromiso_no_enviable: Este compromiso no puede marcarse como enviado.';
  end if;

  if not es_miembro_nodo_token(v_node_comp, p_token) then
    raise exception 'no_autorizado';
  end if;

  update compromisos_nodo
  set status = 'en_camino'
  where id = p_compromiso_id;
end;
$$;

grant execute on function marcar_compromiso_nodo_enviado(uuid, uuid) to anon, authenticated;

create or replace function editar_compromiso_nodo(
  p_compromiso_id uuid,
  p_token         uuid,
  p_cantidad      int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node_comp       uuid;
  v_solicitud_id    uuid;
  v_status          text;
  v_cantidad_actual int;
  v_disponible      int;
  v_transportado    int;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser un numero entero mayor a cero.';
  end if;

  select node_id_compromete, solicitud_id, status, cantidad
    into v_node_comp, v_solicitud_id, v_status, v_cantidad_actual
  from compromisos_nodo
  where id = p_compromiso_id
  for update;

  if v_node_comp is null then
    raise exception 'compromiso_no_encontrado';
  end if;
  if not es_miembro_nodo_token(v_node_comp, p_token) then
    raise exception 'no_autorizado';
  end if;
  if v_status <> 'comprometido' then
    raise exception 'compromiso_no_editable: Solo se puede editar antes de enviarlo o asignarle transporte.';
  end if;

  v_transportado := cantidad_transportada_compromiso_nodo(p_compromiso_id);
  if p_cantidad < v_transportado then
    raise exception 'cantidad_no_disponible: Ya hay % asignados a transporte.', v_transportado;
  end if;

  v_disponible := greatest(
    0,
    coalesce((select cantidad from solicitudes where id = v_solicitud_id), 0)
    - (cantidad_comprometida_nodos(v_solicitud_id) - coalesce(v_cantidad_actual, 0))
  );

  if p_cantidad > v_disponible then
    raise exception 'cantidad_no_disponible: Solo quedan % disponibles para cubrir esta solicitud.', v_disponible;
  end if;

  update compromisos_nodo
  set cantidad = p_cantidad
  where id = p_compromiso_id;

  perform recalcular_status_solicitud(v_solicitud_id);
end;
$$;

grant execute on function editar_compromiso_nodo(uuid, uuid, int) to anon, authenticated;

create or replace function listar_movimientos_nodo(
  p_node_id uuid,
  p_token   uuid
)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_salientes json;
  v_entrantes json;
begin
  if not es_miembro_nodo_token(p_node_id, p_token) then
    raise exception 'no_autorizado';
  end if;

  select coalesce(json_agg(to_json(t) order by t.created_at desc), '[]'::json)
  into v_salientes
  from (
    select
      cn.id,
      cn.solicitud_id,
      cn.node_id_compromete,
      destino.id as node_id_destino,
      destino.nombre as destino_nombre,
      c.name as category_name,
      s.subcategoria,
      s.nota,
      cn.magnitud_comprometida as magnitud,
      cn.cantidad,
      cn.tiene_transporte,
      cn.status,
      cn.created_at,
      cantidad_transportada_compromiso_nodo(cn.id) as cantidad_con_voluntario,
      cantidad_disponible_transporte(cn.id) as cantidad_sin_voluntario,
      (cn.status = 'comprometido') as puede_cancelar,
      (cn.status = 'comprometido') as puede_editar,
      (cn.tiene_transporte = true and cn.status = 'comprometido') as puede_marcar_enviado
    from compromisos_nodo cn
    join solicitudes s on s.id = cn.solicitud_id
    join categories c on c.id = s.category_id
    join centros_acopio destino on destino.id = s.node_id_origen
    where cn.node_id_compromete = p_node_id
      and cn.status in ('comprometido','en_camino','entregado')
  ) t;

  select coalesce(json_agg(to_json(t) order by t.created_at desc), '[]'::json)
  into v_entrantes
  from (
    select
      cn.id,
      cn.solicitud_id,
      cn.node_id_compromete,
      origen.nombre as origen_nombre,
      c.name as category_name,
      s.subcategoria,
      s.nota,
      cn.magnitud_comprometida as magnitud,
      cn.cantidad,
      cn.tiene_transporte,
      cn.status,
      cn.created_at,
      case
        when cn.tiene_transporte then origen.nombre
        when exists (
          select 1 from compromisos_voluntario cv
          where cv.compromiso_nodo_id = cn.id
            and cv.status in ('pendiente','retirado','completado')
        ) then 'Voluntario'
        else 'Sin transporte asignado'
      end as transportista,
      coalesce((
        select json_agg(json_build_object(
          'id', cv.id,
          'nombre', trim(coalesce(v.nombre, '') || ' ' || coalesce(v.apellido, '')),
          'cantidad', cv.cantidad,
          'magnitud', cv.magnitud_comprometida,
          'status', cv.status,
          'reservado_until', cv.reservado_until,
          'retirado_at', cv.retirado_at,
          'entrega_deadline', cv.entrega_deadline
        ) order by cv.created_at)
        from compromisos_voluntario cv
        join volunteers v on v.id = cv.volunteer_id
        where cv.compromiso_nodo_id = cn.id
          and cv.status in ('pendiente','retirado','completado')
      ), '[]'::json) as voluntarios,
      (cn.tiene_transporte = true and cn.status = 'en_camino') as puede_confirmar_recepcion
    from compromisos_nodo cn
    join solicitudes s on s.id = cn.solicitud_id
    join categories c on c.id = s.category_id
    join centros_acopio origen on origen.id = cn.node_id_compromete
    where s.node_id_origen = p_node_id
      and cn.status in ('comprometido','en_camino','entregado')
  ) t;

  return json_build_object(
    'salientes', v_salientes,
    'entrantes', v_entrantes
  );
end;
$$;

grant execute on function listar_movimientos_nodo(uuid, uuid) to anon, authenticated;
