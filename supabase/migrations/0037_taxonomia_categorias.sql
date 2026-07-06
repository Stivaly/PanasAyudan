-- 0037_taxonomia_categorias.sql
-- Issue #30 — Taxonomía fija de categorías: 10 macrocategorías definidas por el
-- sistema + subcategorías por macro. Prerequisito de #22 (inventario por nodo) y
-- #24 (vista pública con etiquetas).
--
-- El seed vigente (0001) tenía 7 categorías planas sin subcategorías, y el módulo
-- de solicitudes (0032) usa solicitudes.subcategoria como texto libre sin
-- validación. Esta migración:
--   1. Migra el seed de categories a las 10 macro (renombres por id, sin romper
--      FKs: aporte_items y solicitudes referencian categories.id, no el slug).
--   2. Crea subcategories (FK -> categories) con RLS SELECT público de solo
--      lectura, y siembra las subcategorías de definicion.md.
--   3. Agrega solicitudes.subcategory_id (FK -> subcategories) con backfill
--      best-effort desde el texto libre; subcategoria text se mantiene como
--      legado hasta que #22 lo retire.
--   4. Actualiza crear_solicitud para persistir subcategory_id validado.
--
-- Idempotente (if not exists / on conflict / where slug=...), RLS explícita.

-- ===========================================================================
-- 1. Migración del seed de categories a las 10 macrocategorías.
--    Renombres por id (no se toca la PK): las FKs existentes (aporte_items,
--    solicitudes) siguen apuntando a la misma fila, sin quedar huérfanas.
--    'agua', 'medicinas' y 'otro' conservan su slug. 'higiene' se convierte en
--    'higiene-personal' (los aporte_items de higiene quedan reasignados a
--    higiene-personal, como pide el issue).
-- ===========================================================================
update categories set name = 'Alimentación',          slug = 'alimentacion'          where slug = 'comida';
update categories set name = 'Ropa y abrigo',          slug = 'ropa-abrigo'           where slug = 'ropa';
update categories set name = 'Herramientas y rescate', slug = 'herramientas-rescate'  where slug = 'herramientas';
update categories set name = 'Higiene personal',       slug = 'higiene-personal'      where slug = 'higiene';

insert into categories (name, slug) values
  ('Higiene sanitaria', 'higiene-sanitaria'),
  ('Comunicación',      'comunicacion'),
  ('Transporte',        'transporte')
on conflict (slug) do nothing;

-- ===========================================================================
-- 2. Tabla subcategories.
-- ===========================================================================
create table if not exists subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name        text not null,
  slug        text not null,
  unique (category_id, slug)
);

create index if not exists idx_subcategories_category on subcategories(category_id);

-- ===========================================================================
-- 3. Seed de subcategorías (fijas, definidas por el sistema — definicion.md).
--    Se resuelve el category_id por slug de la macro, así el seed no depende de
--    ids concretos. on conflict (category_id, slug) do nothing => idempotente.
-- ===========================================================================
insert into subcategories (category_id, name, slug)
select c.id, v.name, v.slug
from (values
  ('agua',                 'Agua potable',                'agua-potable'),
  ('agua',                 'Agua para higiene',           'agua-higiene'),
  ('agua',                 'Soluciones de rehidratación', 'rehidratacion'),

  ('alimentacion',         'Comida preparada',            'comida-preparada'),
  ('alimentacion',         'No perecederos',              'no-perecederos'),
  ('alimentacion',         'Fórmula infantil',            'formula-infantil'),
  ('alimentacion',         'Alimentación especial',       'alimentacion-especial'),

  ('medicinas',            'Medicamentos generales',      'medicamentos-generales'),
  ('medicinas',            'Crónicos',                    'cronicos'),
  ('medicinas',            'Sueros e inyectables',        'sueros-inyectables'),
  ('medicinas',            'Material de curación',        'material-curacion'),
  ('medicinas',            'Equipos médicos',             'equipos-medicos'),

  ('higiene-personal',     'Jabón',                       'jabon'),
  ('higiene-personal',     'Champú',                      'champu'),
  ('higiene-personal',     'Cepillo dental',              'cepillo-dental'),
  ('higiene-personal',     'Protector solar',             'protector-solar'),
  ('higiene-personal',     'Repelente',                   'repelente'),
  ('higiene-personal',     'Pañales',                     'panales'),
  ('higiene-personal',     'Toallas sanitarias',          'toallas-sanitarias'),

  ('higiene-sanitaria',    'Bolsas de basura',            'bolsas-basura'),
  ('higiene-sanitaria',    'Desinfectante',               'desinfectante'),
  ('higiene-sanitaria',    'Baños portátiles',            'banos-portatiles'),

  ('ropa-abrigo',          'Ropa adulto',                 'ropa-adulto'),
  ('ropa-abrigo',          'Ropa infantil',               'ropa-infantil'),
  ('ropa-abrigo',          'Calzado',                     'calzado'),
  ('ropa-abrigo',          'Frazadas',                    'frazadas'),

  ('herramientas-rescate', 'Herramientas manuales',       'herramientas-manuales'),
  ('herramientas-rescate', 'Equipos de corte',            'equipos-corte'),
  ('herramientas-rescate', 'Generadores',                 'generadores'),
  ('herramientas-rescate', 'Linternas',                   'linternas'),
  ('herramientas-rescate', 'Pilas',                       'pilas'),

  ('comunicacion',         'Starlink',                    'starlink'),
  ('comunicacion',         'Radios',                      'radios'),
  ('comunicacion',         'Cargadores',                  'cargadores'),
  ('comunicacion',         'Baterías externas',           'baterias-externas'),

  ('transporte',           'Vehículos disponibles',       'vehiculos-disponibles'),
  ('transporte',           'Combustible',                 'combustible'),

  ('otro',                 'Otro',                        'otro')
) as v(cat_slug, name, slug)
join categories c on c.slug = v.cat_slug
on conflict (category_id, slug) do nothing;

-- ===========================================================================
-- 4. RLS de subcategories: solo lectura pública (sin INSERT/UPDATE/DELETE anon).
--    Mismo patrón que categories/estados: catálogo fijo del sistema.
-- ===========================================================================
alter table subcategories enable row level security;
revoke all on subcategories from anon, authenticated;
grant select on subcategories to anon, authenticated;

drop policy if exists subcategories_select_public on subcategories;
create policy subcategories_select_public
  on subcategories for select
  to anon, authenticated
  using (true);

-- ===========================================================================
-- 5. solicitudes.subcategory_id (FK -> subcategories).
--    subcategoria text se conserva como legado (lo consume listar_solicitudes_*
--    hoy). Backfill best-effort por match de nombre o slug dentro de la misma
--    categoría; lo que no matchee queda en null sin bloquear.
-- ===========================================================================
alter table solicitudes
  add column if not exists subcategory_id uuid references subcategories(id);

update solicitudes s
set subcategory_id = sub.id
from subcategories sub
where s.subcategory_id is null
  and nullif(trim(s.subcategoria), '') is not null
  and sub.category_id = s.category_id
  and (lower(trim(s.subcategoria)) = lower(sub.name)
       or lower(trim(s.subcategoria)) = sub.slug);

-- ===========================================================================
-- 6. crear_solicitud: persiste subcategory_id validado (debe pertenecer a la
--    categoría de la solicitud). Mantiene subcategoria text sincronizada con el
--    nombre de la subcategoría elegida, para que las lecturas legadas
--    (listar_solicitudes_disponibles / listar_solicitudes_nodo, que leen
--    s.subcategoria) sigan mostrando la etiqueta sin cambios. Si no se envía
--    subcategory_id, cae al texto libre p_datos->>'subcategoria' (compat #19).
-- ===========================================================================
create or replace function crear_solicitud(
  p_node_id     uuid,
  p_datos       jsonb,
  p_token_admin uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id         uuid;
  v_category_id    uuid    := nullif(p_datos ->> 'category_id', '')::uuid;
  v_magnitud       text    := nullif(p_datos ->> 'magnitud', '');
  v_subcategory_id uuid    := nullif(p_datos ->> 'subcategory_id', '')::uuid;
  v_subcategoria   text    := nullif(p_datos ->> 'subcategoria', '');
  v_sub_cat_id     uuid;
  v_sub_name       text;
  v_requiere_veh   boolean := coalesce((p_datos ->> 'requiere_vehiculo')::boolean, false);
  v_solicitud_id   uuid;
begin
  select id into v_vol_id from volunteers where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if not es_miembro_nodo_token(p_node_id, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  if v_category_id is null or not exists (select 1 from categories where id = v_category_id) then
    raise exception 'La categoría de la solicitud no es válida.';
  end if;
  if v_magnitud is null or magnitud_orden(v_magnitud) = 0 then
    raise exception 'La magnitud de la solicitud no es válida.';
  end if;

  -- La subcategoría (si se envía) debe existir y pertenecer a la categoría.
  if v_subcategory_id is not null then
    select id, name into v_sub_cat_id, v_sub_name
    from subcategories where id = v_subcategory_id and category_id = v_category_id;
    if v_sub_cat_id is null then
      raise exception 'La subcategoría no pertenece a la categoría seleccionada.';
    end if;
    -- Sincroniza el texto legado con el nombre real de la subcategoría.
    v_subcategoria := v_sub_name;
  end if;

  insert into solicitudes
    (node_id_origen, category_id, subcategory_id, subcategoria, magnitud, requiere_vehiculo, status)
  values
    (p_node_id, v_category_id, v_subcategory_id, v_subcategoria, v_magnitud, v_requiere_veh, 'abierta')
  returning id into v_solicitud_id;

  return v_solicitud_id;
end;
$$;

grant execute on function crear_solicitud(uuid, jsonb, uuid) to anon, authenticated;
