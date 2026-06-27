-- 0001_schema.sql
-- PanasAyudan — esquema base
-- Orden de tablas respeta dependencias FK.

create extension if not exists "pgcrypto";

-- 1. categories
create table categories (
  id   uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null
);

insert into categories (name, slug) values
  ('Agua',         'agua'),
  ('Comida',       'comida'),
  ('Medicinas',    'medicinas'),
  ('Higiene',      'higiene'),
  ('Ropa',         'ropa'),
  ('Herramientas', 'herramientas'),
  ('Otro',         'otro');

-- 2. locations
create table locations (
  id              uuid primary key default gen_random_uuid(),
  google_place_id text unique not null,
  place_name      text not null,
  lat             double precision not null,
  lng             double precision not null,
  address         text,
  created_at      timestamptz not null default now()
);

-- 3. volunteers
create table volunteers (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  apellido         text not null,
  telefono         text,
  telegram         text,
  zona_descripcion text,
  token            uuid unique not null default gen_random_uuid(),
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- 4. aportes
create table aportes (
  id               uuid primary key default gen_random_uuid(),
  location_id      uuid not null references locations(id) on delete cascade,
  volunteer_id     uuid references volunteers(id) on delete set null,
  contact_phone    text,
  contact_telegram text,
  status           text not null default 'activo' check (status in ('activo','cerrado')),
  created_at       timestamptz not null default now(),
  constraint aportes_contacto_min check (
    contact_phone is not null or contact_telegram is not null
  )
);

-- 5. aporte_items
create table aporte_items (
  id             uuid primary key default gen_random_uuid(),
  aporte_id      uuid not null references aportes(id) on delete cascade,
  category_id    uuid not null references categories(id),
  descripcion    text not null,
  qty_approx     int not null check (qty_approx >= 0),
  qty_disponible int not null check (qty_disponible >= 0)
);

-- 6. recogidas
create table recogidas (
  id             uuid primary key default gen_random_uuid(),
  aporte_item_id uuid not null references aporte_items(id) on delete cascade,
  volunteer_id   uuid references volunteers(id) on delete set null,
  nombre         text not null,
  apellido       text not null,
  cedula         text not null,
  placa_vehiculo text,
  qty_a_buscar   int not null check (qty_a_buscar > 0),
  status         text not null default 'pendiente'
                 check (status in ('pendiente','completada','cancelada')),
  reserved_until timestamptz not null default (now() + interval '4 hours'),
  created_at     timestamptz not null default now()
);

-- índices para consultas frecuentes
create index idx_aportes_location          on aportes(location_id);
create index idx_aportes_status            on aportes(status);
create index idx_aporte_items_aporte       on aporte_items(aporte_id);
create index idx_aporte_items_category     on aporte_items(category_id);
create index idx_aporte_items_disponible   on aporte_items(qty_disponible);
create index idx_recogidas_item            on recogidas(aporte_item_id);
create index idx_recogidas_status          on recogidas(status);
create index idx_recogidas_reserved_until  on recogidas(reserved_until);
