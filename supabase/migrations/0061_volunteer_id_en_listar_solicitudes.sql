-- 0061_volunteer_id_en_listar_solicitudes.sql
-- Cambios para el filtrado de la suscripcion Realtime del voluntario (issue #83):
--
-- 1) Expone volunteer_id en la respuesta de listar_solicitudes_disponibles para
--    que el frontend pueda filtrar su suscripcion Realtime de compromisos_voluntario
--    por dueno, sin exponer nada nuevo a otros voluntarios: cada quien solo
--    recibe su propio id, resuelto igual que hoy a partir de su token.
--
-- 2) Reduce el rango operativo del voluntario en verificar_ubicacion_voluntario:
--      * con vehiculo registrado: maximo 40 km (antes 650 km)
--      * sin vehiculo (a pie):    maximo 15 km (antes 300 km)
--    MOTIVO: la opcion elegida para filtrar solicitudes/compromisos_nodo por
--    Realtime es una lista de IDs de nodo dentro del rango del voluntario
--    (voluntario_zonas). Con 650/300 km esa lista terminaba incluyendo
--    virtualmente todo el pais, volviendo el filtro inutil. Un radio realista
--    de cuanto puede recorrer una persona para retirar/entregar insumos hace
--    que la lista de nodos relevantes sea efectivamente chica, que es
--    precondicion para que el filtro de Realtime reduzca trafico de verdad.
--
-- 3) Agrega nodos_en_rango a la respuesta de listar_solicitudes_disponibles:
--    los IDs de centros_acopio cuyo municipio esta en la zona vigente del
--    voluntario. El frontend usa esta lista para filtrar su suscripcion
--    Realtime de la tabla `solicitudes` por node_id_origen=in.(...), en vez
--    de escuchar cambios de solicitudes de cualquier nodo del pais.
--
-- 4) Agrega compromisos_nodo.node_id_destino (copia de solicitudes.node_id_origen
--    al momento de crear el compromiso). MOTIVO: sin esta columna, filtrar
--    Realtime de compromisos_nodo por "el nodo que pidio esta en mi rango"
--    solo era posible de forma indirecta, via el UPDATE que
--    recalcular_status_solicitud hace sobre `solicitudes` como efecto
--    secundario. Eso funciona hoy porque todas las rutas que tocan
--    compromisos_nodo llaman esa funcion, pero es una convencion implicita,
--    no una garantia estructural. Con node_id_destino, compromisos_nodo puede
--    filtrarse directamente por cualquiera de sus dos lados (quien surte,
--    quien pidio), igual que las otras dos tablas. node_id_origen de
--    solicitudes nunca se actualiza tras crearse (no hay ningun UPDATE que la
--    toque en todo el proyecto), asi que copiarla una sola vez al insertar el
--    compromiso es suficiente: nunca queda desactualizada.

set search_path = public, extensions;

create or replace function listar_solicitudes_disponibles(p_token_voluntario uuid)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_vol_id         uuid;
  v_tiene_veh      boolean;
  v_tiene_zona     boolean;
  v_solicitudes    json;
  v_compromisos    json;
  v_nodos_en_rango json;
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

  select coalesce(json_agg(ca.id), '[]'::json)
  into v_nodos_en_rango
  from centros_acopio ca
  where ca.municipio_id in (
    select vz.municipio_id from voluntario_zonas vz
    where vz.volunteer_id = v_vol_id and vz.expira_at > now()
  );

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
    'volunteer_id', v_vol_id,
    'nodos_en_rango', v_nodos_en_rango,
    'solicitudes', v_solicitudes,
    'compromisos', v_compromisos
  );
end;
$$;

grant execute on function listar_solicitudes_disponibles(uuid) to anon, authenticated;

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
  v_tiene_vehiculo   boolean;
  v_municipio_id     uuid;
  v_municipio_nombre text;
  v_punto            geometry;
  v_expira           timestamptz;
  v_radio_metros     double precision;
begin
  select id, tiene_vehiculo
  into v_vol_id, v_tiene_vehiculo
  from volunteers
  where token = p_token
    and activo = true;

  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'coordenadas_invalidas';
  end if;

  v_radio_metros := case when coalesce(v_tiene_vehiculo, false) then 40000 else 15000 end;
  v_punto := st_setsrid(st_makepoint(p_lng, p_lat), 4326);

  select m.id, m.nombre
  into v_municipio_id, v_municipio_nombre
  from municipios m
  where st_contains(m.geom, v_punto)
  limit 1;

  if v_municipio_id is null then
    raise exception 'fuera_de_venezuela';
  end if;

  v_expira := now() + interval '24 hours';

  delete from voluntario_zonas where volunteer_id = v_vol_id;

  insert into voluntario_zonas (volunteer_id, municipio_id, expira_at)
  select v_vol_id, m.id, v_expira
  from municipios m
  where st_dwithin(m.geom::geography, v_punto::geography, v_radio_metros);

  return json_build_object(
    'municipio', v_municipio_nombre,
    'municipio_id', v_municipio_id,
    'expira_at', v_expira,
    'radio_km', (v_radio_metros / 1000)::int,
    'municipios_en_rango', coalesce((
      select json_agg(m.nombre order by m.nombre)
      from voluntario_zonas vz
      join municipios m on m.id = vz.municipio_id
      where vz.volunteer_id = v_vol_id
    ), '[]'::json)
  );
end;
$$;

grant execute on function verificar_ubicacion_voluntario(uuid, float, float) to anon, authenticated;

-- --- compromisos_nodo.node_id_destino ---------------------------------------
alter table compromisos_nodo
  add column if not exists node_id_destino uuid references centros_acopio(id);

update compromisos_nodo cn
set node_id_destino = s.node_id_origen
from solicitudes s
where s.id = cn.solicitud_id
  and cn.node_id_destino is null;

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
  v_vol_id           uuid;
  v_node_id          uuid := p_node_id;
  v_sol_status       text;
  v_sol_magnitud     text;
  v_sol_cantidad     int;
  v_sol_node_destino uuid;
  v_disponible       int;
  v_compromiso_id    uuid;
  v_n_nodos          int;
begin
  select id into v_vol_id from volunteers where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_magnitud is null or magnitud_orden(p_magnitud) = 0 then
    raise exception 'La magnitud comprometida no es valida.';
  end if;
  if p_tiene_transporte is null then
    raise exception 'Debes indicar si el nodo aporta transporte.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad es obligatoria y debe ser un numero entero mayor a cero.';
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
      raise exception 'nodo_ambiguo: Administras varios nodos; indica con cual te comprometes.';
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
  elsif not es_miembro_nodo_token(v_node_id, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  select status, magnitud, cantidad, node_id_origen
    into v_sol_status, v_sol_magnitud, v_sol_cantidad, v_sol_node_destino
  from solicitudes
  where id = p_solicitud_id
  for update;

  if v_sol_status is null then
    raise exception 'solicitud_inexistente';
  end if;
  if v_sol_status = 'cerrada' then
    raise exception 'solicitud_no_disponible: Esta solicitud ya esta cerrada.';
  end if;
  if p_magnitud <> v_sol_magnitud then
    raise exception 'La magnitud comprometida debe coincidir con la solicitud.';
  end if;

  v_disponible := greatest(0, coalesce(v_sol_cantidad, 0) - cantidad_comprometida_nodos(p_solicitud_id));
  if p_cantidad > v_disponible then
    raise exception 'cantidad_no_disponible: Solo quedan % disponibles para cubrir esta solicitud.', v_disponible;
  end if;

  insert into compromisos_nodo
    (solicitud_id, node_id_compromete, node_id_destino, magnitud_comprometida, cantidad, tiene_transporte, status)
  values
    (p_solicitud_id, v_node_id, v_sol_node_destino, p_magnitud, p_cantidad, p_tiene_transporte, 'comprometido')
  returning id into v_compromiso_id;

  perform recalcular_status_solicitud(p_solicitud_id);

  return v_compromiso_id;
end;
$$;

grant execute on function responder_solicitud_nodo(uuid, text, boolean, uuid, uuid, int) to anon, authenticated;
