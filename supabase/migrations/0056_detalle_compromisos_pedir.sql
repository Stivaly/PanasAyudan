-- 0056_detalle_compromisos_pedir.sql
-- La pestaña Pedir es de planificación: muestra quién comprometió y cuánto,
-- sin acciones operativas de seguimiento.

set search_path = public;

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
            'nombre', trim(coalesce(v.nombre, '') || ' ' || coalesce(v.apellido, '')),
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
          from compromisos_voluntario cv
          join volunteers v on v.id = cv.volunteer_id
          where cv.solicitud_id = s.id
        ), '[]'::json) as compromisos_voluntario,
        coalesce((
          select json_agg(json_build_object(
            'id', cn.id,
            'nodo_nombre', ca.nombre,
            'magnitud', cn.magnitud_comprometida,
            'cantidad', cn.cantidad,
            'cantidad_disponible_transporte', cantidad_disponible_transporte(cn.id),
            'tiene_transporte', cn.tiene_transporte,
            'status', cn.status,
            'node_id_compromete', cn.node_id_compromete,
            'created_at', cn.created_at
          ) order by cn.created_at)
          from compromisos_nodo cn
          join centros_acopio ca on ca.id = cn.node_id_compromete
          where cn.solicitud_id = s.id
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
