-- Lista los aportes publicados por el voluntario autenticado con volunteer-token.
-- Permite ver sus propios aportes aunque algun item tenga qty_disponible = 0.

create or replace function listar_aportes_voluntario()
returns table (
  aporte_id uuid,
  location_id uuid,
  place_name text,
  address text,
  descripcion_lugar text,
  item_id uuid,
  category_name text,
  item_descripcion text,
  qty_approx integer,
  qty_disponible integer,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    a.id as aporte_id,
    l.id as location_id,
    l.place_name,
    l.address,
    l.descripcion_libre as descripcion_lugar,
    ai.id as item_id,
    c.name as category_name,
    ai.descripcion as item_descripcion,
    ai.qty_approx,
    ai.qty_disponible,
    a.created_at
  from volunteers v
  join aportes a on a.volunteer_id = v.id
  join locations l on l.id = a.location_id
  join aporte_items ai on ai.aporte_id = a.id
  join categories c on c.id = ai.category_id
  where v.token = current_volunteer_token()
    and v.activo = true
    and a.status = 'activo'
  order by a.created_at desc, ai.descripcion asc;
$$;

grant execute on function listar_aportes_voluntario() to anon, authenticated;
