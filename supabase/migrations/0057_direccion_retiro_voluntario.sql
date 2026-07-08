-- 0057_direccion_retiro_voluntario.sql
-- El panel de voluntario debe mostrar la direccion del centro donde retira,
-- no solo el nombre del centro ni un fallback generico.

set search_path = public;

create or replace function listar_solicitudes_disponibles(p_token_voluntario uuid)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_vol_id       uuid;
  v_tiene_veh    boolean;
  v_tiene_zona   boolean;
  v_solicitudes  json;
  v_compromisos  json;
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
      cn.id,
      s.id as solicitud_id,
      cn.id as compromiso_nodo_id,
      s.node_id_origen,
      destino.nombre as nodo_nombre,
      destino.direccion as nodo_direccion,
      cn.node_id_compromete,
      origen.nombre as nodo_origen_nombre,
      origen.direccion as nodo_origen_direccion,
      s.category_id,
      c.name as category_name,
      s.subcategoria,
      s.nota,
      cn.magnitud_comprometida as magnitud,
      cn.cantidad,
      cantidad_disponible_transporte(cn.id) as cantidad_disponible,
      s.cantidad as cantidad_solicitada,
      s.requiere_vehiculo,
      s.status,
      cn.status as compromiso_status,
      cantidad_disponible_transporte(cn.id) as sobrante,
      cn.created_at,
      exists (
        select 1 from voluntario_zonas vz
        where vz.volunteer_id = v_vol_id
          and vz.expira_at > now()
          and vz.municipio_id in (destino.municipio_id, origen.municipio_id)
      ) as en_rango
    from compromisos_nodo cn
    join solicitudes s on s.id = cn.solicitud_id
    join categories c on c.id = s.category_id
    join centros_acopio destino on destino.id = s.node_id_origen
    join centros_acopio origen on origen.id = cn.node_id_compromete
    where cn.tiene_transporte = false
      and cn.status in ('comprometido','en_camino')
      and s.status <> 'cerrada'
      and (s.requiere_vehiculo = false or coalesce(v_tiene_veh, false) = true)
      and cantidad_disponible_transporte(cn.id) > 0
  ) t;

  select coalesce(json_agg(to_json(t) order by t.created_at desc), '[]'::json)
  into v_compromisos
  from (
    select
      cv.id,
      cv.solicitud_id,
      cv.compromiso_nodo_id,
      s.node_id_origen,
      destino.nombre as nodo_nombre,
      destino.direccion as nodo_direccion,
      cn.node_id_compromete,
      origen.nombre as nodo_origen_nombre,
      origen.direccion as nodo_origen_direccion,
      s.category_id,
      c.name as category_name,
      s.subcategoria,
      s.nota,
      cv.magnitud_comprometida as magnitud,
      cv.cantidad,
      cv.status,
      cv.created_at,
      cv.reservado_until,
      cv.retirado_at,
      cv.entrega_deadline,
      (
        cv.status = 'pendiente'
        and coalesce(cv.reservado_until, cv.created_at + interval '4 hours') < now()
      ) as atrasado_4h,
      (
        cv.status = 'retirado'
        and cv.entrega_deadline < now()
      ) as atrasado_24h
    from compromisos_voluntario cv
    join solicitudes s on s.id = cv.solicitud_id
    left join compromisos_nodo cn on cn.id = cv.compromiso_nodo_id
    join categories c on c.id = s.category_id
    join centros_acopio destino on destino.id = s.node_id_origen
    left join centros_acopio origen on origen.id = cn.node_id_compromete
    where cv.volunteer_id = v_vol_id
      and cv.status in ('pendiente','retirado')
  ) t;

  return json_build_object(
    'requiere_verificacion', not v_tiene_zona,
    'solicitudes', v_solicitudes,
    'compromisos', v_compromisos
  );
end;
$$;

grant execute on function listar_solicitudes_disponibles(uuid) to anon, authenticated;
