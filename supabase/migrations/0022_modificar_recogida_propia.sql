-- 0022_modificar_recogida_propia.sql
-- El recogedor puede modificar su propia reserva pendiente desde /mis-recogidas:
--   * cancelar_recogida_propia: cancela y libera el stock (solo si sigue pendiente).
--   * reducir_qty_recogida: reduce la cantidad reservada y devuelve la diferencia al stock.
-- Ambas se autentican por recogedor_token (token local del dispositivo), no por
-- volunteer-token: no tocan el flujo de voluntarios.

-- ---------------------------------------------------------------------------
-- 1. cancelar_recogida_propia: el recogedor cancela su reserva pendiente.
-- ---------------------------------------------------------------------------
create or replace function cancelar_recogida_propia(
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
    and recogedor_token = p_recogedor_token;

  if not found then
    raise exception 'no_encontrada';
  end if;

  if v_status = 'completada' then
    raise exception 'ya_completada';
  end if;

  if v_status = 'cancelada' then
    raise exception 'ya_cancelada';
  end if;

  -- status = 'pendiente': liberar_recogida cancela y restaura qty_disponible.
  perform liberar_recogida(p_recogida_id);

  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. modificar_qty_recogida: el recogedor cambia la cantidad reservada, hacia
--    arriba o hacia abajo. El tope es el stock total del item (lo que ya tenía
--    reservado + lo que queda disponible). La diferencia se ajusta contra
--    qty_disponible. Todo en una transacción.
-- ---------------------------------------------------------------------------
drop function if exists reducir_qty_recogida(uuid, int, text);

create or replace function modificar_qty_recogida(
  p_recogida_id     uuid,
  p_nueva_qty       int,
  p_recogedor_token text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id     uuid;
  v_qty         int;
  v_disponible  int;
  v_diferencia  int;
begin
  select aporte_item_id, qty_a_buscar
    into v_item_id, v_qty
  from recogidas
  where id = p_recogida_id
    and recogedor_token = p_recogedor_token
    and status = 'pendiente'
  for update;

  if not found then
    raise exception 'no_modificable';
  end if;

  if p_nueva_qty <= 0 then
    raise exception 'cantidad_invalida';
  end if;

  -- Sin cambios: nada que hacer.
  if p_nueva_qty = v_qty then
    return json_build_object('ok', true, 'nueva_qty', p_nueva_qty);
  end if;

  -- Bloquea el item y lee el stock disponible actual.
  select qty_disponible into v_disponible
  from aporte_items
  where id = v_item_id
  for update;

  -- diferencia > 0 => aumenta la reserva (resta del disponible).
  -- diferencia < 0 => reduce la reserva (devuelve al disponible).
  v_diferencia := p_nueva_qty - v_qty;

  if v_diferencia > v_disponible then
    raise exception 'stock_insuficiente';
  end if;

  update aporte_items
    set qty_disponible = qty_disponible - v_diferencia
  where id = v_item_id;

  update recogidas
    set qty_a_buscar = p_nueva_qty
  where id = p_recogida_id;

  return json_build_object('ok', true, 'nueva_qty', p_nueva_qty);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. listar_recogidas_recogedor: se amplía para exponer qty_disponible del
--    item, de modo que /mis-recogidas conozca el tope al modificar la cantidad
--    (tope = qty_a_buscar + qty_disponible).
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
    where r.recogedor_token is not null
      and r.recogedor_token = p_recogedor_token
    order by r.created_at desc
  ) sub;
$$;

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
grant execute on function cancelar_recogida_propia(uuid, text)      to anon, authenticated;
grant execute on function modificar_qty_recogida(uuid, int, text)   to anon, authenticated;
grant execute on function listar_recogidas_recogedor(text)          to anon, authenticated;
