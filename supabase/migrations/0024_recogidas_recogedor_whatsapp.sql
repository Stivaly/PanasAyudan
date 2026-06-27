-- 0024_recogidas_recogedor_whatsapp.sql
-- /mis-recogidas ahora muestra el botón para contactar al voluntario por
-- WhatsApp. Se amplía listar_recogidas_recogedor para exponer el teléfono del
-- voluntario dueño del aporte. Cuerpo idéntico a 0022 + el campo 'whatsapp'.

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
    where r.recogedor_token is not null
      and r.recogedor_token = p_recogedor_token
    order by r.created_at desc
  ) sub;
$$;

grant execute on function listar_recogidas_recogedor(text) to anon, authenticated;
