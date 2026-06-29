-- 0029_editar_eliminar_aporte_item.sql
-- Permite al voluntario dueño editar o eliminar sus aporte_items.
--   * editar_aporte_item: edita descripcion / categoria / qty_approx con guardas
--     sobre las reservas ya comprometidas.
--   * eliminar_aporte_item: borra el item si no tiene historial; si tiene
--     recogidas completadas/canceladas hace borrado logico (activo = false);
--     si tiene recogidas pendientes lo bloquea.
-- Se agrega aporte_items.activo para el borrado logico y se filtra en todas las
-- lecturas (RLS publica y RPCs) para no exponer items eliminados.

-- ---------------------------------------------------------------------------
-- 1. Columna de borrado logico.
-- ---------------------------------------------------------------------------
alter table aporte_items
  add column if not exists activo boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. RLS publica de aporte_items: ocultar items eliminados (activo = false).
-- ---------------------------------------------------------------------------
drop policy if exists aporte_items_select_public on aporte_items;

create policy aporte_items_select_public
  on aporte_items for select
  to anon, authenticated
  using (qty_disponible > 0 and activo is true);

-- ---------------------------------------------------------------------------
-- 3. editar_aporte_item: edita descripcion, category_id y/o qty_approx.
--    Solo el voluntario dueño del aporte puede hacerlo. No permite reducir
--    qty_approx por debajo de lo ya comprometido (reservas + entregas).
-- ---------------------------------------------------------------------------
create or replace function editar_aporte_item(
  p_item_id         uuid,
  p_volunteer_token text,
  p_nuevos_datos    jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_volunteer_id uuid;
  v_old_qty      int;
  v_old_disp     int;
  v_reservado    int;
  v_new_qty      int;
  v_new_disp     int;
  v_new_desc     text;
  v_new_cat      uuid;
begin
  -- Voluntario activo con ese token.
  select id into v_volunteer_id
  from volunteers
  where token = p_volunteer_token::uuid
    and activo = true;
  if v_volunteer_id is null then
    raise exception 'no_autorizado';
  end if;

  -- El item debe pertenecer a un aporte de ese voluntario.
  select ai.qty_approx, ai.qty_disponible
    into v_old_qty, v_old_disp
  from aporte_items ai
  join aportes a on a.id = ai.aporte_id
  where ai.id = p_item_id
    and a.volunteer_id = v_volunteer_id;
  if not found then
    raise exception 'no_autorizado';
  end if;

  -- Cantidad ya comprometida (reservada pendiente + entregada).
  v_reservado := v_old_qty - v_old_disp;

  -- Campos nuevos (parciales: si no vienen, se mantienen los actuales).
  v_new_desc := p_nuevos_datos ->> 'descripcion';
  v_new_cat  := nullif(p_nuevos_datos ->> 'category_id', '')::uuid;
  v_new_qty  := coalesce((p_nuevos_datos ->> 'qty_approx')::int, v_old_qty);

  -- No se puede reducir qty_approx por debajo de lo ya comprometido.
  if v_new_qty < v_reservado then
    raise exception 'qty_invalida';
  end if;

  -- Recalcular disponible solo si cambia qty_approx.
  if v_new_qty <> v_old_qty then
    v_new_disp := v_new_qty - v_reservado;
  else
    v_new_disp := v_old_disp;
  end if;

  update aporte_items
    set descripcion    = coalesce(v_new_desc, descripcion),
        category_id    = coalesce(v_new_cat, category_id),
        qty_approx     = v_new_qty,
        qty_disponible = v_new_disp
  where id = p_item_id;

  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. eliminar_aporte_item: borrado fisico o logico segun historial.
-- ---------------------------------------------------------------------------
create or replace function eliminar_aporte_item(
  p_item_id         uuid,
  p_volunteer_token text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_volunteer_id uuid;
  v_existe       boolean;
  v_tiene_pend   boolean;
  v_tiene_hist   boolean;
begin
  -- Voluntario activo con ese token.
  select id into v_volunteer_id
  from volunteers
  where token = p_volunteer_token::uuid
    and activo = true;
  if v_volunteer_id is null then
    raise exception 'no_autorizado';
  end if;

  -- El item debe pertenecer a un aporte de ese voluntario.
  select exists (
    select 1
    from aporte_items ai
    join aportes a on a.id = ai.aporte_id
    where ai.id = p_item_id
      and a.volunteer_id = v_volunteer_id
  ) into v_existe;
  if not v_existe then
    raise exception 'no_autorizado';
  end if;

  -- Bloquea si hay recogidas pendientes sobre el item.
  select exists (
    select 1 from recogidas
    where aporte_item_id = p_item_id and status = 'pendiente'
  ) into v_tiene_pend;
  if v_tiene_pend then
    raise exception 'tiene_recogidas_pendientes';
  end if;

  -- Si tiene historial (completadas/canceladas): borrado logico.
  select exists (
    select 1 from recogidas
    where aporte_item_id = p_item_id
      and status in ('completada', 'cancelada')
  ) into v_tiene_hist;

  if v_tiene_hist then
    update aporte_items
      set qty_disponible = 0,
          activo = false
    where id = p_item_id;
  else
    delete from aporte_items where id = p_item_id;
  end if;

  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. listar_recogidas_pendientes_voluntario: excluir items eliminados.
--    Misma definicion de 0020 + filtro ai.activo is true.
-- ---------------------------------------------------------------------------
drop function if exists listar_recogidas_pendientes_voluntario();

create or replace function listar_recogidas_pendientes_voluntario()
returns table (
  id uuid,
  aporte_item_id uuid,
  volunteer_id uuid,
  nombre text,
  apellido text,
  cedula text,
  placa_vehiculo text,
  qty_a_buscar integer,
  status text,
  reserved_until timestamptz,
  confirmation_deadline timestamptz,
  confirmada_at timestamptz,
  created_at timestamptz,
  descripcion text,
  place_name text,
  location_id uuid,
  aporte_id uuid,
  lat double precision,
  lng double precision
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.aporte_item_id,
    r.volunteer_id,
    r.nombre,
    r.apellido,
    r.cedula,
    r.placa_vehiculo,
    r.qty_a_buscar,
    r.status,
    r.reserved_until,
    r.confirmation_deadline,
    r.confirmada_at,
    r.created_at,
    ai.descripcion,
    l.place_name,
    l.id as location_id,
    a.id as aporte_id,
    l.lat,
    l.lng
  from volunteers v
  join aportes a on a.volunteer_id = v.id
  join locations l on l.id = a.location_id
  join aporte_items ai on ai.aporte_id = a.id
  join recogidas r on r.aporte_item_id = ai.id
  where v.token = current_volunteer_token()
    and v.activo = true
    and ai.activo is true
    and r.status in ('pendiente', 'completada')
  order by (r.status = 'pendiente') desc, r.reserved_until asc;
$$;

-- ---------------------------------------------------------------------------
-- 6. listar_aportes_voluntario: expone aporte_status (para gestionar items de
--    aportes cerrados) e incluye tanto activos como cerrados. Excluye items
--    eliminados (ai.activo). Los aportes activos van primero.
-- ---------------------------------------------------------------------------
drop function if exists listar_aportes_voluntario();

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
  aporte_status text,
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
    a.status as aporte_status,
    a.created_at
  from volunteers v
  join aportes a on a.volunteer_id = v.id
  join locations l on l.id = a.location_id
  join aporte_items ai on ai.aporte_id = a.id
  join categories c on c.id = ai.category_id
  where v.token = current_volunteer_token()
    and v.activo = true
    and ai.activo is true
  order by (a.status = 'activo') desc, a.created_at desc, ai.descripcion asc;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants.
-- ---------------------------------------------------------------------------
grant execute on function editar_aporte_item(uuid, text, jsonb)         to anon, authenticated;
grant execute on function eliminar_aporte_item(uuid, text)              to anon, authenticated;
grant execute on function listar_recogidas_pendientes_voluntario()      to anon, authenticated;
grant execute on function listar_aportes_voluntario()                   to anon, authenticated;
