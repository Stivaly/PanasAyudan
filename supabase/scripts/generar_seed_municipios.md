# Seed de municipios (ADM2) de Venezuela — issue #20

`0038_municipios_gps.sql` crea el esquema (`municipios`, `municipios_adyacentes`,
`voluntario_zonas`) y las RPC, pero **NO** trae las geometrías: los ~335
municipios se generan desde una fuente oficial y se cargan como un seed aparte.
La migración es segura de aplicar antes de este seed (con `municipios` vacío todo
degrada a `en_rango=false`, sin errores).

**No editar geometrías a mano.** Se generan con GDAL desde el GeoJSON de HDX/OCHA.

## Fuente

- Dataset: *Venezuela - Subnational Administrative Boundaries* (HDX / OCHA COD-AB).
  - https://data.humdata.org/dataset/cod-ab-ven
  - Descargar la capa **ADM2** (municipios) en GeoJSON, SRID 4326 (WGS84).
- Campos relevantes del GeoJSON. En la versión descargada (HDX COD-AB, 335
  features, SRID 4326) las columnas reales son **minúsculas**:
  `adm2_name` (municipio), `adm1_name` (estado), `adm2_pcode` (código ADM2).
  Los 24 valores de `adm1_name` calzan 1:1 con `estados.nombre` — incluido
  `La Guaira` (no `Vargas`).

## Requisitos

- GDAL (`ogr2ogr`) instalado.
- Acceso a la BD (usar la `DATABASE_URL` / connection string de Supabase).

## 1. Convertir el GeoJSON a INSERTs SQL

`ogr2ogr` emite un dump PGDUMP que crea la tabla staging `municipios_seed_raw`.
El dump ya está generado en `supabase/scripts/municipios_seed_raw.sql` (335 INSERTs,
~12 MB). El comando exacto (conda env `geo`, GDAL 3.13):

```bash
ogr2ogr \
  -f PGDUMP supabase/scripts/municipios_seed_raw.sql \
  ven_admin2.geojson \
  -nln municipios_seed_raw \
  -lco GEOMETRY_NAME=geom \
  -lco SRID=4326 \
  -lco SCHEMA=public \
  -nlt MULTIPOLYGON \
  -lco LAUNDER=NO
```

`LAUNDER=NO` preserva los nombres de columna del GeoJSON tal cual (`adm2_name`,
`adm1_name`, …). Es staging, NO la tabla final: se usa para insertar en
`municipios` mapeando el estado por nombre y luego se descarta.

## 2. Cargar staging + poblar `municipios` mapeando el estado

Aplica el dump staging (`municipios_seed_raw.sql`) y luego este bloque, disponible
ya listo en `supabase/scripts/poblar_municipios.sql`:

```sql
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
```

> `unaccent` requiere `create extension if not exists unaccent with schema extensions;`
> Si no quieres habilitarla, mapea el estado con una tabla de equivalencias manual
> nombre→estado_id; el resto del flujo no cambia.

## 3. Verificar

```sql
select count(*) from municipios;               -- ~335
select count(*) from municipios_adyacentes;    -- > 0, simétrico
-- Punto dentro de Chacao (Caracas) debe resolver a Chacao:
select verificar_ubicacion_voluntario(
  (select token from volunteers limit 1),
  10.4977, -66.8536
);
```

## 4. Backfill de nodos existentes

`0038` ya intenta el backfill de `centros_acopio.municipio_id`, pero corrió con
`municipios` vacío. Vuelve a ejecutarlo tras cargar el seed:

```sql
update centros_acopio c
set municipio_id = m.id
from municipios m
where c.municipio_id is null
  and c.lat is not null and c.lng is not null
  and st_contains(m.geom, st_setsrid(st_makepoint(c.lng, c.lat), 4326));
```

Los nodos nuevos ya lo obtienen automáticamente al pasar por `verificar_nodo`.
