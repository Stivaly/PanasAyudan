-- Actualiza la RPC publica de solicitudes para que el frontend pueda
-- mostrar el contador aunque aporte_items tenga qty_disponible = 0 y RLS lo oculte.

drop function if exists listar_recogidas_pendientes_lugar(uuid);

create or replace function listar_recogidas_pendientes_lugar(
  p_location_id uuid
)
returns table (
  aporte_item_id uuid,
  category_id uuid,
  category_name text,
  descripcion text,
  qty_a_buscar integer,
  reserved_until timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    r.aporte_item_id,
    ai.category_id,
    c.name as category_name,
    ai.descripcion,
    r.qty_a_buscar,
    r.reserved_until
  from recogidas r
  join aporte_items ai on ai.id = r.aporte_item_id
  join categories c on c.id = ai.category_id
  join aportes a on a.id = ai.aporte_id
  where a.location_id = p_location_id
    and a.status = 'activo'
    and r.status = 'pendiente'
    and r.reserved_until > now()
  order by r.reserved_until asc;
$$;

grant execute on function listar_recogidas_pendientes_lugar(uuid) to anon, authenticated;
