-- 0053_voluntario_transportes_parciales.sql
-- Voluntarios transportan inventario ya comprometido por otro centro, no
-- solicitudes abiertas. La disponibilidad se calcula por cantidad real:
-- si un centro ofrece 6 cajas sin transporte y un voluntario toma 3, quedan 3.

set search_path = public, extensions;

alter table compromisos_voluntario
  add column if not exists compromiso_nodo_id uuid references compromisos_nodo(id) on delete cascade,
  add column if not exists reservado_until timestamptz,
  add column if not exists retirado_at timestamptz,
  add column if not exists entrega_deadline timestamptz;

update compromisos_voluntario
set reservado_until = coalesce(reservado_until, created_at + interval '4 hours')
where reservado_until is null;

create index if not exists idx_compromisos_voluntario_compromiso_nodo
  on compromisos_voluntario(compromiso_nodo_id);

do $$
begin
  alter table compromisos_voluntario drop constraint if exists compromisos_voluntario_status_check;
  alter table compromisos_voluntario add constraint compromisos_voluntario_status_check
    check (status in ('pendiente','retirado','completado','incumplido'));
end;
$$;

create or replace function cantidad_comprometida_nodos(p_solicitud_id uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(cn.cantidad), 0)::int
  from compromisos_nodo cn
  where cn.solicitud_id = p_solicitud_id
    and cn.status in ('comprometido','en_camino','entregado');
$$;

grant execute on function cantidad_comprometida_nodos(uuid) to anon, authenticated;

create or replace function cantidad_transportada_compromiso_nodo(p_compromiso_nodo_id uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(cv.cantidad), 0)::int
  from compromisos_voluntario cv
  where cv.compromiso_nodo_id = p_compromiso_nodo_id
    and cv.status in ('pendiente','retirado','completado')
    and (
      cv.status <> 'pendiente'
      or cv.retirado_at is not null
      or coalesce(cv.reservado_until, cv.created_at + interval '4 hours') > now()
    );
$$;

grant execute on function cantidad_transportada_compromiso_nodo(uuid) to anon, authenticated;

create or replace function cantidad_disponible_transporte(p_compromiso_nodo_id uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select greatest(0, coalesce(cn.cantidad, 0) - cantidad_transportada_compromiso_nodo(cn.id))::int
  from compromisos_nodo cn
  where cn.id = p_compromiso_nodo_id
    and cn.tiene_transporte = false
    and cn.status in ('comprometido','en_camino');
$$;

grant execute on function cantidad_disponible_transporte(uuid) to anon, authenticated;

create or replace function recalcular_status_solicitud(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_nodo_transporte boolean;
  v_nodo_sin_transporte boolean;
  v_voluntario boolean;
begin
  select status into v_status from solicitudes where id = p_solicitud_id;
  if v_status is null or v_status = 'cerrada' then
    return;
  end if;

  select exists (
    select 1 from compromisos_nodo
    where solicitud_id = p_solicitud_id
      and status in ('comprometido','en_camino')
      and tiene_transporte = true
  ) into v_nodo_transporte;

  select exists (
    select 1 from compromisos_nodo
    where solicitud_id = p_solicitud_id
      and status in ('comprometido','en_camino')
      and tiene_transporte = false
  ) into v_nodo_sin_transporte;

  select exists (
    select 1 from compromisos_voluntario cv
    where cv.solicitud_id = p_solicitud_id
      and cv.status in ('pendiente','retirado')
      and (
        cv.status <> 'pendiente'
        or cv.retirado_at is not null
        or coalesce(cv.reservado_until, cv.created_at + interval '4 hours') > now()
      )
  ) into v_voluntario;

  update solicitudes set status =
    case
      when v_nodo_transporte     then 'en_camino'
      when v_nodo_sin_transporte then 'inventario_asegurado'
      when v_voluntario          then 'parcial'
      else 'abierta'
    end
  where id = p_solicitud_id;
end;
$$;

grant execute on function recalcular_status_solicitud(uuid) to anon, authenticated;

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
  v_sol_magnitud  text;
  v_sol_cantidad  int;
  v_disponible    int;
  v_compromiso_id uuid;
  v_n_nodos       int;
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

  select status, magnitud, cantidad
    into v_sol_status, v_sol_magnitud, v_sol_cantidad
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
    (solicitud_id, node_id_compromete, magnitud_comprometida, cantidad, tiene_transporte, status)
  values
    (p_solicitud_id, v_node_id, p_magnitud, p_cantidad, p_tiene_transporte, 'comprometido')
  returning id into v_compromiso_id;

  perform recalcular_status_solicitud(p_solicitud_id);

  return v_compromiso_id;
end;
$$;

grant execute on function responder_solicitud_nodo(uuid, text, boolean, uuid, uuid, int) to anon, authenticated;

drop function if exists responder_solicitud_voluntario(uuid, text, int, uuid, int);
drop function if exists responder_solicitud_voluntario(uuid, text, int, uuid, int, uuid);

create or replace function responder_solicitud_voluntario(
  p_solicitud_id        uuid,
  p_magnitud            text,
  p_tiempo_estimado     int,
  p_token_voluntario    uuid,
  p_cantidad            int default null,
  p_compromiso_nodo_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id         uuid;
  v_tiene_veh      boolean;
  v_cap_peso       numeric;
  v_cap_vol        numeric;
  v_sol_status     text;
  v_requiere_veh   boolean;
  v_cn_solicitud   uuid;
  v_cn_magnitud    text;
  v_cn_status      text;
  v_cn_transporte  boolean;
  v_disponible     int;
  v_techo_peso     numeric;
  v_techo_vol      numeric;
  v_compromiso_id  uuid;
begin
  select id, tiene_vehiculo, capacidad_peso_kg, capacidad_volumen_m3
    into v_vol_id, v_tiene_veh, v_cap_peso, v_cap_vol
  from volunteers where token = p_token_voluntario and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad es obligatoria y debe ser un numero entero mayor a cero.';
  end if;
  if p_magnitud is null or magnitud_orden(p_magnitud) = 0 then
    raise exception 'La magnitud comprometida no es valida.';
  end if;

  if p_compromiso_nodo_id is null then
    select cn.id into p_compromiso_nodo_id
    from compromisos_nodo cn
    where cn.solicitud_id = p_solicitud_id
      and cn.tiene_transporte = false
      and cn.status in ('comprometido','en_camino')
      and cantidad_disponible_transporte(cn.id) > 0
    order by cn.created_at
    limit 1;
  end if;

  if p_compromiso_nodo_id is null then
    raise exception 'solicitud_no_disponible: Esta solicitud no tiene inventario pendiente de transporte.';
  end if;

  select cn.solicitud_id, cn.magnitud_comprometida, cn.status, cn.tiene_transporte
    into v_cn_solicitud, v_cn_magnitud, v_cn_status, v_cn_transporte
  from compromisos_nodo cn
  where cn.id = p_compromiso_nodo_id
  for update;

  if v_cn_solicitud is null or v_cn_solicitud <> p_solicitud_id then
    raise exception 'solicitud_no_disponible: El inventario ya no pertenece a esta solicitud.';
  end if;
  if v_cn_transporte = true or v_cn_status not in ('comprometido','en_camino') then
    raise exception 'solicitud_no_disponible: Este inventario no requiere transporte voluntario.';
  end if;
  if p_magnitud <> v_cn_magnitud then
    raise exception 'La magnitud comprometida debe coincidir con el inventario ofrecido.';
  end if;

  select status, requiere_vehiculo into v_sol_status, v_requiere_veh
  from solicitudes
  where id = p_solicitud_id;

  if v_sol_status is null then
    raise exception 'solicitud_inexistente';
  end if;
  if v_sol_status = 'cerrada' then
    raise exception 'solicitud_no_disponible: Esta solicitud ya esta cerrada.';
  end if;

  if v_requiere_veh and not coalesce(v_tiene_veh, false) then
    raise exception 'requiere_vehiculo: Esta solicitud requiere un voluntario con vehiculo; tu perfil no tiene vehiculo registrado.';
  end if;

  if v_requiere_veh then
    select techo_peso_kg, techo_volumen_m3 into v_techo_peso, v_techo_vol
    from magnitud_capacidad_referencia where magnitud = p_magnitud;
    if (v_techo_peso is not null and (v_cap_peso is null or v_cap_peso < v_techo_peso))
       or (v_techo_vol is not null and (v_cap_vol is null or v_cap_vol < v_techo_vol)) then
      raise exception 'capacidad_insuficiente: La capacidad de tu vehiculo no alcanza para la magnitud que intentas comprometer.';
    end if;
  end if;

  v_disponible := cantidad_disponible_transporte(p_compromiso_nodo_id);
  if p_cantidad > v_disponible then
    raise exception 'cantidad_no_disponible: Solo quedan % disponibles para transportar.', v_disponible;
  end if;

  insert into compromisos_voluntario
    (solicitud_id, compromiso_nodo_id, volunteer_id, magnitud_comprometida, cantidad, tiempo_estimado_minutos, status, reservado_until)
  values
    (p_solicitud_id, p_compromiso_nodo_id, v_vol_id, p_magnitud, p_cantidad, coalesce(nullif(p_tiempo_estimado, 0), 240), 'pendiente', now() + interval '4 hours')
  returning id into v_compromiso_id;

  perform recalcular_status_solicitud(p_solicitud_id);

  return v_compromiso_id;
end;
$$;

grant execute on function responder_solicitud_voluntario(uuid, text, int, uuid, int, uuid) to anon, authenticated;

create or replace function marcar_retiro_compromiso(
  p_compromiso_id uuid,
  p_token         uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id uuid;
  v_cn_id  uuid;
begin
  select id into v_vol_id from volunteers where token = p_token and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  update compromisos_voluntario
  set status = 'retirado',
      retirado_at = now(),
      entrega_deadline = now() + interval '24 hours'
  where id = p_compromiso_id
    and volunteer_id = v_vol_id
    and status = 'pendiente'
    and coalesce(reservado_until, created_at + interval '4 hours') > now()
  returning compromiso_nodo_id into v_cn_id;

  if not found then
    raise exception 'compromiso_no_disponible: Este traslado ya vencio o fue resuelto.';
  end if;

  update compromisos_nodo
  set status = 'en_camino'
  where id = v_cn_id
    and status = 'comprometido';
end;
$$;

grant execute on function marcar_retiro_compromiso(uuid, uuid) to anon, authenticated;

create or replace function confirmar_entrega_compromiso(
  p_compromiso_id        uuid,
  p_token_admin_destino  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id        uuid;
  v_solicitud_id  uuid;
  v_node_origen   uuid;
  v_cn_id         uuid;
  v_cn_cantidad   int;
  v_objetivo      int;
  v_entregado     int;
begin
  select id into v_vol_id from volunteers where token = p_token_admin_destino and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  select cv.solicitud_id, s.node_id_origen, cv.compromiso_nodo_id
    into v_solicitud_id, v_node_origen, v_cn_id
  from compromisos_voluntario cv
  join solicitudes s on s.id = cv.solicitud_id
  where cv.id = p_compromiso_id;

  if v_solicitud_id is not null then
    if not es_miembro_nodo_token(v_node_origen, p_token_admin_destino) then
      raise exception 'no_autorizado';
    end if;

    update compromisos_voluntario
    set status = 'completado'
    where id = p_compromiso_id
      and status in ('pendiente','retirado');

    if v_cn_id is not null then
      select cantidad into v_cn_cantidad from compromisos_nodo where id = v_cn_id;
      if (
        select coalesce(sum(cantidad), 0)
        from compromisos_voluntario
        where compromiso_nodo_id = v_cn_id
          and status = 'completado'
      ) >= coalesce(v_cn_cantidad, 0) then
        update compromisos_nodo set status = 'entregado' where id = v_cn_id;
      end if;
    end if;
  else
    select cn.solicitud_id, s.node_id_origen
      into v_solicitud_id, v_node_origen
    from compromisos_nodo cn
    join solicitudes s on s.id = cn.solicitud_id
    where cn.id = p_compromiso_id
      and cn.tiene_transporte = true;

    if v_solicitud_id is null then
      raise exception 'compromiso_no_encontrado';
    end if;
    if not es_miembro_nodo_token(v_node_origen, p_token_admin_destino) then
      raise exception 'no_autorizado';
    end if;

    update compromisos_nodo set status = 'entregado'
      where id = p_compromiso_id and status in ('comprometido','en_camino');
  end if;

  select cantidad into v_objetivo from solicitudes where id = v_solicitud_id;

  select
    coalesce((
      select sum(cv.cantidad)
      from compromisos_voluntario cv
      where cv.solicitud_id = v_solicitud_id
        and cv.status = 'completado'
    ), 0)
    + coalesce((
      select sum(cn.cantidad)
      from compromisos_nodo cn
      where cn.solicitud_id = v_solicitud_id
        and cn.status = 'entregado'
        and cn.tiene_transporte = true
    ), 0)
    into v_entregado;

  if v_entregado >= coalesce(v_objetivo, 0) then
    update solicitudes set status = 'cerrada' where id = v_solicitud_id;
  else
    perform recalcular_status_solicitud(v_solicitud_id);
  end if;
end;
$$;

grant execute on function confirmar_entrega_compromiso(uuid, uuid) to anon, authenticated;

create or replace function confirmar_llegada_compromiso(
  p_compromiso_id uuid,
  p_llego         boolean,
  p_token         uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id     uuid;
  v_solicitud_id uuid;
  v_node_origen  uuid;
  v_vol_owner    uuid;
  v_comp_status  text;
  v_cedula       text;
begin
  if p_llego is null then
    raise exception 'Debes indicar si el voluntario llego.';
  end if;

  select id into v_admin_id from volunteers where token = p_token and activo = true;
  if v_admin_id is null then
    raise exception 'token_invalido';
  end if;

  select cv.solicitud_id, cv.volunteer_id, cv.status, s.node_id_origen
    into v_solicitud_id, v_vol_owner, v_comp_status, v_node_origen
  from compromisos_voluntario cv
  join solicitudes s on s.id = cv.solicitud_id
  where cv.id = p_compromiso_id;

  if v_solicitud_id is not null then
    if not es_miembro_nodo_token(v_node_origen, p_token) then
      raise exception 'no_autorizado';
    end if;

    if p_llego then
      perform confirmar_entrega_compromiso(p_compromiso_id, p_token);
      return;
    end if;

    if v_comp_status not in ('pendiente','retirado') then
      raise exception 'compromiso_no_pendiente';
    end if;

    select cedula into v_cedula from volunteers where id = v_vol_owner;

    update compromisos_voluntario set status = 'incumplido' where id = p_compromiso_id;

    if v_cedula is not null and v_cedula <> '' then
      insert into cedulas_bloqueadas (cedula, compromiso_id, motivo)
      values (v_cedula, p_compromiso_id, 'incumplimiento_compromiso')
      on conflict (cedula) do update
        set compromiso_id = excluded.compromiso_id,
            motivo        = excluded.motivo;
    end if;

    update volunteers set activo = false where id = v_vol_owner;

    perform recalcular_status_solicitud(v_solicitud_id);
    return;
  end if;

  if not p_llego then
    raise exception 'incumplimiento_no_aplica';
  end if;
  perform confirmar_entrega_compromiso(p_compromiso_id, p_token);
end;
$$;

grant execute on function confirmar_llegada_compromiso(uuid, boolean, uuid) to anon, authenticated;

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
      cn.node_id_compromete,
      origen.nombre as nodo_origen_nombre,
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
      cn.node_id_compromete,
      origen.nombre as nodo_origen_nombre,
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
        greatest(0, coalesce(s.cantidad, 0) - cantidad_comprometida_nodos(s.id)) as sobrante,
        s.created_at,
        coalesce((
          select json_agg(json_build_object(
            'id', cv.id,
            'compromiso_nodo_id', cv.compromiso_nodo_id,
            'magnitud', cv.magnitud_comprometida,
            'cantidad', cv.cantidad,
            'tiempo_estimado_minutos', cv.tiempo_estimado_minutos,
            'status', cv.status,
            'created_at', cv.created_at,
            'reservado_until', cv.reservado_until,
            'retirado_at', cv.retirado_at,
            'entrega_deadline', cv.entrega_deadline,
            'atrasado_4h', (
              cv.status = 'pendiente'
              and coalesce(cv.reservado_until, cv.created_at + interval '4 hours') < now()
            ),
            'atrasado_24h', (
              cv.status = 'retirado'
              and cv.entrega_deadline < now()
            )
          ) order by cv.created_at)
          from compromisos_voluntario cv where cv.solicitud_id = s.id
        ), '[]'::json) as compromisos_voluntario,
        coalesce((
          select json_agg(json_build_object(
            'id', cn.id,
            'magnitud', cn.magnitud_comprometida,
            'cantidad', cn.cantidad,
            'cantidad_disponible_transporte', cantidad_disponible_transporte(cn.id),
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
  v_origen geography;
  v_radio_metros int := 650000;
begin
  if not es_miembro_nodo_token(p_node_id, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  select st_setsrid(st_makepoint(lng, lat), 4326)::geography
  into v_origen
  from centros_acopio
  where id = p_node_id
    and lat is not null
    and lng is not null;

  if v_origen is null then
    return '[]'::json;
  end if;

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
        greatest(0, coalesce(s.cantidad, 0) - cantidad_comprometida_nodos(s.id)) as sobrante,
        round((
          st_distance(
            v_origen,
            st_setsrid(st_makepoint(ca.lng, ca.lat), 4326)::geography
          ) / 1000
        )::numeric, 1)::float as distancia_km,
        s.created_at
      from solicitudes s
      join categories c on c.id = s.category_id
      join centros_acopio ca on ca.id = s.node_id_origen
      where s.node_id_origen <> p_node_id
        and s.status in ('abierta','parcial','inventario_asegurado')
        and greatest(0, coalesce(s.cantidad, 0) - cantidad_comprometida_nodos(s.id)) > 0
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
