-- 0002_rls.sql
-- PanasAyudan — Row Level Security y privilegios de columna.
-- El contacto (phone/telegram) se oculta a nivel de columna; solo las RPC
-- SECURITY DEFINER (dueñas de la tabla) lo leen. Las RPC bypassean RLS.

-- Lee el header 'volunteer-token' que envía el frontend en cada request.
create or replace function current_volunteer_token()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.headers', true)::json ->> 'volunteer-token',
    ''
  )::uuid
$$;

-- Habilitar RLS en todas las tablas
alter table categories   enable row level security;
alter table locations    enable row level security;
alter table volunteers   enable row level security;
alter table aportes      enable row level security;
alter table aporte_items enable row level security;
alter table recogidas    enable row level security;

-- ---------------------------------------------------------------------------
-- categories: lectura pública, sin escritura pública
-- ---------------------------------------------------------------------------
revoke all on categories from anon, authenticated;
grant select on categories to anon, authenticated;

create policy categories_select_public
  on categories for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- locations: lectura pública; alta solo vía RPC crear_aporte (definer)
-- ---------------------------------------------------------------------------
revoke all on locations from anon, authenticated;
grant select on locations to anon, authenticated;

create policy locations_select_public
  on locations for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- volunteers: INSERT público (registro libre).
-- SELECT/UPDATE solo sobre la fila cuyo token coincide con el header.
-- ---------------------------------------------------------------------------
revoke all on volunteers from anon, authenticated;
grant insert (nombre, apellido, telefono, telegram, zona_descripcion)
  on volunteers to anon, authenticated;
grant select, update on volunteers to anon, authenticated;

create policy volunteers_insert_public
  on volunteers for insert
  to anon, authenticated
  with check (true);

create policy volunteers_select_own
  on volunteers for select
  to anon, authenticated
  using (token = current_volunteer_token());

create policy volunteers_update_own
  on volunteers for update
  to anon, authenticated
  using (token = current_volunteer_token())
  with check (token = current_volunteer_token());

-- ---------------------------------------------------------------------------
-- aportes: SELECT público SIN columnas de contacto.
-- El contacto se revela solo por RPC obtener_aporte_con_contacto.
-- ---------------------------------------------------------------------------
revoke all on aportes from anon, authenticated;
grant select (id, location_id, volunteer_id, status, created_at)
  on aportes to anon, authenticated;

create policy aportes_select_public
  on aportes for select
  to anon, authenticated
  using (status = 'activo');

-- ---------------------------------------------------------------------------
-- aporte_items: lectura pública del stock.
-- qty_disponible se modifica solo vía RPC (reservar/liberar), nunca directo.
-- ---------------------------------------------------------------------------
revoke all on aporte_items from anon, authenticated;
grant select on aporte_items to anon, authenticated;

create policy aporte_items_select_public
  on aporte_items for select
  to anon, authenticated
  using (qty_disponible > 0);

-- ---------------------------------------------------------------------------
-- recogidas: sin acceso directo público.
-- Alta vía RPC reservar_item; lectura/gestión vía RPC con token.
-- ---------------------------------------------------------------------------
revoke all on recogidas from anon, authenticated;
-- (sin policies para anon/authenticated => sin acceso directo; solo RPC)
