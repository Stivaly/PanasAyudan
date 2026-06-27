-- 0023_cedulas_bloqueadas.sql
-- Bloqueo de cédulas que reservaron y no fueron a buscar:
--   * Tabla cedulas_bloqueadas + función que las detecta y un job pg_cron.
--   * reservar_item rechaza cédulas bloqueadas antes de verificar stock.

-- ---------------------------------------------------------------------------
-- 1. Tabla cedulas_bloqueadas.
-- ---------------------------------------------------------------------------
create table if not exists cedulas_bloqueadas (
  id           uuid primary key default gen_random_uuid(),
  cedula       text not null,
  recogida_id  uuid references recogidas(id),
  bloqueada_at timestamptz default now(),
  motivo       text default 'no_fue_a_buscar',
  unique (cedula)
);

alter table cedulas_bloqueadas enable row level security;

-- SELECT público: cualquiera puede consultar si una cédula está bloqueada.
drop policy if exists cedulas_bloqueadas_select_public on cedulas_bloqueadas;
create policy cedulas_bloqueadas_select_public
  on cedulas_bloqueadas for select
  using (true);

-- No hay policy de INSERT: solo la función security definer puede insertar.

-- ---------------------------------------------------------------------------
-- 2. bloquear_cedulas_sin_confirmacion: detecta recogidas pendientes vencidas
--    y bloquea su cédula. Las completadas NO se tocan.
-- ---------------------------------------------------------------------------
create or replace function bloquear_cedulas_sin_confirmacion()
returns void
language sql
security definer
set search_path = public
as $$
  insert into cedulas_bloqueadas (cedula, recogida_id, motivo)
  select distinct on (r.cedula) r.cedula, r.id, 'no_fue_a_buscar'
  from recogidas r
  where r.status = 'pendiente'
    and r.reserved_until < now()
    and r.cedula is not null
    and r.cedula not in (select cedula from cedulas_bloqueadas);
$$;

grant execute on function bloquear_cedulas_sin_confirmacion() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Job pg_cron: cada 30 minutos.
-- ---------------------------------------------------------------------------
select cron.schedule('bloquear-cedulas', '*/30 * * * *', $$
  select bloquear_cedulas_sin_confirmacion();
$$);

-- ---------------------------------------------------------------------------
-- 4. reservar_item: rechaza cédulas bloqueadas antes de verificar stock.
--    Cuerpo idéntico a 0020 salvo el chequeo inicial.
-- ---------------------------------------------------------------------------
drop function if exists reservar_item(uuid, int, jsonb, text);

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
  if exists (
    select 1 from cedulas_bloqueadas
    where cedula = recogida_data ->> 'cedula'
  ) then
    raise exception 'cedula_bloqueada';
  end if;

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

grant execute on function reservar_item(uuid, int, jsonb, text) to anon, authenticated;
