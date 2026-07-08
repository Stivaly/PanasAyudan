-- 0052_aprobacion_no_verifica_gps.sql
-- Corrige 0044: aprobar una solicitud registra el centro como vigente, pero NO
-- debe marcar como verificada la ubicacion GPS. La verificacion fisica sigue
-- siendo una accion explicita del admin desde el punto.

-- Revertir verificaciones artificiales creadas por 0044. En esa migracion
-- centros_acopio.verificado_at y node_admins.verificado_at quedaron con el mismo
-- now() dentro de la transaccion. Si el admin verifico realmente despues, su
-- node_admins.verificado_at queda posterior y no entra en este filtro.
update node_admins na
set verificado = false,
    verificado_at = null
from centros_acopio c
join solicitudes_registro_nodo s on s.node_id = c.id
where na.node_id = c.id
  and s.status = 'aprobada'
  and na.verificado = true
  and na.verificado_at is not null
  and c.verificado_at is not null
  and abs(extract(epoch from (na.verificado_at - c.verificado_at))) < 1;

update centros_acopio c
set verificado_at = null
from solicitudes_registro_nodo s
where s.node_id = c.id
  and s.status = 'aprobada'
  and c.verificado_at is not null
  and not exists (
    select 1 from node_admins na
    where na.node_id = c.id
      and na.verificado = true
  );

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

  -- Vigente en listas por estado, pero pendiente de verificacion GPS.
  update centros_acopio
  set status = 'activo',
      activo = true,
      verificado_at = null
  where id = v_node_id;

  update node_admins
  set verificado = false,
      verificado_at = null
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
