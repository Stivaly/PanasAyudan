-- 0020_fix_confirmacion_flujo.sql
-- Corrige el flujo de confirmación de entrega:
--   * El plazo de confirmación (confirmation_deadline) NO arranca al reservar,
--     sino cuando el VOLUNTARIO marca la recogida como completada.
--   * La confirmación de entrega la hace el VOLUNTARIO (con su volunteer-token),
--     no el recogedor.

DROP FUNCTION IF EXISTS reservar_item(uuid, int, jsonb, text);
DROP FUNCTION IF EXISTS completar_recogida(uuid, text);
DROP FUNCTION IF EXISTS confirmar_entrega(uuid, text);
DROP FUNCTION IF EXISTS listar_recogidas_pendientes_voluntario();

-- ---------------------------------------------------------------------------
-- 1. reservar_item: ya NO setea confirmation_deadline (queda NULL al reservar).
-- ---------------------------------------------------------------------------
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
    placa_vehiculo, qty_a_buscar, recogedor_token
  )
  values (
    p_aporte_item_id,
    nullif(recogida_data ->> 'volunteer_id', '')::uuid,
    recogida_data ->> 'nombre',
    recogida_data ->> 'apellido',
    recogida_data ->> 'cedula',
    nullif(recogida_data ->> 'placa_vehiculo', ''),
    p_qty,
    nullif(p_recogedor_token, '')
  )
  returning id into v_recogida_id;

  return v_recogida_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. completar_recogida: al completar, arranca el plazo de confirmación (24h).
--    Se reemplaza la firma (uuid, uuid) por (uuid, text).
-- ---------------------------------------------------------------------------
drop function if exists completar_recogida(uuid, uuid);

create or replace function completar_recogida(
  p_recogida_id     uuid,
  p_volunteer_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_volunteer_id uuid;
begin
  select id into v_volunteer_id
  from volunteers
  where token = p_volunteer_token::uuid
    and token = current_volunteer_token()
    and activo = true;

  if v_volunteer_id is null then
    raise exception 'Token de voluntario invalido o inactivo.';
  end if;

  update recogidas r
    set status = 'completada',
        confirmation_deadline = now() + interval '24 hours'
  from aporte_items ai
  join aportes a on a.id = ai.aporte_id
  where r.id = p_recogida_id
    and r.aporte_item_id = ai.id
    and r.status = 'pendiente'
    and a.volunteer_id = v_volunteer_id;

  if not found then
    raise exception 'La recogida no existe, no esta pendiente o no pertenece a tus aportes.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. confirmar_entrega: ahora la confirma el VOLUNTARIO con su token.
--    Mantiene la firma (uuid, text); cambia la semántica del 2º parámetro.
-- ---------------------------------------------------------------------------
create or replace function confirmar_entrega(
  p_recogida_id     uuid,
  p_volunteer_token text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   text;
  v_deadline timestamptz;
begin
  if not exists (
    select 1 from volunteers
    where token = p_volunteer_token::uuid and activo = true
  ) then
    raise exception 'token_invalido';
  end if;

  select status, confirmation_deadline
    into v_status, v_deadline
  from recogidas
  where id = p_recogida_id;

  if not found then
    raise exception 'no_encontrada';
  end if;

  if v_status <> 'completada' or v_deadline is null then
    raise exception 'estado_invalido';
  end if;

  if v_deadline < now() then
    raise exception 'plazo_vencido';
  end if;

  update recogidas
    set confirmada_at = now()
  where id = p_recogida_id;

  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. listar_recogidas_pendientes_voluntario: ahora incluye también las
--    completadas (para poder confirmarlas / ver su estado) y expone
--    confirmation_deadline y confirmada_at. Las pendientes van primero.
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
    and r.status in ('pendiente', 'completada')
  order by (r.status = 'pendiente') desc, r.reserved_until asc;
$$;

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
grant execute on function reservar_item(uuid, int, jsonb, text)        to anon, authenticated;
grant execute on function completar_recogida(uuid, text)               to anon, authenticated;
grant execute on function confirmar_entrega(uuid, text)                to anon, authenticated;
grant execute on function listar_recogidas_pendientes_voluntario()     to anon, authenticated;
