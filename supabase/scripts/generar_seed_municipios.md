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
- Campos relevantes del GeoJSON (nombres exactos según la versión que descargues,
  suelen ser `ADM2_ES`/`ADM2_PCODE` para el municipio y `ADM1_ES` para el estado).

## Requisitos

- GDAL (`ogr2ogr`) instalado.
- Acceso a la BD (usar la `DATABASE_URL` / connection string de Supabase).

## 1. Convertir el GeoJSON a INSERTs SQL

`ogr2ogr` puede emitir SQL directamente contra el esquema `municipios`. Genera un
archivo `0039_seed_municipios.sql` (siguiente número de migración libre):

```bash
# ven_adm2.geojson = la capa ADM2 descargada de HDX.
ogr2ogr \
  -f PGDUMP /tmp/municipios_raw.sql \
  ven_adm2.geojson \
  -nln municipios_seed_raw \
  -lco GEOMETRY_NAME=geom \
  -lco SRID=4326 \
  -nlt MULTIPOLYGON \
  -lco LAUNDER=NO
```

Esto crea una tabla staging `municipios_seed_raw` con la geometría y todas las
columnas del GeoJSON. No cargues eso como tabla final: úsala como staging para
insertar en `municipios` mapeando el estado por nombre.

## 2. Cargar staging + poblar `municipios` mapeando el estado

Aplica el dump staging y luego este bloque (ajusta `ADM2_ES`/`ADM1_ES` a los
nombres reales de columna del GeoJSON descargado):

```sql
-- Inserta municipios resolviendo estado_id por nombre (unaccent + lower para
-- tolerar acentos/casing). estado_id queda NULL si no hay match (aceptable).
insert into municipios (nombre, estado_id, geom)
select
  r."ADM2_ES",
  e.id,
  st_multi(st_makevalid(r.geom))::geometry(MultiPolygon, 4326)
from municipios_seed_raw r
left join estados e
  on lower(unaccent(e.nombre)) = lower(unaccent(r."ADM1_ES"));

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
