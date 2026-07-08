-- 0043_rango_voluntario_por_distancia.sql
-- Rango del voluntario por DISTANCIA en vez de adyacencia (issue #20, ajuste).
--
-- MOTIVO: en la zona de emergencia hay muchos municipios pequeños, así que
-- "municipio propio + colindantes" (0038) deja fuera puntos que en la práctica
-- están a un viaje razonable. El criterio operativo acordado es "no más de ~2 h
-- en auto", que aproximamos con un RADIO GEOGRÁFICO en línea recta desde el punto
-- del voluntario. Se resuelve 100% dentro de la RPC con PostGIS (ST_DWithin sobre
-- geography), sin API externa y SIN exponer ni guardar la ubicación: el punto
-- vive en una variable local y se descarta al terminar, igual que en 0038.
--
-- RADIO: 80 km en línea recta ≈ 2 h de manejo en carretera de emergencia
-- (velocidad efectiva baja, rutas sinuosas). Se define como constante local; para
-- ajustarlo basta cambiar v_radio_metros y reejecutar esta migración.
--
-- QUÉ NO CAMBIA: municipios_adyacentes y recalcular_adyacencias_municipios()
-- siguen existiendo (0038) pero ya NO gobiernan el rango del voluntario; quedan
-- disponibles por si otro flujo los necesita. listar_solicitudes_disponibles no
-- se toca: sigue marcando en_rango según voluntario_zonas, que ahora se puebla
-- por distancia. La UI (SolicitudesDisponibles.tsx) tampoco cambia.

set search_path = public, extensions;

-- Redefinición de la RPC. Misma firma y mismo contrato de retorno que 0038, salvo
-- que el arreglo de municipios de la zona pasa a llamarse `municipios_en_rango`
-- (antes `adyacentes`) porque ya no son solo colindantes.
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
  v_municipio_id     uuid;
  v_municipio_nombre text;
  v_punto            geometry;
  v_expira           timestamptz;
  v_radio_metros     double precision := 80000;  -- ~2 h en auto (línea recta).
begin
  select id into v_vol_id from volunteers where token = p_token and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'coordenadas_invalidas';
  end if;

  -- Punto local; se descarta al terminar la función (nunca se guarda).
  v_punto := st_setsrid(st_makepoint(p_lng, p_lat), 4326);

  -- Municipio que contiene el punto: solo para etiquetar la zona y validar que el
  -- voluntario está dentro de Venezuela. El rango NO depende de este municipio.
  select m.id, m.nombre into v_municipio_id, v_municipio_nombre
  from municipios m
  where st_contains(m.geom, v_punto)
  limit 1;

  if v_municipio_id is null then
    raise exception 'fuera_de_venezuela';
  end if;

  v_expira := now() + interval '24 hours';

  -- Reemplazo total de las zonas previas del voluntario.
  delete from voluntario_zonas where volunteer_id = v_vol_id;

  -- Zona = todos los municipios cuya geometría cae dentro del radio del punto
  -- (distancia real en metros sobre geography). Incluye siempre al municipio que
  -- lo contiene (distancia 0).
  insert into voluntario_zonas (volunteer_id, municipio_id, expira_at)
  select v_vol_id, m.id, v_expira
  from municipios m
  where st_dwithin(m.geom::geography, v_punto::geography, v_radio_metros);

  return json_build_object(
    'municipio',    v_municipio_nombre,
    'municipio_id', v_municipio_id,
    'expira_at',    v_expira,
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
