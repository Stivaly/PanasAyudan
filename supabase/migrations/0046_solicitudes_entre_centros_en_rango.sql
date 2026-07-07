-- 0046_solicitudes_entre_centros_en_rango.sql
-- Permite que un admin vea solicitudes de otros centros dentro de un rango
-- operativo maximo de 650 km. La app no tiene matriz de rutas por carretera, asi
-- que se usa distancia en linea recta con PostGIS.

set search_path = public, extensions;

create or replace function listar_solicitudes_para_nodo(
  p_node_id     uuid,
  p_token_admin uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_lat           double precision;
  v_lng           double precision;
  v_origen        geography;
  v_radio_metros  double precision := 650000; -- rango operativo maximo de 650 km.
begin
  if not es_miembro_nodo_token(p_node_id, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  select lat, lng into v_lat, v_lng
  from centros_acopio
  where id = p_node_id;

  if v_lat is null or v_lng is null then
    return '[]'::json;
  end if;

  v_origen := st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography;

  return (
    select coalesce(json_agg(to_json(t) order by t.created_at desc), '[]'::json)
    from (
      select
        s.id,
        s.node_id_origen,
        ca.nombre as nodo_nombre,
        s.category_id,
        c.name as category_name,
        s.subcategoria,
        s.magnitud,
        s.requiere_vehiculo,
        s.status,
        greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) as sobrante,
        round((
          st_distance(
            v_origen,
            st_setsrid(st_makepoint(ca.lng, ca.lat), 4326)::geography
          ) / 1000
        )::numeric, 1) as distancia_km,
        s.created_at
      from solicitudes s
      join categories c on c.id = s.category_id
      join centros_acopio ca on ca.id = s.node_id_origen
      where s.node_id_origen <> p_node_id
        and s.status in ('abierta','parcial','inventario_asegurado')
        and greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) > 0
        and ca.lat is not null
        and ca.lng is not null
        and coalesce(ca.activo, true) = true
        and coalesce(ca.status, 'activo') <> 'cerrado'
        and st_dwithin(
          v_origen,
          st_setsrid(st_makepoint(ca.lng, ca.lat), 4326)::geography,
          v_radio_metros
        )
    ) t
  );
end;
$$;

grant execute on function listar_solicitudes_para_nodo(uuid, uuid) to anon, authenticated;
