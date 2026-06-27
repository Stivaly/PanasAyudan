-- 0027_destino_detalle_recogedor.sql
-- /mis-recogidas necesita mostrar el destino completo (no solo el nombre):
-- dirección, horario y contacto del centro de acopio, o nombre y descripción
-- de la zona de rescate. Se amplía listar_recogidas_recogedor para devolver
-- 'destino_centro' y 'destino_zona' como objetos en vez de solo el nombre.
-- Cuerpo idéntico a 0026 salvo esos dos campos.

create or replace function listar_recogidas_recogedor(
  p_recogedor_token text
)
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_agg(fila), '[]'::json)
  from (
    select json_build_object(
      'id', r.id,
      'status', r.status,
      'qty_a_buscar', r.qty_a_buscar,
      'confirmada_at', r.confirmada_at,
      'confirmation_deadline', r.confirmation_deadline,
      'reserved_until', r.reserved_until,
      'recogedor_token', r.recogedor_token,
      'whatsapp', v.telefono,
      'destino_centro', case
        when dca.id is not null then json_build_object(
          'nombre', dca.nombre,
          'direccion', dca.direccion,
          'horario', dca.horario,
          'contacto', dca.contacto
        )
        else null
      end,
      'destino_zona', case
        when dzr.id is not null then json_build_object(
          'nombre', dzr.nombre,
          'descripcion', dzr.descripcion
        )
        else null
      end,
      'aporte_item', json_build_object(
        'descripcion', ai.descripcion,
        'category_id', ai.category_id,
        'qty_disponible', ai.qty_disponible,
        'aporte', json_build_object(
          'location_id', a.location_id,
          'location', json_build_object(
            'place_name', l.place_name,
            'descripcion_libre', l.descripcion_libre,
            'estado', e.nombre
          )
        )
      )
    ) as fila
    from recogidas r
    join aporte_items ai on ai.id = r.aporte_item_id
    join aportes a on a.id = ai.aporte_id
    join locations l on l.id = a.location_id
    left join estados e on e.id = l.estado_id
    left join volunteers v on v.id = a.volunteer_id
    left join centros_acopio dca on dca.id = r.destino_centro_acopio_id
    left join zonas_rescate dzr on dzr.id = r.destino_zona_rescate_id
    where r.recogedor_token is not null
      and r.recogedor_token = p_recogedor_token
    order by r.created_at desc
  ) sub;
$$;

grant execute on function listar_recogidas_recogedor(text) to anon, authenticated;
