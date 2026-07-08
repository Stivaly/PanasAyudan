-- poblar_municipios.sql — issue #20
-- Paso 2 del seed de municipios (ADM2). Se ejecuta DESPUÉS de:
--   1) aplicar la migración 0038_municipios_gps.sql (habilita PostGIS y crea
--      municipios / municipios_adyacentes / voluntario_zonas), y
--   2) cargar el staging municipios_seed_raw.sql (dump PGDUMP del GeoJSON HDX,
--      335 filas en la tabla public.municipios_seed_raw).
--
-- Mapea el estado por nombre, carga las geometrías en `municipios`, descarta el
-- staging y recomputa adyacencias. Idempotente respecto de reejecuciones: vuelve
-- a partir de staging limpio; si municipios ya tiene datos, hazle TRUNCATE antes.

-- unaccent vive en el schema `extensions` en Supabase (igual que PostGIS).
create extension if not exists unaccent with schema extensions;
set search_path = public, extensions;

-- Inserta municipios resolviendo estado_id por nombre (unaccent + lower para
-- tolerar acentos/casing). estado_id queda NULL si no hay match (aceptable).
insert into municipios (nombre, estado_id, geom)
select
  r.adm2_name,
  e.id,
  st_multi(st_makevalid(r.geom))::geometry(MultiPolygon, 4326)
from municipios_seed_raw r
left join estados e
  on lower(unaccent(e.nombre)) = lower(unaccent(r.adm1_name));

drop table municipios_seed_raw;

-- Precalcular adyacencias (ST_Touches) sobre el seed ya cargado.
select recalcular_adyacencias_municipios();

-- Backfill de nodos existentes: 0038 corrió con municipios vacío, se repite ahora.
update centros_acopio c
set municipio_id = m.id
from municipios m
where c.municipio_id is null
  and c.lat is not null and c.lng is not null
  and st_contains(m.geom, st_setsrid(st_makepoint(c.lng, c.lat), 4326));

-- Verificación rápida (deberían dar ~335 y > 0).
-- select count(*) from municipios;
-- select count(*) from municipios_adyacentes;
