-- 0060_publicos_filtros_metricas_nodos.sql
-- Lecturas publicas robustas para /buscar y metricas de impacto del modelo de
-- nodos. Evita depender de filtros embebidos de PostgREST sobre node_inventory.

set search_path = public;

create or replace function listar_nodos_publicos()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(json_agg(to_json(t) order by t.nombre), '[]'::json)
  from (
    select
      ca.id,
      ca.nombre,
      ca.tipo,
      ca.direccion,
      ca.estado_id,
      ca.horario,
      ca.lat,
      ca.lng,
      ca.status,
      ca.pausado_recepcion,
      ca.pausado_entrega,
      coalesce((
        select json_agg(distinct jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'slug', c.slug
        ) order by jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'slug', c.slug
        ))
        from node_inventory ni
        join categories c on c.id = ni.category_id
        where ni.node_id = ca.id
          and ni.disponible = true
      ), '[]'::json) as categorias
    from centros_acopio ca
    where ca.status in ('activo','pausado')
      and ca.verificado_at is not null
      and coalesce(ca.activo, true) = true
  ) t;
$$;

grant execute on function listar_nodos_publicos() to anon, authenticated;

create or replace function get_estadisticas_impacto()
returns json
language sql
security definer
set search_path = public
as $$
  with entregas_nuevas as (
    select coalesce(sum(cv.cantidad), 0)::int as qty, count(*)::int as n
    from compromisos_voluntario cv
    where cv.status = 'completado'
  ),
  entregas_centros as (
    select coalesce(sum(cn.cantidad), 0)::int as qty, count(*)::int as n
    from compromisos_nodo cn
    where cn.status = 'entregado'
  ),
  solicitudes_vivas as (
    select count(*)::int as n
    from solicitudes
    where status in ('abierta','parcial','inventario_asegurado','en_camino')
  )
  select json_build_object(
    'total_recogidas_completadas',
      (select n from entregas_nuevas) + (select n from entregas_centros),
    'total_recogidas_confirmadas',
      (select n from entregas_nuevas) + (select n from entregas_centros),
    'total_qty_coordinada',
      (select qty from entregas_nuevas) + (select qty from entregas_centros),
    'total_aportes_activos',
      (select n from solicitudes_vivas),
    'lugares_activos',
      (select count(*) from centros_acopio
       where status in ('activo','pausado')
         and verificado_at is not null
         and coalesce(activo, true) = true)
  );
$$;

grant execute on function get_estadisticas_impacto() to anon, authenticated;
