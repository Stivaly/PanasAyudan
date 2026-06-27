-- 0019_confirmacion_entrega.sql
-- Confirmación de entrega por parte del recogedor + estadísticas de impacto.
--
-- El recogedor (anónimo, identificado por su token local) puede confirmar que
-- ya recibió/entregó lo reservado. Esto NO toca el stock; es una señal de
-- impacto y de buena fe. La lectura de recogidas sigue protegida por RLS, así
-- que todo lo que el recogedor necesita pasa por RPC SECURITY DEFINER que
-- valida el token local.

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas en recogidas.
--    recogedor_token ya pudo crearse en 0018; se mantiene idempotente.
-- ---------------------------------------------------------------------------
alter table recogidas add column if not exists recogedor_token       text;
alter table recogidas add column if not exists confirmada_at         timestamptz;
alter table recogidas add column if not exists confirmation_deadline timestamptz;

create index if not exists idx_recogidas_recogedor_token
  on recogidas(recogedor_token);

-- ---------------------------------------------------------------------------
-- 2. reservar_item: ahora recibe p_recogedor_token como parámetro propio y
--    fija un plazo de 24h para confirmar la entrega.
--    Se elimina la firma anterior (3 args) para evitar overloads ambiguos.
-- ---------------------------------------------------------------------------
drop function if exists reservar_item(uuid, int, jsonb);

create or replace function reservar_item(
  p_aporte_item_id  uuid,
  p_qty             int,
  recogida_data     jsonb,  -- { nombre, apellido, cedula, placa_vehiculo, volunteer_id }
  p_recogedor_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disponible  int;
  v_recogida_id uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'La cantidad a buscar debe ser mayor a cero.';
  end if;

  select qty_disponible into v_disponible
  from aporte_items
  where id = p_aporte_item_id
  for update;

  if not found then
    raise exception 'El item no existe.';
  end if;

  if v_disponible < p_qty then
    raise exception 'Stock insuficiente: disponible % , solicitado %.', v_disponible, p_qty;
  end if;

  update aporte_items
    set qty_disponible = qty_disponible - p_qty
  where id = p_aporte_item_id;

  insert into recogidas (
    aporte_item_id, volunteer_id, nombre, apellido, cedula,
    placa_vehiculo, qty_a_buscar, recogedor_token, confirmation_deadline
  )
  values (
    p_aporte_item_id,
    nullif(recogida_data ->> 'volunteer_id', '')::uuid,
    recogida_data ->> 'nombre',
    recogida_data ->> 'apellido',
    recogida_data ->> 'cedula',
    nullif(recogida_data ->> 'placa_vehiculo', ''),
    p_qty,
    nullif(p_recogedor_token, ''),
    now() + interval '24 hours'
  )
  returning id into v_recogida_id;

  return v_recogida_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. confirmar_entrega: el recogedor confirma que recibió lo reservado.
--    Valida que la recogida pertenezca a su token local.
-- ---------------------------------------------------------------------------
create or replace function confirmar_entrega(
  p_recogida_id     uuid,
  p_recogedor_token text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from recogidas
  where id = p_recogida_id
    and recogedor_token is not null
    and recogedor_token = p_recogedor_token;

  if not found then
    raise exception 'no_encontrada';
  end if;

  if v_status <> 'pendiente' and v_status <> 'completada' then
    raise exception 'estado_invalido';
  end if;

  update recogidas
    set confirmada_at = now()
  where id = p_recogida_id;

  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. listar_recogidas_recogedor: todas las recogidas (cualquier status) de un
--    dispositivo por su token local, con el detalle del item/lugar anidado.
--    SECURITY DEFINER porque RLS oculta recogidas al rol anónimo.
-- ---------------------------------------------------------------------------
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
      'aporte_item', json_build_object(
        'descripcion', ai.descripcion,
        'category_id', ai.category_id,
        'aporte', json_build_object(
          'location_id', a.location_id,
          'location', json_build_object('place_name', l.place_name)
        )
      )
    ) as fila
    from recogidas r
    join aporte_items ai on ai.id = r.aporte_item_id
    join aportes a on a.id = ai.aporte_id
    join locations l on l.id = a.location_id
    where r.recogedor_token is not null
      and r.recogedor_token = p_recogedor_token
    order by r.created_at desc
  ) sub;
$$;

-- ---------------------------------------------------------------------------
-- 5. get_estadisticas_impacto: métricas agregadas públicas (sin datos
--    personales). Pública: no expone filas, solo conteos/sumas.
-- ---------------------------------------------------------------------------
create or replace function get_estadisticas_impacto()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'total_recogidas_completadas',
      (select count(*) from recogidas where status = 'completada'),
    'total_recogidas_confirmadas',
      (select count(*) from recogidas where confirmada_at is not null),
    'total_qty_coordinada',
      (select coalesce(sum(qty_a_buscar), 0) from recogidas where status in ('completada', 'pendiente')),
    'total_aportes_activos',
      (select count(*) from aportes where status = 'activo'),
    'lugares_activos',
      (select count(distinct location_id) from aportes where status = 'activo')
  );
$$;

-- ---------------------------------------------------------------------------
-- Grants a los roles públicos de PostgREST.
-- ---------------------------------------------------------------------------
grant execute on function reservar_item(uuid, int, jsonb, text)   to anon, authenticated;
grant execute on function confirmar_entrega(uuid, text)           to anon, authenticated;
grant execute on function listar_recogidas_recogedor(text)        to anon, authenticated;
grant execute on function get_estadisticas_impacto()              to anon, authenticated;
