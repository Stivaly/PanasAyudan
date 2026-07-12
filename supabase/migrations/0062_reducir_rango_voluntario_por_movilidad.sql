-- 0062_reducir_rango_voluntario_por_movilidad.sql
-- Reduce el rango operativo del voluntario (issue #83, ligado a las
-- optimizaciones de Realtime en curso):
--   * con vehiculo registrado: maximo 40 km (antes 650 km)
--   * sin vehiculo (a pie):    maximo 15 km (antes 300 km)
--
-- MOTIVO: la opcion elegida para filtrar la suscripcion Realtime de
-- solicitudes/compromisos_nodo por relevancia geografica es una lista de IDs
-- de nodo dentro del rango del voluntario (voluntario_zonas). Con un radio de
-- 650/300 km, esa lista terminaba incluyendo virtualmente todo el pais,
-- volviendo el filtro inutil (equivalente a no filtrar). Un radio realista
-- para "cuanto puede recorrer una persona para retirar/entregar insumos"
-- (40 km en auto, 15 km a pie) hace que la lista de nodos relevantes sea
-- efectivamente chica, que es precondicion para que el filtro de Realtime
-- reduzca trafico de verdad.

set search_path = public, extensions;

create or replace function verificar_ubicacion_voluntario(
  p_token uuid,
  p_lat   float,
  p_lng   float
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_vol_id           uuid;
  v_tiene_vehiculo   boolean;
  v_municipio_id     uuid;
  v_municipio_nombre text;
  v_punto            geometry;
  v_expira           timestamptz;
  v_radio_metros     double precision;
begin
  select id, tiene_vehiculo
  into v_vol_id, v_tiene_vehiculo
  from volunteers
  where token = p_token
    and activo = true;

  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'coordenadas_invalidas';
  end if;

  v_radio_metros := case when coalesce(v_tiene_vehiculo, false) then 40000 else 15000 end;
  v_punto := st_setsrid(st_makepoint(p_lng, p_lat), 4326);

  select m.id, m.nombre
  into v_municipio_id, v_municipio_nombre
  from municipios m
  where st_contains(m.geom, v_punto)
  limit 1;

  if v_municipio_id is null then
    raise exception 'fuera_de_venezuela';
  end if;

  v_expira := now() + interval '24 hours';

  delete from voluntario_zonas where volunteer_id = v_vol_id;

  insert into voluntario_zonas (volunteer_id, municipio_id, expira_at)
  select v_vol_id, m.id, v_expira
  from municipios m
  where st_dwithin(m.geom::geography, v_punto::geography, v_radio_metros);

  return json_build_object(
    'municipio', v_municipio_nombre,
    'municipio_id', v_municipio_id,
    'expira_at', v_expira,
    'radio_km', (v_radio_metros / 1000)::int,
    'municipios_en_rango', coalesce((
      select json_agg(m.nombre order by m.nombre)
      from voluntario_zonas vz
      join municipios m on m.id = vz.municipio_id
      where vz.volunteer_id = v_vol_id
    ), '[]'::json)
  );
end;
$$;

grant execute on function verificar_ubicacion_voluntario(uuid, float, float) to anon, authenticated;
